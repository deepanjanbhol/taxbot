/**
 * tax-rules-loader.ts
 *
 * Loads all tax rules from the knowledge-base/rules/ directory at startup.
 * Rules are defined in JSON files — NOT hardcoded in TypeScript.
 *
 * To update rules for a new tax year or new legislation:
 *   1. Edit (or add) the relevant JSON file in knowledge-base/rules/
 *   2. Restart the server — no code changes needed
 *
 * Files loaded:
 *   knowledge-base/rules/tax-year-2025.json   — brackets, deductions, LTCG, SE tax, NIIT
 *   knowledge-base/rules/big-beautiful-bill.json — BBB provision amounts
 *   knowledge-base/rules/irs-limits-2025.json  — IRA/HSA/EITC/estimated tax limits
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.resolve(__dirname, "../../knowledge-base/rules");

function loadJson<T>(filename: string): T {
  const fullPath = path.join(KB_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(
      `[tax-rules-loader] Knowledge base file not found: ${fullPath}\n` +
      `Ensure knowledge-base/rules/ contains all required JSON files.\n` +
      `See knowledge-base/rules/ for the expected file structure.`
    );
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as T;
  } catch (err) {
    throw new Error(
      `[tax-rules-loader] Failed to parse ${filename}: ${(err as Error).message}`
    );
  }
}

// ── Type definitions (mirror the JSON schemas) ────────────────────────────────

export interface BracketEntry  { rate: number; min: number; max: number | null; }
export interface LtcgEntry     { rate: number; max: number | null; }
export interface FilingStatusMap<T> { single: T; mfj: T; mfs: T; hoh: T; }

export interface TaxYear2025Rules {
  _meta: Record<string, string>;
  ordinaryIncomeBrackets: FilingStatusMap<BracketEntry[]>;
  standardDeductions: FilingStatusMap<number>;
  ltcgBrackets: FilingStatusMap<LtcgEntry[]>;
  seTax: {
    ssWageBase: number;
    ssRate: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: number;
    netEarningsMultiplier: number;
  };
  niit: {
    rate: number;
    thresholds: FilingStatusMap<number>;
  };
  qbi: {
    rateBaseline: number;
    phaseOutThresholds: FilingStatusMap<number>;
  };
  saltCap: { baseline: number; notes: string };
  ctcBaseline: number;
  socialSecurity: {
    tier1ThresholdSingle: number;
    tier1ThresholdMfj: number;
    tier2ThresholdSingle: number;
    tier2ThresholdMfj: number;
    tier1TaxableRate: number;
    tier2TaxableRate: number;
  };
}

export interface BBBProvision {
  enabled?: boolean;
  maxExclusion?: number;
  amount?: number;
  ageThreshold?: number;
  maxDeduction?: number;
  requiresUsAssembly?: boolean;
  amountPerChild?: number;
  baselinePreBBB?: number;
  rate?: number;
  madePermanent?: boolean;
  byFilingStatus?: Record<string, number>;
  baselineTcja?: number;
  notes?: string;
}

export interface BigBeautifulBillRules {
  _meta: Record<string, string>;
  enacted: boolean;
  appliesFromTaxYear: number;
  provisions: {
    tipIncomeExclusion:        BBBProvision & { maxExclusion: number };
    overtimeExclusion:         BBBProvision & { maxExclusion: number };
    seniorDeduction:           BBBProvision & { amount: number; ageThreshold: number };
    carLoanInterestDeduction:  BBBProvision & { maxDeduction: number; requiresUsAssembly: boolean };
    childTaxCredit:            BBBProvision & { amountPerChild: number; baselinePreBBB: number };
    saltCap:                   BBBProvision & { byFilingStatus: Record<string, number>; baselineTcja: number };
    qbiDeduction:              BBBProvision & { rate: number; baselinePreBBB: number };
    estateAndGiftTaxExemption: BBBProvision;
    bonusDepreciation:         BBBProvision;
  };
}

export interface IrsLimits2025 {
  _meta: Record<string, string>;
  retirementAccounts: {
    traditionalIra: {
      limit: number;
      catchUpAge50: number;
    };
    rothIra: {
      limit: number;
      catchUpAge50: number;
    };
  };
  hsa: {
    selfOnly: { limit: number; catchUpAge55: number };
    family:   { limit: number; catchUpAge55: number };
  };
  educatorExpenses: { maxDeduction: number };
  studentLoanInterest: {
    maxDeduction: number;
    phaseOutStart: { single: number; mfj: number };
    phaseOutEnd:   { single: number; mfj: number };
    notes?: string;
  };
  estimatedTax: {
    minimumOwedBeforeRequiringPayments: number;
  };
}

// ── Load once at module init — fail loud if files are missing ─────────────────

export const TAX_RULES  = loadJson<TaxYear2025Rules>("tax-year-2025.json");
export const BBB_RULES  = loadJson<BigBeautifulBillRules>("big-beautiful-bill.json");
export const IRS_LIMITS = loadJson<IrsLimits2025>("irs-limits-2025.json");

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert null max values → Infinity (JSON cannot represent Infinity). */
export function normalizeBrackets(
  brackets: Array<{ rate: number; min: number; max: number | null }>
): Array<{ rate: number; min: number; max: number }> {
  return brackets.map(b => ({ ...b, max: b.max ?? Infinity }));
}

export function normalizeLtcg(
  brackets: Array<{ rate: number; max: number | null }>
): Array<{ rate: number; max: number }> {
  return brackets.map(b => ({ ...b, max: b.max ?? Infinity }));
}

/** Get the SALT cap for a given filing status. Respects BBB if enacted. */
export function getSaltCap(filingStatus: string, bbbEnacted: boolean): number {
  if (bbbEnacted) {
    return BBB_RULES.provisions.saltCap.byFilingStatus[filingStatus]
      ?? BBB_RULES.provisions.saltCap.baselineTcja;
  }
  return TAX_RULES.saltCap.baseline;
}

/** Get the QBI deduction rate. */
export function getQBIRate(bbbEnacted: boolean): number {
  return bbbEnacted
    ? (BBB_RULES.provisions.qbiDeduction.rate ?? TAX_RULES.qbi.rateBaseline)
    : TAX_RULES.qbi.rateBaseline;
}

/** Get the CTC amount per qualifying child. */
export function getCTCPerChild(bbbEnacted: boolean): number {
  return bbbEnacted
    ? BBB_RULES.provisions.childTaxCredit.amountPerChild
    : TAX_RULES.ctcBaseline;
}
