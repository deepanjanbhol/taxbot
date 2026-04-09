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
import { TAX_RULES, BBB_RULES, getSaltCap, getCTCPerChild } from "../src/utils/tax-rules-loader.js";

// Build tool description dynamically from KB so it never drifts from actual values
const _bbb = BBB_RULES.provisions;
const _toolDescription =
  `Compute a complete Form 1040 estimate using ${TAX_RULES._meta.taxYear} tax brackets. ` +
  `Applies Big Beautiful Bill provisions: ` +
  `tip exclusion up to $${_bbb.tipIncomeExclusion.maxExclusion.toLocaleString()}, ` +
  `overtime exclusion up to $${_bbb.overtimeExclusion.maxExclusion.toLocaleString()}, ` +
  `senior deduction $${_bbb.seniorDeduction.amount.toLocaleString()} (age ${_bbb.seniorDeduction.ageThreshold}+), ` +
  `SALT cap raised per filing status (MFJ $${(_bbb.saltCap.byFilingStatus["mfj"] ?? 0).toLocaleString()}, ` +
  `Single/HOH $${(_bbb.saltCap.byFilingStatus["single"] ?? 0).toLocaleString()}), ` +
  `QBI at ${(_bbb.qbiDeduction.rate * 100).toFixed(0)}% (vs ${(_bbb.qbiDeduction.baselinePreBBB * 100).toFixed(0)}% pre-BBB), ` +
  `CTC $${_bbb.childTaxCredit.amountPerChild.toLocaleString()}/child (vs $${_bbb.childTaxCredit.baselinePreBBB.toLocaleString()} pre-BBB), ` +
  `car loan interest up to $${_bbb.carLoanInterestDeduction.maxDeduction.toLocaleString()} for US-assembled vehicles. ` +
  `Returns full form text, summary metrics (AGI, taxable income, effective rate, refund/owed), ` +
  `and a list of applied BBB provisions. This is deterministic — no AI inference, pure IRS math.`;

const server = new Server(
  { name: "compute-tax", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "compute_form_1040",
      description: _toolDescription,
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

  // Apply SALT cap consistent with form-generator (BBB per-filing-status caps from KB)
  const bbbEnacted = tax_input.bigBeautifulBillEnacted ?? BBB_RULES.enacted;
  const saltCap    = getSaltCap(tax_input.filingStatus, bbbEnacted);
  const cappedSalt = Math.min(tax_input.saltPaid ?? 0, saltCap);

  // BBB adjustments (same logic as form-generator)
  const bbb             = BBB_RULES.provisions;
  const excludedTips    = (tax_input.receivedTips && bbbEnacted)
    ? Math.min(tax_input.tipIncome ?? 0, bbb.tipIncomeExclusion.maxExclusion) : 0;
  const excludedOT      = (tax_input.receivedOvertime && bbbEnacted)
    ? Math.min(tax_input.overtimePay ?? 0, bbb.overtimeExclusion.maxExclusion) : 0;
  const seniorDed       = (tax_input.age65OrOlder && bbbEnacted) ? bbb.seniorDeduction.amount : 0;
  const carLoanDed      = (tax_input.hasCarLoan && tax_input.isUsMadeVehicle && bbbEnacted)
    ? Math.min(tax_input.carLoanInterest ?? 0, bbb.carLoanInterestDeduction.maxDeduction) : 0;

  // Adjusted wages (BBB exclusions)
  const effectiveWages = (tax_input.wages ?? 0)
    + Math.max(0, (tax_input.tipIncome ?? 0) - excludedTips)
    + Math.max(0, (tax_input.overtimePay ?? 0) - excludedOT);

  // Above-the-line adjustments
  const adjustments = (tax_input.studentLoanInterest ?? 0)
    + (tax_input.educatorExpenses ?? 0)
    + (tax_input.hsaDeduction ?? 0)
    + (tax_input.selfEmployedHealthInsurance ?? 0)
    + (tax_input.iraDeduction ?? 0)
    + (tax_input.otherAdjustments ?? 0)
    + seniorDed + carLoanDed;

  // Itemized deductions: estimate AGI first (no SE tax deduction) for 7.5% medical floor
  const rawIncome = effectiveWages + (tax_input.interest ?? 0) + (tax_input.ordinaryDividends ?? 0)
    + ((tax_input.ltcg ?? 0) + (tax_input.stcg ?? 0))
    + (tax_input.businessIncome ?? 0) + (tax_input.rentalIncome ?? 0)
    + (tax_input.retirementDist ?? 0) + (tax_input.socialSecurity ?? 0) + (tax_input.otherIncome ?? 0);
  const roughAGI      = Math.max(0, rawIncome - adjustments);
  const medFloor      = roughAGI * 0.075;
  const medAfterFloor = Math.max(0, (tax_input.medicalExpenses ?? 0) - medFloor);
  const itemized      = (tax_input.mortgageInterest ?? 0) + cappedSalt
    + (tax_input.charitableCash ?? 0) + (tax_input.charitableNonCash ?? 0) + medAfterFloor;

  // Credits — computed from dependents and all credit fields
  const ctcPerChild   = getCTCPerChild(bbbEnacted);
  const computedCTC   = (tax_input.dependentsUnder17 ?? 0) * ctcPerChild;
  const otherDepCred  = (tax_input.otherDependents ?? 0) * 500;
  const totalCredits  = computedCTC + otherDepCred
    + (tax_input.childCareCredit  ?? 0)
    + (tax_input.educationCredit  ?? 0)
    + (tax_input.eitc             ?? 0)
    + (tax_input.retirementCredit ?? 0)
    + (tax_input.foreignTaxCredit ?? 0)
    + (tax_input.otherCredits     ?? 0);

  const tax = computeFullTax({
    filingStatus:        tax_input.filingStatus,
    wages:               effectiveWages,
    interest:            tax_input.interest ?? 0,
    dividends:           tax_input.ordinaryDividends ?? 0,
    qualifiedDividends:  tax_input.qualifiedDividends ?? 0,
    ltcg:                tax_input.ltcg ?? 0,
    stcg:                tax_input.stcg ?? 0,
    businessIncome:      tax_input.businessIncome ?? 0,
    rentalIncome:        tax_input.rentalIncome ?? 0,
    otherIncome:         (tax_input.retirementDist ?? 0) + (tax_input.socialSecurity ?? 0) + (tax_input.otherIncome ?? 0),
    adjustments,
    itemizedDeductions:  itemized,
    qbi:                 tax_input.qbi ?? 0,
    credits:             totalCredits,
    withholding:         tax_input.federalWithholding ?? 0,
    estimatedPayments:   tax_input.estimatedTaxPayments ?? 0,
    bigBeautifulBillEnacted: bbbEnacted,
  });

  const p = BBB_RULES.provisions;
  const bbbProvisions: string[] = [
    tax_input.receivedTips && (tax_input.tipIncome ?? 0) > 0
      ? `Tip exclusion: $${Math.min(tax_input.tipIncome ?? 0, p.tipIncomeExclusion.maxExclusion).toLocaleString()}` : null,
    tax_input.receivedOvertime && (tax_input.overtimePay ?? 0) > 0
      ? `Overtime exclusion: $${Math.min(tax_input.overtimePay ?? 0, p.overtimeExclusion.maxExclusion).toLocaleString()}` : null,
    tax_input.age65OrOlder ? `Senior deduction: $${p.seniorDeduction.amount.toLocaleString()}` : null,
    bbbEnacted && (tax_input.saltPaid ?? 0) > 10_000
      ? `SALT cap raised to $${saltCap.toLocaleString()} (BBB) — deducting $${cappedSalt.toLocaleString()}` : null,
    bbbEnacted ? `QBI deduction at ${p.qbiDeduction.rate * 100}% (vs ${p.qbiDeduction.baselinePreBBB * 100}% pre-BBB)` : null,
    bbbEnacted && (tax_input.dependentsUnder17 ?? 0) > 0
      ? `Child Tax Credit: ${tax_input.dependentsUnder17} × $${getCTCPerChild(true).toLocaleString()} = $${computedCTC.toLocaleString()} (vs $${getCTCPerChild(false).toLocaleString()}/child pre-BBB)` : null,
    tax_input.hasCarLoan && tax_input.isUsMadeVehicle && (tax_input.carLoanInterest ?? 0) > 0
      ? `Car loan interest deduction: $${Math.min(tax_input.carLoanInterest ?? 0, p.carLoanInterestDeduction.maxDeduction).toLocaleString()}` : null,
    tax.capitalLossCarryforward > 0
      ? `Capital loss carryforward to 2026: $${tax.capitalLossCarryforward.toLocaleString()}` : null,
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
