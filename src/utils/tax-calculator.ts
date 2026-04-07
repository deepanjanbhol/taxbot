/**
 * tax-calculator.ts
 * Core tax computation functions for tax year 2025.
 */

export interface TaxBracket {
  rate: number;
  min: number;
  max: number; // Infinity for top bracket
}

// 2025 tax brackets
const BRACKETS_2025: Record<string, TaxBracket[]> = {
  single: [
    { rate: 0.10, min: 0,       max: 11_925 },
    { rate: 0.12, min: 11_925,  max: 48_475 },
    { rate: 0.22, min: 48_475,  max: 103_350 },
    { rate: 0.24, min: 103_350, max: 197_300 },
    { rate: 0.32, min: 197_300, max: 250_525 },
    { rate: 0.35, min: 250_525, max: 626_350 },
    { rate: 0.37, min: 626_350, max: Infinity },
  ],
  mfj: [
    { rate: 0.10, min: 0,       max: 23_850 },
    { rate: 0.12, min: 23_850,  max: 96_950 },
    { rate: 0.22, min: 96_950,  max: 206_700 },
    { rate: 0.24, min: 206_700, max: 394_600 },
    { rate: 0.32, min: 394_600, max: 501_050 },
    { rate: 0.35, min: 501_050, max: 751_600 },
    { rate: 0.37, min: 751_600, max: Infinity },
  ],
  hoh: [
    { rate: 0.10, min: 0,       max: 17_000 },
    { rate: 0.12, min: 17_000,  max: 64_850 },
    { rate: 0.22, min: 64_850,  max: 103_350 },
    { rate: 0.24, min: 103_350, max: 197_300 },
    { rate: 0.32, min: 197_300, max: 250_500 },
    { rate: 0.35, min: 250_500, max: 626_350 },
    { rate: 0.37, min: 626_350, max: Infinity },
  ],
  mfs: [
    { rate: 0.10, min: 0,       max: 11_925 },
    { rate: 0.12, min: 11_925,  max: 48_475 },
    { rate: 0.22, min: 48_475,  max: 103_350 },
    { rate: 0.24, min: 103_350, max: 197_300 },
    { rate: 0.32, min: 197_300, max: 250_525 },
    { rate: 0.35, min: 250_525, max: 313_175 },
    { rate: 0.37, min: 313_175, max: Infinity },
  ],
};

const STANDARD_DEDUCTIONS_2025: Record<string, number> = {
  single: 15_000,
  mfj:    30_000,
  mfs:    15_000,
  hoh:    22_500,
};

// Long-term capital gains brackets 2025
const LTCG_BRACKETS_2025: Record<string, Array<{ rate: number; max: number }>> = {
  single: [{ rate: 0,    max: 48_350 }, { rate: 0.15, max: 533_400 }, { rate: 0.20, max: Infinity }],
  mfj:    [{ rate: 0,    max: 96_700 }, { rate: 0.15, max: 600_050 }, { rate: 0.20, max: Infinity }],
  hoh:    [{ rate: 0,    max: 64_750 }, { rate: 0.15, max: 566_700 }, { rate: 0.20, max: Infinity }],
  mfs:    [{ rate: 0,    max: 48_350 }, { rate: 0.15, max: 300_000 }, { rate: 0.20, max: Infinity }],
};

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

/** Compute ordinary income tax from tax tables. */
export function computeOrdinaryTax(taxableIncome: number, status: FilingStatus): number {
  const brackets = BRACKETS_2025[status];
  let tax = 0;
  for (const b of brackets) {
    if (taxableIncome <= b.min) break;
    const taxable = Math.min(taxableIncome, b.max) - b.min;
    tax += taxable * b.rate;
  }
  return Math.round(tax * 100) / 100;
}

/** Get the marginal rate for a given income level. */
export function getMarginalRate(taxableIncome: number, status: FilingStatus): number {
  const brackets = BRACKETS_2025[status];
  for (const b of [...brackets].reverse()) {
    if (taxableIncome > b.min) return b.rate;
  }
  return 0.10;
}

/** Compute LTCG tax. */
export function computeLtcgTax(ltcgAmount: number, ordinaryIncome: number, status: FilingStatus): number {
  const brackets = LTCG_BRACKETS_2025[status];
  let tax = 0;
  let stackedIncome = ordinaryIncome; // LTCG stacks on top of ordinary income

  for (const b of brackets) {
    if (stackedIncome >= b.max) continue; // already past this bracket
    const roomInBracket = b.max - stackedIncome;
    const taxableHere = Math.min(ltcgAmount, roomInBracket);
    tax += taxableHere * b.rate;
    ltcgAmount -= taxableHere;
    stackedIncome = b.max;
    if (ltcgAmount <= 0) break;
  }
  return Math.round(tax * 100) / 100;
}

/** Self-employment tax calculation. */
export function computeSETax(netSEIncome: number): { seTax: number; deductibleHalf: number } {
  const ssWageBase2025 = 176_100;
  const adjustedNetSE = netSEIncome * 0.9235; // net SE income for SE tax base

  const ssTax = Math.min(adjustedNetSE, ssWageBase2025) * 0.124;
  const medicareTax = adjustedNetSE * 0.029;
  const additionalMedicare = Math.max(0, adjustedNetSE - 200_000) * 0.009;

  const seTax = ssTax + medicareTax + additionalMedicare;
  return {
    seTax: Math.round(seTax * 100) / 100,
    deductibleHalf: Math.round((seTax / 2) * 100) / 100,
  };
}

/** Net Investment Income Tax (3.8% on investment income above threshold). */
export function computeNIIT(investmentIncome: number, agi: number, status: FilingStatus): number {
  const threshold = status === "mfj" ? 250_000 : status === "mfs" ? 125_000 : 200_000;
  const excessAGI = Math.max(0, agi - threshold);
  const niitBase = Math.min(investmentIncome, excessAGI);
  return Math.round(niitBase * 0.038 * 100) / 100;
}

/** QBI deduction (20% or 23% with Big Beautiful Bill). */
export function computeQBIDeduction(
  qbi: number,
  taxableIncomeBeforeQBI: number,
  status: FilingStatus,
  bigBeautifulBillEnacted = false
): number {
  const rate = bigBeautifulBillEnacted ? 0.23 : 0.20;
  const phaseOutThreshold = status === "mfj" ? 383_900 : 191_950;

  // Simplified: full deduction below threshold
  if (taxableIncomeBeforeQBI <= phaseOutThreshold) {
    return Math.min(qbi * rate, taxableIncomeBeforeQBI * rate);
  }

  // Above threshold: limited to 50% of W-2 wages (simplified — real calc needs W-2 wages)
  return Math.min(qbi * rate, taxableIncomeBeforeQBI * rate);
}

export interface TaxSummary {
  filingStatus: FilingStatus;
  grossIncome: number;
  adjustments: number;
  agi: number;
  standardDeduction: number;
  itemizedDeduction: number;
  deductionUsed: number;
  qbiDeduction: number;
  taxableIncome: number;
  ordinaryTax: number;
  ltcgTax: number;
  seTax: number;
  niit: number;
  otherTaxes: number;
  totalTax: number;
  credits: number;
  totalTaxAfterCredits: number;
  withholding: number;
  estimatedPayments: number;
  totalPayments: number;
  refundOrOwed: number; // positive = refund, negative = owed
  effectiveRate: number;
  marginalRate: number;
}

/** Full tax summary computation. */
export function computeFullTax(params: {
  filingStatus: FilingStatus;
  wages: number;
  interest: number;
  dividends: number;
  qualifiedDividends: number;
  ltcg: number;
  businessIncome: number;    // Schedule C net
  rentalIncome: number;      // Schedule E net
  otherIncome: number;
  adjustments: number;       // IRA, SE tax half, HSA, etc.
  itemizedDeductions: number;
  qbi: number;               // qualified business income
  credits: number;
  withholding: number;
  estimatedPayments: number;
  bigBeautifulBillEnacted?: boolean;
}): TaxSummary {
  const {
    filingStatus: status,
    wages, interest, dividends, qualifiedDividends, ltcg,
    businessIncome, rentalIncome, otherIncome,
    adjustments, itemizedDeductions, qbi, credits,
    withholding, estimatedPayments,
    bigBeautifulBillEnacted = false,
  } = params;

  // SE tax applies to net self-employment income (Schedule C / 1099-NEC).
  // Passive rental income (Schedule E) is NOT subject to SE tax for most taxpayers.
  // If rentalIncome > 0 and businessIncome == 0, SE tax is still only on businessIncome.
  const { seTax, deductibleHalf } = computeSETax(Math.max(0, businessIncome));
  const totalAdjustments = adjustments + deductibleHalf;

  // Gross income
  const grossIncome = wages + interest + dividends + ltcg + businessIncome + rentalIncome + otherIncome;
  const agi = Math.max(0, grossIncome - totalAdjustments);

  // Deductions
  const standardDeduction = STANDARD_DEDUCTIONS_2025[status];
  const deductionUsed = Math.max(standardDeduction, itemizedDeductions);

  // QBI
  const taxableBeforeQBI = Math.max(0, agi - deductionUsed);
  const qbiDeduction = computeQBIDeduction(qbi, taxableBeforeQBI, status, bigBeautifulBillEnacted);

  const taxableIncome = Math.max(0, taxableBeforeQBI - qbiDeduction);

  // Ordinary income (excludes qualified divs and LTCG from top brackets)
  const ordinaryIncome = Math.max(0, taxableIncome - qualifiedDividends - ltcg);
  const ordinaryTax = computeOrdinaryTax(ordinaryIncome, status);
  const ltcgTax = computeLtcgTax(qualifiedDividends + ltcg, ordinaryIncome, status);

  // NIIT
  const investmentIncome = interest + dividends + ltcg + rentalIncome;
  const niit = computeNIIT(investmentIncome, agi, status);

  const totalTax = ordinaryTax + ltcgTax + seTax + niit;
  const totalTaxAfterCredits = Math.max(0, totalTax - credits);

  const totalPayments = withholding + estimatedPayments;
  const refundOrOwed = totalPayments - totalTaxAfterCredits;

  return {
    filingStatus: status,
    grossIncome,
    adjustments: totalAdjustments,
    agi,
    standardDeduction,
    itemizedDeduction: itemizedDeductions,
    deductionUsed,
    qbiDeduction,
    taxableIncome,
    ordinaryTax,
    ltcgTax,
    seTax,
    niit,
    otherTaxes: 0,
    totalTax,
    credits,
    totalTaxAfterCredits,
    withholding,
    estimatedPayments,
    totalPayments,
    refundOrOwed,
    effectiveRate: grossIncome > 0 ? Math.round((totalTaxAfterCredits / grossIncome) * 10000) / 100 : 0,
    marginalRate: getMarginalRate(taxableIncome, status),
  };
}

/** Format a dollar amount. */
export function fmtDollar(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}
