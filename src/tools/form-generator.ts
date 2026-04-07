/**
 * form-generator.ts
 * Generates a structured Form 1040 report from extracted tax data.
 * Output is a formatted text representation of the 1040 — suitable for
 * review with a CPA and for reference when filling the official IRS PDF.
 */

import type { FilingStatus, TaxSummary } from "../utils/tax-calculator.js";
import { computeFullTax, fmtDollar } from "../utils/tax-calculator.js";

export interface TaxInputData {
  // Taxpayer info
  taxpayerName: string;
  ssn: string;                // last 4 digits only for display
  filingStatus: FilingStatus;
  spouseName?: string;
  address?: string;
  taxYear: number;

  // Dependents
  dependentsUnder17: number;
  otherDependents: number;

  // Income
  wages: number;
  tipIncome: number;              // potentially excludable
  overtimePay: number;            // potentially excludable
  interest: number;
  qualifiedDividends: number;
  ordinaryDividends: number;
  ltcg: number;                   // long-term capital gains
  stcg: number;                   // short-term (taxed as ordinary)
  businessIncome: number;         // Schedule C
  rentalIncome: number;           // Schedule E (may be negative for losses)
  royaltyIncome: number;          // 1099-MISC Box 2 (rolled into otherIncome for tax calc)
  unemploymentComp: number;
  socialSecurity: number;         // gross SS benefits
  retirementDist: number;         // 1099-R taxable
  otherIncome: number;

  // Adjustments (Schedule 1)
  studentLoanInterest: number;
  educatorExpenses: number;
  hsaDeduction: number;
  selfEmployedHealthInsurance: number;
  iraDeduction: number;
  otherAdjustments: number;

  // Itemized Deductions (Schedule A) — set 0 if taking standard
  mortgageInterest: number;
  saltPaid: number;               // state/local taxes paid
  charitableCash: number;
  charitableNonCash: number;
  medicalExpenses: number;        // before 7.5% AGI floor
  otherItemized: number;

  // Business income for QBI
  qbi: number;                    // qualified business income

  // Credits
  childTaxCredit: number;         // computed based on children
  childCareCredit: number;
  educationCredit: number;
  eitc: number;
  retirementCredit: number;
  foreignTaxCredit: number;
  otherCredits: number;

  // Payments
  federalWithholding: number;
  estimatedTaxPayments: number;

  // Flags
  age65OrOlder: boolean;
  bigBeautifulBillEnacted: boolean;
  receivedTips: boolean;
  receivedOvertime: boolean;
  hasCarLoan: boolean;
  carLoanInterest: number;        // for new deduction
  isUsMadeVehicle: boolean;
}

/** Compute how much SS income is taxable (provisional income test). */
function taxableSocialSecurity(ssBenefits: number, agi_beforeSS: number, interest: number): number {
  const provisional = agi_beforeSS + interest + ssBenefits * 0.5;

  if (provisional <= 25_000) return 0;
  if (provisional <= 34_000) return Math.min(ssBenefits * 0.5, (provisional - 25_000) * 0.5);
  return Math.min(ssBenefits * 0.85, 4_500 + (provisional - 34_000) * 0.85);
}

/** Format the complete Form 1040 as a readable text document. */
export function generateForm1040(input: TaxInputData): string {
  const {
    taxpayerName, ssn, filingStatus, spouseName, taxYear,
    dependentsUnder17, otherDependents,
    wages, tipIncome, overtimePay,
    interest, ordinaryDividends, qualifiedDividends, ltcg, stcg,
    businessIncome, rentalIncome, royaltyIncome, unemploymentComp, socialSecurity,
    retirementDist, otherIncome,
    studentLoanInterest, educatorExpenses, hsaDeduction,
    selfEmployedHealthInsurance, iraDeduction, otherAdjustments,
    mortgageInterest, saltPaid, charitableCash, charitableNonCash,
    medicalExpenses,
    qbi,
    childTaxCredit: ctcInput, childCareCredit, educationCredit, eitc,
    retirementCredit, foreignTaxCredit, otherCredits,
    federalWithholding, estimatedTaxPayments,
    age65OrOlder, bigBeautifulBillEnacted, receivedTips, receivedOvertime,
    hasCarLoan, carLoanInterest, isUsMadeVehicle,
  } = input;

  // Big Beautiful Bill adjustments
  const excludedTips = (receivedTips && bigBeautifulBillEnacted) ? Math.min(tipIncome, 25_000) : 0;
  const excludedOvertime = (receivedOvertime && bigBeautifulBillEnacted) ? Math.min(overtimePay, 12_500) : 0;
  const seniorDeduction = (age65OrOlder && bigBeautifulBillEnacted) ? 4_000 : 0;
  const carLoanDeduction = (hasCarLoan && isUsMadeVehicle && bigBeautifulBillEnacted)
    ? Math.min(carLoanInterest, 10_000) : 0;
  const saltCap = bigBeautifulBillEnacted ? 30_000 : 10_000;

  // Adjusted wage income
  const taxableWages = wages + Math.max(0, tipIncome - excludedTips) + Math.max(0, overtimePay - excludedOvertime);

  // Social Security taxability (rough calc)
  const agiBeforeSS = taxableWages + interest + ordinaryDividends + ltcg + stcg +
    businessIncome + rentalIncome + unemploymentComp + retirementDist + otherIncome;
  const taxableSS = taxableSocialSecurity(socialSecurity, agiBeforeSS, interest);

  // Gross income
  const totalWages       = taxableWages;
  const totalInterest    = interest;
  const totalDividends   = ordinaryDividends;
  const totalCapGains    = ltcg + stcg;
  const totalOtherIncome = taxableSS + retirementDist + unemploymentComp + royaltyIncome + otherIncome;
  const grossIncome      = totalWages + totalInterest + totalDividends + totalCapGains +
                           businessIncome + rentalIncome + totalOtherIncome;

  // Schedule 1 adjustments
  const sched1Adjustments = studentLoanInterest + educatorExpenses + hsaDeduction +
    selfEmployedHealthInsurance + iraDeduction + otherAdjustments + seniorDeduction + carLoanDeduction;

  // Itemized deductions
  // First-pass AGI estimate (without SE tax deduction) to apply the 7.5% medical floor.
  // SE tax deduction is a small second-order effect; this approximation is close enough for an estimate.
  const estimatedAGI  = Math.max(0, grossIncome - sched1Adjustments);
  const medFloor      = estimatedAGI * 0.075;
  const medAfterFloor = Math.max(0, medicalExpenses - medFloor);
  const cappedSalt    = Math.min(saltPaid, saltCap);
  const totalItemized = mortgageInterest + cappedSalt + charitableCash + charitableNonCash +
                        medAfterFloor;

  // Computed CTC
  const ctcPerChild = bigBeautifulBillEnacted ? 2_500 : 2_000;
  const computedCTC  = dependentsUnder17 * ctcPerChild;
  const otherDepCredit = otherDependents * 500;
  const totalCredits = computedCTC + otherDepCredit + childCareCredit + educationCredit +
                       eitc + retirementCredit + foreignTaxCredit + otherCredits;

  // Run full tax computation
  const tax = computeFullTax({
    filingStatus,
    wages: totalWages,
    interest: totalInterest,
    dividends: totalDividends,
    qualifiedDividends,
    ltcg,
    businessIncome,
    rentalIncome,
    otherIncome: totalOtherIncome,
    adjustments: sched1Adjustments,
    itemizedDeductions: totalItemized,
    qbi,
    credits: totalCredits,
    withholding: federalWithholding,
    estimatedPayments: estimatedTaxPayments,
    bigBeautifulBillEnacted,
  });

  const sep = "─".repeat(60);
  const line = (label: string, value: string, note = "") =>
    `  ${label.padEnd(40)} ${value.padStart(12)}${note ? `   (${note})` : ""}`;

  const statusLabels: Record<FilingStatus, string> = {
    single: "Single",
    mfj:    "Married Filing Jointly",
    mfs:    "Married Filing Separately",
    hoh:    "Head of Household",
  };

  const formLines: string[] = [];

  formLines.push(`
╔══════════════════════════════════════════════════════════════╗
║          FORM 1040 — U.S. Individual Income Tax Return       ║
║                     TAX YEAR ${taxYear}                            ║
╚══════════════════════════════════════════════════════════════╝

TAXPAYER INFORMATION
${sep}
${line("Name:", taxpayerName)}
${line("SSN (last 4):", `xxx-xx-${ssn}`)}
${line("Filing Status:", statusLabels[filingStatus])}
${spouseName ? line("Spouse:", spouseName) : ""}
${line("Qualifying children (under 17):", String(dependentsUnder17))}
${line("Other dependents:", String(otherDependents))}
${bigBeautifulBillEnacted ? "\n  ✓ Big Beautiful Bill (One Big Beautiful Bill Act) provisions applied — verify current law before filing" : ""}

INCOME
${sep}
${line("1z  Total wages, salaries, tips", fmtDollar(totalWages))}
${excludedTips > 0 ? line("    (Excluded tip income)", fmtDollar(-excludedTips), "Big Beautiful Bill") : ""}
${excludedOvertime > 0 ? line("    (Excluded overtime pay)", fmtDollar(-excludedOvertime), "Big Beautiful Bill") : ""}
${line("2b  Taxable interest", fmtDollar(totalInterest))}
${line("3a  Qualified dividends", fmtDollar(qualifiedDividends))}
${line("3b  Ordinary dividends", fmtDollar(totalDividends))}
${line("7   Capital gain or (loss)", fmtDollar(totalCapGains))}
${businessIncome !== 0 ? line("Sch C  Business income (loss)", fmtDollar(businessIncome)) : ""}
${rentalIncome !== 0 ? line("Sch E  Rental / partnership income", fmtDollar(rentalIncome)) : ""}
${royaltyIncome > 0 ? line("       Royalties (1099-MISC Box 2)", fmtDollar(royaltyIncome)) : ""}
${taxableSS > 0 ? line("6b  Social Security (taxable portion)", fmtDollar(taxableSS)) : ""}
${retirementDist > 0 ? line("4b  IRA / pension distributions", fmtDollar(retirementDist)) : ""}
${unemploymentComp > 0 ? line("    Unemployment compensation", fmtDollar(unemploymentComp)) : ""}
${otherIncome > 0 ? line("8   Other income", fmtDollar(otherIncome)) : ""}
${sep}
${line("9   TOTAL INCOME", fmtDollar(grossIncome))}

ADJUSTMENTS TO INCOME  (Schedule 1, Part II)
${sep}
${educatorExpenses > 0 ? line("    Educator expenses", fmtDollar(-educatorExpenses)) : ""}
${hsaDeduction > 0 ? line("    HSA deduction", fmtDollar(-hsaDeduction)) : ""}
${studentLoanInterest > 0 ? line("    Student loan interest", fmtDollar(-studentLoanInterest)) : ""}
${selfEmployedHealthInsurance > 0 ? line("    Self-employed health insurance", fmtDollar(-selfEmployedHealthInsurance)) : ""}
${iraDeduction > 0 ? line("    IRA deduction", fmtDollar(-iraDeduction)) : ""}
${tax.seTax > 0 ? line("    Deductible SE tax (50%)", fmtDollar(-tax.seTax / 2)) : ""}
${seniorDeduction > 0 ? line("    Senior deduction (age 65+)", fmtDollar(-seniorDeduction), "Big Beautiful Bill") : ""}
${carLoanDeduction > 0 ? line("    Car loan interest (US-made)", fmtDollar(-carLoanDeduction), "Big Beautiful Bill") : ""}
${otherAdjustments > 0 ? line("    Other adjustments", fmtDollar(-otherAdjustments)) : ""}
${sep}
${line("11  ADJUSTED GROSS INCOME (AGI)", fmtDollar(tax.agi))}

DEDUCTIONS
${sep}
${line("    Standard deduction", fmtDollar(tax.standardDeduction))}
${totalItemized > 0 ? line("    Itemized deductions (Schedule A)", fmtDollar(totalItemized)) : ""}
${medAfterFloor > 0 ? line("      (Medical: " + fmtDollar(medicalExpenses) + " less 7.5% AGI floor)", fmtDollar(medAfterFloor), "net deductible") : ""}
${line("12  DEDUCTION USED", fmtDollar(tax.deductionUsed), tax.deductionUsed === tax.standardDeduction ? "standard" : "itemized")}
${tax.qbiDeduction > 0 ? line("13  QBI deduction", fmtDollar(tax.qbiDeduction), bigBeautifulBillEnacted ? "23%" : "20%") : ""}
${sep}
${line("15  TAXABLE INCOME", fmtDollar(tax.taxableIncome))}

TAX COMPUTATION
${sep}
${line("16  Tax on ordinary income", fmtDollar(tax.ordinaryTax))}
${tax.ltcgTax > 0 ? line("    LTCG / qualified dividends tax", fmtDollar(tax.ltcgTax)) : ""}
${tax.seTax > 0 ? line("    Self-employment tax (Sch SE)", fmtDollar(tax.seTax)) : ""}
${tax.niit > 0 ? line("    Net Investment Income Tax (3.8%)", fmtDollar(tax.niit)) : ""}
${sep}
${line("24  TOTAL TAX BEFORE CREDITS", fmtDollar(tax.totalTax))}

CREDITS
${sep}
${computedCTC > 0 ? line("19  Child Tax Credit", fmtDollar(-computedCTC), `${dependentsUnder17} × ${fmtDollar(ctcPerChild)}`) : ""}
${otherDepCredit > 0 ? line("    Credit for other dependents", fmtDollar(-otherDepCredit)) : ""}
${childCareCredit > 0 ? line("    Child & Dependent Care Credit", fmtDollar(-childCareCredit)) : ""}
${educationCredit > 0 ? line("    Education credit", fmtDollar(-educationCredit)) : ""}
${eitc > 0 ? line("    Earned Income Credit (EITC)", fmtDollar(-eitc)) : ""}
${retirementCredit > 0 ? line("    Retirement Savings Credit", fmtDollar(-retirementCredit)) : ""}
${foreignTaxCredit > 0 ? line("    Foreign Tax Credit", fmtDollar(-foreignTaxCredit)) : ""}
${otherCredits > 0 ? line("    Other credits", fmtDollar(-otherCredits)) : ""}
${sep}
${line("24  TOTAL TAX AFTER CREDITS", fmtDollar(tax.totalTaxAfterCredits))}

PAYMENTS
${sep}
${line("25  Federal income tax withheld (W-2)", fmtDollar(federalWithholding))}
${estimatedTaxPayments > 0 ? line("26  Estimated tax payments", fmtDollar(estimatedTaxPayments)) : ""}
${sep}
${line("33  TOTAL PAYMENTS", fmtDollar(tax.totalPayments))}

RESULT
${sep}
${tax.refundOrOwed >= 0
  ? line("35a REFUND", fmtDollar(tax.refundOrOwed))
  : line("37  AMOUNT YOU OWE", fmtDollar(-tax.refundOrOwed))}

SUMMARY METRICS
${sep}
${line("    Effective Tax Rate:", `${tax.effectiveRate}%`)}
${line("    Marginal Tax Rate:", `${(tax.marginalRate * 100).toFixed(0)}%`)}
${line("    AGI:", fmtDollar(tax.agi))}

═══════════════════════════════════════════════════════════════
⚠  IMPORTANT DISCLAIMER
═══════════════════════════════════════════════════════════════
This is an AI-generated estimate for review purposes only.
It is NOT a filed tax return. Figures may be incomplete based
on available documents. Always review with a licensed CPA or EA
before filing. IRS publication 17 and official Form 1040
instructions are the authoritative source.
═══════════════════════════════════════════════════════════════
Generated: ${new Date().toISOString()}
`);

  return formLines.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Generate a compact SMS-friendly summary (under 1600 chars). */
export function generateSmsSummary(input: TaxInputData, tax: TaxSummary): string {
  const resultLine = tax.refundOrOwed >= 0
    ? `REFUND: ${fmtDollar(tax.refundOrOwed)}`
    : `YOU OWE: ${fmtDollar(-tax.refundOrOwed)}`;

  return [
    `📊 TAX YEAR ${input.taxYear} ESTIMATE`,
    `Taxpayer: ${input.taxpayerName}`,
    `Status: ${input.filingStatus.toUpperCase()}`,
    ``,
    `Gross Income: ${fmtDollar(tax.grossIncome)}`,
    `AGI: ${fmtDollar(tax.agi)}`,
    `Taxable Income: ${fmtDollar(tax.taxableIncome)}`,
    `Total Tax: ${fmtDollar(tax.totalTaxAfterCredits)}`,
    `Effective Rate: ${tax.effectiveRate}%`,
    ``,
    `✅ ${resultLine}`,
    ``,
    `⚠ ESTIMATE ONLY — review with CPA before filing`,
  ].join("\n");
}
