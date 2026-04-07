/**
 * MCP Server: compute-tax
 * Tool: compute_form_1040(tax_input)
 * Deterministic tax computation + Form 1040 report generation.
 * No AI involved — pure math against 2025 tax brackets.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { generateForm1040, type TaxInputData } from "../src/tools/form-generator.js";
import { computeFullTax } from "../src/utils/tax-calculator.js";

const server = new Server(
  { name: "compute-tax", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "compute_form_1040",
      description:
        "Compute a complete Form 1040 estimate using 2025 US tax brackets. " +
        "Applies Big Beautiful Bill provisions (tip exclusion, overtime exclusion, " +
        "senior deduction, SALT cap raise, QBI 23%, CTC $2,500, car loan interest). " +
        "Returns full form text, summary metrics (AGI, taxable income, effective rate, " +
        "refund/owed), and a list of applied BBB provisions. " +
        "This is deterministic — no AI inference, pure IRS math.",
      inputSchema: {
        type: "object",
        properties: {
          tax_input: {
            type: "object",
            description: "TaxInputData object from extract_income_fields.",
          },
        },
        required: ["tax_input"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "compute_form_1040") {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  const { tax_input } = req.params.arguments as { tax_input: TaxInputData };

  // Normalize filing status — Claude may pass a full label ("Married Filing Jointly") instead of code ("mfj")
  const STATUS_MAP: Record<string, TaxInputData["filingStatus"]> = {
    "single":                    "single",
    "married filing jointly":    "mfj",
    "mfj":                       "mfj",
    "married filing separately": "mfs",
    "mfs":                       "mfs",
    "head of household":         "hoh",
    "hoh":                       "hoh",
  };
  const rawStatus = String(tax_input.filingStatus ?? "single").toLowerCase().trim();
  tax_input.filingStatus = STATUS_MAP[rawStatus] ?? "single";

  const form1040Text = generateForm1040(tax_input);

  const tax = computeFullTax({
    filingStatus:        tax_input.filingStatus,
    wages:               tax_input.wages,
    interest:            tax_input.interest,
    dividends:           tax_input.ordinaryDividends,
    qualifiedDividends:  tax_input.qualifiedDividends,
    ltcg:                tax_input.ltcg,
    businessIncome:      tax_input.businessIncome,
    rentalIncome:        tax_input.rentalIncome,
    otherIncome:         tax_input.retirementDist + tax_input.socialSecurity + tax_input.otherIncome,
    adjustments:         tax_input.studentLoanInterest + tax_input.educatorExpenses +
                         tax_input.hsaDeduction + tax_input.selfEmployedHealthInsurance +
                         tax_input.iraDeduction + tax_input.otherAdjustments,
    itemizedDeductions:  tax_input.mortgageInterest + tax_input.saltPaid + tax_input.charitableCash,
    qbi:                 tax_input.qbi,
    credits:             0,
    withholding:         tax_input.federalWithholding,
    estimatedPayments:   tax_input.estimatedTaxPayments,
    bigBeautifulBillEnacted: tax_input.bigBeautifulBillEnacted,
  });

  const bbbProvisions: string[] = [
    tax_input.receivedTips && tax_input.tipIncome > 0
      ? `Tip exclusion: $${Math.min(tax_input.tipIncome, 25_000).toLocaleString()}` : null,
    tax_input.receivedOvertime && tax_input.overtimePay > 0
      ? `Overtime exclusion: $${Math.min(tax_input.overtimePay, 12_500).toLocaleString()}` : null,
    tax_input.age65OrOlder ? "Senior deduction: $4,000" : null,
    tax_input.saltPaid > 10_000
      ? `SALT cap raised to $30,000 (+$${Math.min(tax_input.saltPaid, 30_000) - 10_000} deduction)` : null,
    "QBI deduction at 23% (vs 20% pre-BBB)",
    "Child Tax Credit at $2,500/child (vs $2,000 pre-BBB)",
    tax_input.hasCarLoan && tax_input.isUsMadeVehicle && tax_input.carLoanInterest > 0
      ? `Car loan interest: $${Math.min(tax_input.carLoanInterest, 10_000).toLocaleString()}` : null,
  ].filter(Boolean) as string[];

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        form1040Text,
        taxInput: tax_input,
        metrics: {
          grossIncome:   tax.grossIncome,
          agi:           tax.agi,
          taxableIncome: tax.taxableIncome,
          totalTax:      tax.totalTaxAfterCredits,
          effectiveRate: tax.effectiveRate,
          marginalRate:  Math.round(tax.marginalRate * 100),
          refundOrOwed:  tax.refundOrOwed,
          deductionUsed: tax.deductionUsed,
          deductionType: tax.deductionUsed === tax.standardDeduction ? "standard" : "itemized",
          seTax:         tax.seTax,
          niit:          tax.niit,
          qbiDeduction:  tax.qbiDeduction,
        },
        bbbProvisions,
      }),
    }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
