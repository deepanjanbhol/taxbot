/**
 * ai-extractor.ts
 *
 * Claude-powered tax document extraction.
 * Replaces brittle regexes with an AI orchestrator that reads raw document
 * text and calls the `record_tax_field` tool for every dollar value it finds.
 *
 * Architecture:
 *   1. All scanned docs → Claude (haiku, fast + cheap)
 *   2. Claude calls record_tax_field once per field per document
 *   3. We accumulate the values and build TaxInputData
 *   4. Full extraction log is returned for display in the dashboard
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TaxInputData } from "./form-generator.js";
import type { FilingStatus } from "../utils/tax-calculator.js";

// ── Field registry ─────────────────────────────────────────────────────────────

/** Every numeric TaxInputData field Claude can extract, with its IRS source. */
const FIELD_DESCRIPTIONS: Record<string, string> = {
  wages:                       "W-2 Box 1 — wages, tips, other compensation",
  federalWithholding:          "W-2 Box 2 — federal income tax withheld",
  tipIncome:                   "W-2 Box 7 or separate — tips received",
  overtimePay:                 "W-2 or pay stub — overtime pay",
  interest:                    "1099-INT Box 1 — interest income (SUM across all 1099-INTs)",
  ordinaryDividends:           "1099-DIV Box 1a — total ordinary dividends (SUM across all 1099-DIVs)",
  qualifiedDividends:          "1099-DIV Box 1b — qualified dividends (SUM across all 1099-DIVs)",
  ltcg:                        "1099-DIV Box 2a or 1099-B long-term gains — long-term capital gains (SUM)",
  stcg:                        "1099-B short-term proceeds minus cost basis — short-term capital gains/losses",
  businessIncome:              "1099-NEC Box 1 or Schedule C net profit — nonemployee comp / self-employment income",
  rentalIncome:                "Schedule E — net rental income (or loss as negative) or K-1 Box 2",
  royaltyIncome:               "1099-MISC Box 2 — royalties (books, minerals, IP licensing)",
  unemploymentComp:            "1099-G Box 1 — unemployment compensation",
  socialSecurity:              "SSA-1099 Box 5 — net Social Security benefits received",
  retirementDist:              "1099-R Box 2a — taxable amount of IRA/pension/annuity distributions",
  otherIncome:                 "1099-MISC Box 3/7, 1099-K gross receipts, K-1 other income, or any other taxable income",
  studentLoanInterest:         "1098-E Box 1 — student loan interest paid",
  educatorExpenses:            "Receipts — educator out-of-pocket classroom expenses (max $300 per educator)",
  hsaDeduction:                "Form 8889 / W-2 Box 12 Code W — HSA contributions",
  selfEmployedHealthInsurance: "Schedule C or self-employed records — health insurance premiums paid",
  iraDeduction:                "Form 5498 or bank records — traditional IRA contribution deduction",
  otherAdjustments:            "Any other above-the-line adjustments not listed above",
  mortgageInterest:            "1098 Box 1 — mortgage interest paid (SUM if multiple properties)",
  saltPaid:                    "State/local tax records — state & local income or sales taxes paid (Schedule A)",
  charitableCash:              "Receipts/bank records — cash charitable contributions (Schedule A)",
  charitableNonCash:           "Form 8283 — non-cash charitable contributions (Schedule A)",
  medicalExpenses:             "Receipts — total medical & dental expenses paid (before 7.5% AGI floor is applied)",
  carLoanInterest:             "Loan statement — car loan interest on a qualifying US-made vehicle",
  childTaxCredit:              "Override only — computed automatically from dependent count; set only if you have a specific known amount",
  educationCredit:             "1098-T Box 1 — tuition paid; used to estimate American Opportunity or Lifetime Learning credit",
  estimatedTaxPayments:        "Form 1040-ES vouchers or bank records — quarterly estimated tax payments made",
};

// ── Tool definition ────────────────────────────────────────────────────────────

const RECORD_FIELD_TOOL: Anthropic.Tool = {
  name: "record_tax_field",
  description:
    "Record a single tax field value found in a document. " +
    "Call this once per field per document. " +
    "When the same field appears in multiple separate documents (e.g. three different 1099-INTs), " +
    "use operation='add' so all values are summed. " +
    "If a PRELIMINARY and a FINAL version of the same document exist with nearly identical values, " +
    "only record the FINAL version.",
  input_schema: {
    type: "object" as const,
    properties: {
      field: {
        type: "string",
        description: `The TaxInputData field name. Must be one of: ${Object.keys(FIELD_DESCRIPTIONS).join(", ")}`,
      },
      amount: {
        type: "number",
        description: "Dollar amount as a positive number. Never negative.",
      },
      docName: {
        type: "string",
        description: "Filename of the document this value was extracted from.",
      },
      boxLabel: {
        type: "string",
        description: "The box / line label on the form, e.g. 'Box 1', '1a Total Ordinary Dividends', 'Box 2'.",
      },
      operation: {
        type: "string",
        enum: ["set", "add"],
        description:
          "'set' if this is the only document for this field. " +
          "'add' if other documents also contribute to this field (e.g. multiple 1099-INTs).",
      },
      note: {
        type: "string",
        description: "Optional note, e.g. 'PRELIMINARY — used because no final version found' or 'Skipped duplicate'.",
      },
    },
    required: ["field", "amount", "docName", "boxLabel", "operation"],
  },
};

// ── System prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(taxYear: number): string {
  const fieldList = Object.entries(FIELD_DESCRIPTIONS)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  return `You are a US federal income tax data extractor for tax year ${taxYear}.
You will receive raw text extracted from one or more tax documents.
Your task is to call the record_tax_field tool for every dollar value that belongs on Form 1040.

FIELD REFERENCE (field name → IRS source):
${fieldList}

EXTRACTION RULES:
1. Call record_tax_field once per field per document. Never skip a value you can read.
2. For fields that appear in multiple documents (interest, dividends) use operation="add" to accumulate.
3. DEDUPLICATION: If you see both a PRELIMINARY and a FINAL/CONSOLIDATED version of the same brokerage
   account with nearly identical values (within $5), skip the PRELIMINARY — add a note explaining this.
4. W-2 SPECIAL CASE: PDFs often concatenate box values on one line without separators.
   "485515.83106398.13" means Box 1 (wages) = 485515.83 and Box 2 (withholding) = 106398.13.
   The pattern is: first large decimal = Box 1, second large decimal on the same line = Box 2.
5. 1099-DIV FORMAT: Values use dot-leader format: "1a Total Ordinary Dividends............10,230.21"
   Extract the number after the dots.
6. 1099-INT CHASE FORMAT: The total interest appears after "Summary of Form 1099-INT: Interest Income".
7. 1098 MORTGAGE: The first dollar amount (Box 1) is mortgage interest. The second large number is
   outstanding principal (NOT deductible — do not record it).
8. 1099-MISC: Box 2 = royaltyIncome. Box 3 / Box 7 / other amounts = otherIncome. Record each separately.
9. 1099-K: Records gross payment card / third-party network receipts. This is gross revenue, NOT profit.
   Map to otherIncome with a note: "1099-K gross receipts — actual taxable income may be lower after expenses".
10. 1098-T TUITION: Box 1 = amounts billed/paid for qualified tuition. Map to educationCredit (the field
    name represents tuition paid as input; the actual credit will be estimated at ~$2,500 max for AOTC or
    $2,000 for LLC). Add a note with the actual box amount.
11. K-1 (SCHEDULE K-1): Extract by box number:
    - Box 1 (Ordinary business income/loss) → businessIncome (may be negative — use a negative amount)
    - Box 2 (Net rental real estate income/loss) → rentalIncome (may be negative)
    - Box 5 (Interest income) → interest
    - Box 6a (Ordinary dividends) → ordinaryDividends
    - Box 9a (Net long-term capital gain/loss) → ltcg (may be negative)
    - Box 14 code A (Net earnings from self-employment) → businessIncome (use operation="add")
    - Other boxes → otherIncome with a note identifying the K-1 box
12. 1099-R: Only record Box 2a (taxable amount). If Box 2a is blank but Box 1 (gross distribution) is
    present and Box 7 distribution code is "7" (normal), use Box 1. If code is "G" (direct rollover),
    skip entirely (rollovers are not taxable).
13. CAPITAL GAINS from 1099-B or brokerage consolidated statements:
    - Short-term gains/losses (held ≤ 1 year) → stcg. May be negative for losses.
    - Long-term gains/losses (held > 1 year) → ltcg. May be negative for losses.
    - If the statement shows a single "total gain/loss" without split, use ltcg with a note.
14. AMOUNTS MAY BE NEGATIVE for: rentalIncome (rental losses), stcg/ltcg (capital losses),
    businessIncome (business losses), K-1 box 1 or 2 losses. Use the absolute value in amount and
    add a note "loss — reported as negative". The system will handle negatives for these fields.
15. Only record values explicitly stated in the document text — do not estimate or infer.
16. When finished with all documents, stop (do not call any more tools).`;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ExtractionLogEntry {
  field:    string;
  amount:   number;
  docName:  string;
  boxLabel: string;
  note?:    string;
}

export interface AIExtractionResult {
  taxInput:      TaxInputData;
  extractionLog: ExtractionLogEntry[];
  warnings:      string[];
  /** Total Claude API tokens used (for transparency) */
  tokensUsed:    number;
}

// ── Main extractor ─────────────────────────────────────────────────────────────

export async function extractTaxDataWithAI(
  docs: Array<{ filename: string; type: string; content: string }>,
  taxYear: number,
  apiKey: string,
  onProgress: (msg: string) => void
): Promise<AIExtractionResult> {

  const client = new Anthropic({ apiKey });

  // Truncate each document to keep the prompt manageable.
  // The relevant numbers are almost always in the first 4 KB of text.
  const docTexts = docs.map(d => {
    const preview = d.content.length > 4000
      ? d.content.slice(0, 4000) + "\n[... truncated for extraction]"
      : d.content;
    return `=== ${d.filename} (type: ${d.type}) ===\n${preview}`;
  }).join("\n\n---\n\n");

  onProgress(`Sending ${docs.length} documents to Claude for AI-powered extraction…`);

  // Accumulate tool calls across the agent loop
  const accumulated: Record<string, number> = {};
  const extractionLog: ExtractionLogEntry[] = [];
  const warnings: string[] = [];
  let tokensUsed = 0;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Please extract all tax field values from the following documents:\n\n${docTexts}`,
    },
  ];

  // ── Agentic tool-use loop ──────────────────────────────────────────────────
  for (let iteration = 0; iteration < 25; iteration++) {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 8192,
      system:     buildSystemPrompt(taxYear),
      tools:      [RECORD_FIELD_TOOL],
      messages,
    });

    tokensUsed += response.usage.input_tokens + response.usage.output_tokens;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // Process each tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUseBlocks) {
      const input = tu.input as {
        field: string;
        amount: number;
        docName: string;
        boxLabel: string;
        operation: "set" | "add";
        note?: string;
      };

      if (!(input.field in FIELD_DESCRIPTIONS)) {
        warnings.push(`Unknown field "${input.field}" from ${input.docName} — skipped`);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Unknown field: ${input.field}` });
        continue;
      }

      const prev = accumulated[input.field] ?? 0;
      accumulated[input.field] = input.operation === "add"
        ? prev + input.amount
        : input.amount;

      extractionLog.push({
        field:    input.field,
        amount:   input.amount,
        docName:  input.docName,
        boxLabel: input.boxLabel,
        note:     input.note,
      });

      if (input.note) warnings.push(`${input.docName} → ${input.field}: ${input.note}`);

      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: "recorded" });
    }

    onProgress(`Extracted ${extractionLog.length} field${extractionLog.length !== 1 ? "s" : ""} so far (${tokensUsed} tokens)…`);

    // Stop when Claude is done or made no tool calls
    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) break;

    // Feed results back for the next iteration
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user",      content: toolResults });
  }

  // ── Build TaxInputData from accumulated values ─────────────────────────────
  const get = (field: string) => accumulated[field] ?? 0;

  // Royalties and 1099-K receipts roll into otherIncome for the calculator
  const royalties = get("royaltyIncome");
  if (royalties > 0) {
    accumulated["otherIncome"] = (accumulated["otherIncome"] ?? 0) + royalties;
  }

  // Education credit: estimate AOTC (max $2,500) or LLC (max $2,000) from 1098-T tuition paid
  const tuitionPaid = get("educationCredit"); // stored in this field during extraction
  const estimatedEduCredit = tuitionPaid > 0
    ? Math.min(tuitionPaid >= 4_000 ? 2_500 : tuitionPaid * 0.625, 2_500)
    : 0;
  if (estimatedEduCredit > 0) {
    warnings.push(`1098-T: Tuition paid $${tuitionPaid.toLocaleString()} → estimated education credit $${estimatedEduCredit.toLocaleString()} (AOTC simplified). Verify eligibility with a CPA.`);
  }

  const taxInput: TaxInputData = {
    // Taxpayer info left blank — filled in by the ask_human step in the orchestrator
    taxpayerName:              "",
    ssn:                       "",
    filingStatus:              "single" as FilingStatus,
    taxYear,
    dependentsUnder17:         0,
    otherDependents:           0,

    wages:                     get("wages"),
    tipIncome:                 get("tipIncome"),
    overtimePay:               get("overtimePay"),
    interest:                  get("interest"),
    ordinaryDividends:         get("ordinaryDividends"),
    qualifiedDividends:        get("qualifiedDividends"),
    ltcg:                      get("ltcg"),
    stcg:                      get("stcg"),
    businessIncome:            get("businessIncome"),
    rentalIncome:              get("rentalIncome"),
    royaltyIncome:             get("royaltyIncome"),
    unemploymentComp:          get("unemploymentComp"),
    socialSecurity:            get("socialSecurity"),
    retirementDist:            get("retirementDist"),
    otherIncome:               get("otherIncome"),

    studentLoanInterest:       get("studentLoanInterest"),
    educatorExpenses:          Math.min(get("educatorExpenses"), 300), // IRS cap
    hsaDeduction:              get("hsaDeduction"),
    selfEmployedHealthInsurance: get("selfEmployedHealthInsurance"),
    iraDeduction:              get("iraDeduction"),
    otherAdjustments:          get("otherAdjustments"),

    mortgageInterest:          get("mortgageInterest"),
    saltPaid:                  get("saltPaid"),
    charitableCash:            get("charitableCash"),
    charitableNonCash:         get("charitableNonCash"),
    medicalExpenses:           get("medicalExpenses"),
    otherItemized:             0,

    // QBI = business income + rental income that qualifies (simplified)
    qbi:                       Math.max(0, get("businessIncome") + get("rentalIncome")),

    childTaxCredit:            get("childTaxCredit"),
    childCareCredit:           0,
    educationCredit:           estimatedEduCredit,
    eitc:                      0,
    retirementCredit:          0,
    foreignTaxCredit:          0,
    otherCredits:              0,

    federalWithholding:        get("federalWithholding"),
    estimatedTaxPayments:      get("estimatedTaxPayments"),

    age65OrOlder:              false,
    // BBB provisions: off by default; user can enable in settings if applicable
    bigBeautifulBillEnacted:   false,
    receivedTips:              get("tipIncome") > 0,
    receivedOvertime:          get("overtimePay") > 0,
    hasCarLoan:                get("carLoanInterest") > 0,
    carLoanInterest:           get("carLoanInterest"),
    isUsMadeVehicle:           false,
  };

  return { taxInput, extractionLog, warnings, tokensUsed };
}
