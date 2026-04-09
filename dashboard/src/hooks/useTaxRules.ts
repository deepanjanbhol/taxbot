/**
 * useTaxRules.ts
 *
 * Fetches KB-driven tax rule values from /api/tax-rules at startup.
 * Components use this instead of hardcoding IRS constants so that
 * rule updates in knowledge-base/rules/ automatically flow to the UI.
 *
 * Result is cached module-level after first fetch — no repeated network calls.
 */

import { useEffect, useState } from "react";

export interface TaxRulesData {
  taxYear: number;
  bbbEnacted: boolean;

  // Big Beautiful Bill provisions
  tipExclusionMax: number;
  overtimeExclusionMax: number;
  seniorDeductionAmount: number;
  carLoanInterestMax: number;
  ctcAmountBBB: number;
  ctcAmountBaseline: number;
  qbiRateBBB: number;
  qbiRateBaseline: number;
  saltCapBaseline: number;
  saltCapBBB: Record<string, number>;  // { single, mfj, mfs, hoh }

  // IRS limits
  studentLoanInterestMax: number;
  studentLoanPhaseOutStart: Record<string, number>;  // { single, mfj }
  educatorExpensesMax: number;
  iraLimit: number;
  iraCatchUp50: number;
  hsaSelfOnlyLimit: number;
  hsaFamilyLimit: number;
  standardDeductions: Record<string, number>;
}

// Module-level cache — shared across all component instances
const _cache: { data?: TaxRulesData } = {};

export function useTaxRules(): TaxRulesData | null {
  const [rules, setRules] = useState<TaxRulesData | null>(_cache.data ?? null);

  useEffect(() => {
    if (_cache.data) {
      setRules(_cache.data);
      return;
    }
    fetch("/api/tax-rules")
      .then(r => r.json())
      .then((data: TaxRulesData) => {
        _cache.data = data;
        setRules(data);
      })
      .catch(() => {/* silently fall back to static values */});
  }, []);

  return rules;
}

/** Format a rate (0.23 → "23%") */
export function fmtRate(r: number): string {
  return `${(r * 100).toFixed(0)}%`;
}

/** Format a dollar amount (25000 → "$25,000") */
export function fmtAmt(n: number): string {
  return `$${n.toLocaleString()}`;
}
