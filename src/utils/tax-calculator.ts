/**
 * tax-calculator.ts
 * Core tax computation functions for tax year 2025.
 *
 * All tax rules (brackets, deductions, limits) are loaded from
 * knowledge-base/rules/ at startup — NOT hardcoded here.
 * To update a rule, edit the relevant JSON file and restart.
 */

import {
  TAX_RULES, BBB_RULES,
  normalizeBrackets, normalizeLtcg, getQBIRate,
} from "./tax-rules-loader.js";

export interface TaxBracket {
  rate: number;
  min: number;
  max: number;
}

// Derived at module init from KB — same shape the rest of the file uses
const BRACKETS = Object.fromEntries(
  Object.entries(TAX_RULES.ordinaryIncomeBrackets).map(
    ([status, brackets]) => [status, normalizeBrackets(brackets)]
  )
) as Record<string, TaxBracket[]>;

const STANDARD_DEDUCTIONS = TAX_RULES.standardDeductions as Record<string, number>;

const LTCG_BRACKETS = Object.fromEntries(
  Object.entries(TAX_RULES.ltcgBrackets).map(
    ([status, brackets]) => [status, normalizeLtcg(brackets)]
  )
) as Record<string, Array<{ rate: number; max: number }>>;

export type FilingStatus = "single" | "mfj" | "mfs" | "hoh";

/** Compute ordinary income tax from tax tables. */
export function computeOrdinaryTax(taxableIncome: number, status: FilingStatus): number {
  const brackets = BRACKETS[status];
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
  const brackets = BRACKETS[status];
  for (const b of [...brackets].reverse()) {
    if (taxableIncome > b.min) return b.rate;
  }
  return 0.10;
}

/** Compute LTCG tax. */
export function computeLtcgTax(ltcgAmount: number, ordinaryIncome: number, status: FilingStatus): number {
  const brackets = LTCG_BRACKETS[status];
  let tax = 0;
  let stackedIncome = ordinaryIncome;

  for (const b of brackets) {
    if (stackedIncome >= b.max) continue;
    const roomInBracket = b.max - stackedIncome;
    const taxableHere   = Math.min(ltcgAmount, roomInBracket);
    tax += taxableHere * b.rate;
    ltcgAmount   -= taxableHere;
    stackedIncome = b.max;
    if (ltcgAmount <= 0) break;
  }
  return Math.round(tax * 100) / 100;
}

/** Self-employment tax calculation. */
export function computeSETax(netSEIncome: number): { seTax: number; deductibleHalf: number } {
  const { ssWageBase, ssRate, medicareRate, additionalMedicareRate,
          additionalMedicareThreshold, netEarningsMultiplier } = TAX_RULES.seTax;

  const adjustedNetSE = netSEIncome * netEarningsMultiplier;
  const ssTax         = Math.min(adjustedNetSE, ssWageBase) * ssRate;
  const medicareTax   = adjustedNetSE * medicareRate;
  const addlMedicare  = Math.max(0, adjustedNetSE - additionalMedicareThreshold) * additionalMedicareRate;

  const seTax = ssTax + medicareTax + addlMedicare;
  return {
    seTax:           Math.round(seTax * 100) / 100,
    deductibleHalf:  Math.round((seTax / 2) * 100) / 100,
  };
}

/** Net Investment Income Tax (3.8% on investment income above threshold). */
export function computeNIIT(investmentIncome: number, agi: number, status: FilingStatus): number {
  const threshold  = TAX_RULES.niit.thresholds[status as keyof typeof TAX_RULES.niit.thresholds];
  const excessAGI  = Math.max(0, agi - threshold);
  const niitBase   = Math.min(investmentIncome, excessAGI);
  return Math.round(niitBase * TAX_RULES.niit.rate * 100) / 100;
}

/** QBI deduction (rate from KB — 20% baseline, 23% under BBB). */
export function computeQBIDeduction(
  qbi: number,
  taxableIncomeBeforeQBI: number,
  status: FilingStatus,
  bigBeautifulBillEnacted = true
): number {
  const rate             = getQBIRate(bigBeautifulBillEnacted);
  const phaseOutThreshold = TAX_RULES.qbi.phaseOutThresholds[status as keyof typeof TAX_RULES.qbi.phaseOutThresholds];

  if (taxableIncomeBeforeQBI <= phaseOutThreshold) {
    return Math.min(qbi * rate, taxableIncomeBeforeQBI * rate);
  }
  // Above threshold: limited to 50% of W-2 wages (simplified)
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
  refundOrOwed: number;
  effectiveRate: number;
  marginalRate: number;
  /** Net capital gain/loss on Form 1040 line 7 (losses capped at -$3,000) */
  capitalGainLine7: number;
  /** Capital loss carryforward to future years (0 if gain or loss ≤ $3,000) */
  capitalLossCarryforward: number;
}

/** Full tax summary computation. */
export function computeFullTax(params: {
  filingStatus: FilingStatus;
  wages: number;
  interest: number;
  dividends: number;
  qualifiedDividends: number;
  ltcg: number;
  /** Net short-term capital gains/losses (may be negative). Defaults to 0. */
  stcg?: number;
  businessIncome: number;
  rentalIncome: number;
  otherIncome: number;
  adjustments: number;
  itemizedDeductions: number;
  qbi: number;
  credits: number;
  withholding: number;
  estimatedPayments: number;
  bigBeautifulBillEnacted?: boolean;
}): TaxSummary {
  const {
    filingStatus: status,
    wages, interest, dividends, qualifiedDividends, ltcg,
    stcg = 0,
    businessIncome, rentalIncome, otherIncome,
    adjustments, itemizedDeductions, qbi, credits,
    withholding, estimatedPayments,
    bigBeautifulBillEnacted = BBB_RULES.enacted,
  } = params;

  const { seTax, deductibleHalf } = computeSETax(Math.max(0, businessIncome));
  const totalAdjustments = adjustments + deductibleHalf;

  // ── Capital gain/loss netting per IRS Schedule D ──────────────────────────
  // stcg and ltcg may both be negative (capital losses)
  const netST = stcg;
  const netLT = ltcg;
  const netCG = netST + netLT;

  // Form 1040 line 7: capital gain or loss (net losses capped at -$3,000/year)
  const capitalGainLine7 = netCG < 0 ? Math.max(netCG, -3000) : netCG;
  const capitalLossCarryforward = netCG < 0 ? Math.max(0, -netCG - 3000) : 0;

  // Preferential LTCG portion: only net LT gains (after ST loss offset) are taxed at 0/15/20%
  // ST gains (or the portion not sheltered by LT gains) are taxed at ordinary rates
  let preferredLTCG = 0;
  if (netCG > 0) {
    if (netST < 0) {
      // ST loss offsets LT gain; remaining net is still preferential LT
      preferredLTCG = netCG;
    } else {
      // Both positive — only the LT portion gets preferential treatment
      preferredLTCG = Math.max(0, netLT);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const grossIncome = wages + interest + dividends + capitalGainLine7 + businessIncome + rentalIncome + otherIncome;
  const agi         = Math.max(0, grossIncome - totalAdjustments);

  const standardDeduction = STANDARD_DEDUCTIONS[status];
  if (standardDeduction === undefined) throw new Error(`[tax-calculator] No standard deduction configured for filing status: "${status}". Check knowledge-base/rules/tax-year-2025.json`);
  const deductionUsed     = Math.max(standardDeduction, itemizedDeductions);

  const taxableBeforeQBI = Math.max(0, agi - deductionUsed);
  const qbiDeduction     = computeQBIDeduction(qbi, taxableBeforeQBI, status, bigBeautifulBillEnacted);
  const taxableIncome    = Math.max(0, taxableBeforeQBI - qbiDeduction);

  // Ordinary income = taxable income minus the preferential portions (LTCG + qualified divs)
  const ordinaryIncome = Math.max(0, taxableIncome - qualifiedDividends - preferredLTCG);
  const ordinaryTax    = computeOrdinaryTax(ordinaryIncome, status);
  const ltcgTax        = computeLtcgTax(qualifiedDividends + preferredLTCG, ordinaryIncome, status);

  // NIIT base uses net capital gain (same as line 7, already limited to -$3K)
  const investmentIncome = Math.max(0, interest + dividends + capitalGainLine7 + rentalIncome);
  const niit             = computeNIIT(investmentIncome, agi, status);

  const totalTax            = ordinaryTax + ltcgTax + seTax + niit;
  const totalTaxAfterCredits = Math.max(0, totalTax - credits);

  const totalPayments = withholding + estimatedPayments;
  const refundOrOwed  = totalPayments - totalTaxAfterCredits;

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
    effectiveRate: grossIncome > 0
      ? Math.round((totalTaxAfterCredits / grossIncome) * 10000) / 100
      : 0,
    marginalRate: getMarginalRate(taxableIncome, status),
    capitalGainLine7,
    capitalLossCarryforward,
  };
}

/** Format a dollar amount. */
export function fmtDollar(n: number): string {
  const abs       = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}
