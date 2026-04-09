/**
 * tax-export.ts
 *
 * Structured tax data export for open-source TaxBot.
 *
 * Outputs:
 *  - JSON  — machine-readable, suitable for import into other tools
 *  - CSV   — spreadsheet-friendly, hand to your CPA
 *
 * IRS filing guidance:
 *  This tool does NOT file with the IRS. For actual filing:
 *  - AGI ≤ $84,000 → IRS Free File (irs.gov/freefile) — completely free
 *  - Anyone        → FreeTaxUSA ($0 federal), Cash App Taxes ($0)
 *  - CPA           → use the CSV export as a pre-filled organizer
 */

import type { RunHistory } from "../dashboard/src/types/pipeline.js";

export interface TaxExportData {
  _exportVersion: "1.0";
  exportedAt:     string;
  taxYear:        number;
  runId:          string;
  runDate:        string;
  status:         string;

  // Taxpayer
  filingStatus:   string;
  age65OrOlder:   boolean;

  // Income
  wagesAndSalaries:    number;
  businessIncome:      number;
  rentalIncome:        number;
  capitalGains:        number;
  socialSecurity:      number;
  retirementDist:      number;
  otherIncome:         number;
  grossIncome:         number;

  // Adjustments
  studentLoanInterest:        number;
  educatorExpenses:           number;
  hsaDeduction:               number;
  selfEmployedHealthInsurance: number;
  selfEmploymentTaxDeduction: number;
  adjustedGrossIncome:        number;

  // Deductions
  standardOrItemizedDeduction:    number;
  qualifiedBusinessIncomeDeduction: number;
  taxableIncome:                  number;

  // Tax & Payments
  regularTax:       number;
  selfEmploymentTax: number;
  totalTax:         number;
  withheld:         number;
  estimatedPayments: number;
  totalPayments:    number;

  // Result
  refundOrOwed: number;
  isRefund:     boolean;

  // Rates
  effectiveTaxRate: string;
  marginalTaxRate:  string;

  // BBB provisions (if enacted)
  bbbProvisions: {
    tipExclusion:       number;
    overtimeExclusion:  number;
    seniorDeduction:    number;
    carLoanInterest:    number;
  } | null;

  // IRS Free File guidance
  freeFilingEligible: boolean;
  freeFilingNote:     string;
  freeFilingUrl:      string;

  // Full form text
  form1040Text?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(text: string, pattern: RegExp): number {
  const m = text.match(pattern);
  return m ? parseFloat((m[1] ?? "0").replace(/[$,]/g, "")) : 0;
}

function rate(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1] ?? "N/A";
}

function fieldVal(d: Record<string, unknown>, key: string): number {
  const f = d[key] as { value?: number } | number | undefined;
  if (!f) return 0;
  if (typeof f === "number") return f;
  return f.value ?? 0;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildTaxExport(run: RunHistory, taxYear = 2025): TaxExportData {
  const d = (run.extractedData ?? {}) as Record<string, unknown>;
  const t = run.form1040 ?? "";

  const wages       = fieldVal(d, "wages");
  const biz         = fieldVal(d, "businessIncome");
  const rental      = fieldVal(d, "rentalIncome");
  const ltcg        = fieldVal(d, "ltcg");
  const ss          = fieldVal(d, "socialSecurity") || fieldVal(d, "socialSecurityBenefits");
  const retire      = fieldVal(d, "retirementDist");
  const tips        = fieldVal(d, "tipIncome");
  const overtime    = fieldVal(d, "overtimePay");
  const sli         = fieldVal(d, "studentLoanInterest");
  const edu         = fieldVal(d, "educatorExpenses");
  const hsa         = fieldVal(d, "hsaDeduction");
  const sehi        = fieldVal(d, "selfEmployedHealthInsurance");
  const withheld    = fieldVal(d, "federalWithholding");
  const estPay      = fieldVal(d, "estimatedTaxPayments");
  const carLoanInt  = fieldVal(d, "carLoanInterest");

  const agi        = num(t, /ADJUSTED GROSS INCOME[^\d]*([\d,]+)/i) ||
                     num(t, /AGI:\s*\$?([\d,]+)/i);
  const taxableInc = num(t, /TAXABLE INCOME[^\d]*([\d,]+)/i);
  const totalTax   = num(t, /TOTAL TAX AFTER CREDITS[^\d]*([\d,]+)/i) ||
                     num(t, /TOTAL TAX[^\d]*([\d,]+)/i);
  const stdDed     = num(t, /Standard Deduction[^\d]*([\d,]+)/i);
  const effRate    = rate(t, /Effective Tax Rate:\s*([\d.]+%)/i);
  const margRate   = rate(t, /Marginal Tax Rate:\s*([\d.]+%)/i);

  const filingStatus = (d.filingStatus as string) ?? "single";
  const grossIncome  = wages + tips + overtime + biz + rental + ltcg + ss + retire;

  // SE tax: 15.3% on 92.35% of net self-employment income
  const seTax = biz > 0 ? Math.round(biz * 0.9235 * 0.153) : 0;
  const seTaxDed = Math.round(seTax / 2);

  // QBI: 20% of qualified business income (simplified)
  const qbiDed = biz > 0 ? Math.round(biz * 0.2) : 0;

  const FREE_FILE_LIMIT = 84_000;
  const freeFilingEligible = agi > 0 && agi <= FREE_FILE_LIMIT;

  // BBB provisions from stored result
  const bbbRaw = (run as { bbbProvisions?: Record<string, number> }).bbbProvisions;
  const bbbProvisions = bbbRaw ? {
    tipExclusion:      bbbRaw["tipExclusion"]      ?? 0,
    overtimeExclusion: bbbRaw["overtimeExclusion"]  ?? 0,
    seniorDeduction:   bbbRaw["seniorDeduction"]    ?? 0,
    carLoanInterest:   bbbRaw["carLoanInterest"]    ?? carLoanInt,
  } : null;

  return {
    _exportVersion: "1.0",
    exportedAt:     new Date().toISOString(),
    taxYear,
    runId:          run.runId,
    runDate:        run.startedAt,
    status:         run.status,
    filingStatus,
    age65OrOlder:   (d.age65OrOlder as boolean) ?? false,

    wagesAndSalaries:    wages,
    businessIncome:      biz,
    rentalIncome:        rental,
    capitalGains:        ltcg,
    socialSecurity:      ss,
    retirementDist:      retire,
    otherIncome:         0,
    grossIncome,

    studentLoanInterest:         sli,
    educatorExpenses:            edu,
    hsaDeduction:                hsa,
    selfEmployedHealthInsurance: sehi,
    selfEmploymentTaxDeduction:  seTaxDed,
    adjustedGrossIncome:         agi,

    standardOrItemizedDeduction:    stdDed,
    qualifiedBusinessIncomeDeduction: qbiDed,
    taxableIncome:                  taxableInc,

    regularTax:        totalTax,
    selfEmploymentTax: seTax,
    totalTax,
    withheld,
    estimatedPayments: estPay,
    totalPayments:     withheld + estPay,

    refundOrOwed: run.refundOrOwed ?? 0,
    isRefund:     (run.refundOrOwed ?? 0) >= 0,

    effectiveTaxRate: effRate,
    marginalTaxRate:  margRate,

    bbbProvisions,

    freeFilingEligible,
    freeFilingNote: freeFilingEligible
      ? `Your AGI ($${agi.toLocaleString()}) qualifies for IRS Free File (limit $${FREE_FILE_LIMIT.toLocaleString()}). File federal for FREE.`
      : `Your AGI ($${agi.toLocaleString()}) exceeds the Free File limit. Try FreeTaxUSA or Cash App Taxes ($0 federal).`,
    freeFilingUrl: "https://www.irs.gov/filing/free-file-do-your-federal-taxes-for-free",

    form1040Text: run.form1040,
  };
}

// ── CSV serializer ────────────────────────────────────────────────────────────

export function exportToCSV(data: TaxExportData): string {
  const $ = (n: number) => n === 0 ? "0" : `$${n.toLocaleString()}`;

  const rows: [string, string | number | boolean][] = [
    ["TaxBot Export — Tax Year",   data.taxYear],
    ["Export Date",                new Date(data.exportedAt).toLocaleString()],
    ["Run Date",                   new Date(data.runDate).toLocaleString()],
    ["Filing Status",              data.filingStatus],
    ["Age 65+",                    data.age65OrOlder],
    ["", ""],
    ["=== INCOME ===",             ""],
    ["Wages & Salaries (W-2)",     $(data.wagesAndSalaries)],
    ["Business Income (Sched C)",  $(data.businessIncome)],
    ["Rental Income (Sched E)",    $(data.rentalIncome)],
    ["Capital Gains (Sched D)",    $(data.capitalGains)],
    ["Social Security Benefits",   $(data.socialSecurity)],
    ["Retirement Distributions",   $(data.retirementDist)],
    ["Other Income",               $(data.otherIncome)],
    ["Gross Income",               $(data.grossIncome)],
    ["", ""],
    ["=== ADJUSTMENTS TO INCOME ===", ""],
    ["Student Loan Interest",       $(data.studentLoanInterest)],
    ["Educator Expenses",           $(data.educatorExpenses)],
    ["HSA Deduction",               $(data.hsaDeduction)],
    ["SE Health Insurance",         $(data.selfEmployedHealthInsurance)],
    ["SE Tax Deduction (50%)",      $(data.selfEmploymentTaxDeduction)],
    ["Adjusted Gross Income (AGI)", $(data.adjustedGrossIncome)],
    ["", ""],
    ["=== DEDUCTIONS ===", ""],
    ["Standard / Itemized Deduction",  $(data.standardOrItemizedDeduction)],
    ["QBI Deduction (Sec. 199A 20%)",  $(data.qualifiedBusinessIncomeDeduction)],
    ["Taxable Income",                 $(data.taxableIncome)],
    ["", ""],
    ["=== TAX COMPUTATION ===", ""],
    ["Regular Income Tax",     $(data.regularTax)],
    ["Self-Employment Tax",    $(data.selfEmploymentTax)],
    ["Total Federal Tax",      $(data.totalTax)],
    ["", ""],
    ["=== PAYMENTS ===", ""],
    ["Federal Withholding (W-2)",  $(data.withheld)],
    ["Estimated Tax Payments",     $(data.estimatedPayments)],
    ["Total Payments",             $(data.totalPayments)],
    ["", ""],
    ["=== RESULT ===", ""],
    [data.isRefund ? "ESTIMATED REFUND" : "ESTIMATED AMOUNT OWED",
      `$${Math.abs(data.refundOrOwed).toLocaleString()}`],
    ["Effective Tax Rate",   data.effectiveTaxRate],
    ["Marginal Tax Rate",    data.marginalTaxRate],
    ["", ""],
    ["=== FREE FILING OPTIONS ===", ""],
    ["IRS Free File Eligible",  data.freeFilingEligible ? "YES" : "NO"],
    ["Guidance",                data.freeFilingNote],
    ["IRS Free File URL",       data.freeFilingUrl],
    ["FreeTaxUSA ($0 federal)", "https://www.freetaxusa.com"],
    ["Cash App Taxes ($0)",     "https://cash.app/taxes"],
  ];

  if (data.bbbProvisions) {
    rows.push(
      ["", ""],
      ["=== BIG BEAUTIFUL BILL PROVISIONS APPLIED ===", ""],
      ["Tip Income Exclusion",      $(data.bbbProvisions.tipExclusion)],
      ["Overtime Pay Exclusion",    $(data.bbbProvisions.overtimeExclusion)],
      ["Senior Deduction",          $(data.bbbProvisions.seniorDeduction)],
      ["Car Loan Interest Deduction", $(data.bbbProvisions.carLoanInterest)],
    );
  }

  rows.push(
    ["", ""],
    ["DISCLAIMER", "This is an AI-generated estimate. Verify with a tax professional before filing."],
  );

  return rows
    .map(([k, v]) => `"${String(k).replace(/"/g, '""')}","${String(v).replace(/"/g, '""')}"`)
    .join("\r\n");
}
