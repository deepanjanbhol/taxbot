import { useState } from "react";
import { AlertCircle, CheckCircle, HelpCircle, RotateCcw } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { TaxFormData, FieldMeta, DocConfidence } from "../types/pipeline";
import { useTaxRules, fmtAmt, fmtRate, type TaxRulesData } from "../hooks/useTaxRules";

type NumericField = {
  [K in keyof TaxFormData]: TaxFormData[K] extends FieldMeta ? K : never
}[keyof TaxFormData];

interface FieldDef {
  key: NumericField;
  label: string;
  line?: string;      // 1040 line number
  tooltip?: string;
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

/** Build field sections with tooltips from KB values (falls back to IRS-correct static values). */
function buildSections(r: TaxRulesData | null): SectionDef[] {
  const saltBaselineStr  = r ? fmtAmt(r.saltCapBaseline) : "$10,000";
  const saltMfjStr       = r ? fmtAmt(r.saltCapBBB["mfj"]    ?? 40000) : "$40,000";
  const saltSingleStr    = r ? fmtAmt(r.saltCapBBB["single"]  ?? 20000) : "$20,000";
  const overtimeMaxStr   = r ? fmtAmt(r.overtimeExclusionMax) : "$12,500";
  const carLoanMaxStr    = r ? fmtAmt(r.carLoanInterestMax)   : "$10,000";
  const sliMaxStr        = r ? fmtAmt(r.studentLoanInterestMax) : "$2,500";
  const sliPhaseOutStr   = r ? fmtAmt(r.studentLoanPhaseOutStart["single"] ?? 80000) : "$80,000";
  const educatorMaxStr   = r ? fmtAmt(r.educatorExpensesMax)  : "$300";
  const iraLimitStr      = r ? fmtAmt(r.iraLimit)             : "$7,000";
  const iraCatchUpStr    = r ? fmtAmt(r.iraLimit + r.iraCatchUp50) : "$8,000";

  return [
    {
      title: "Income",
      fields: [
        { key: "wages",             label: "Wages, salaries, tips",       line: "1z" },
        { key: "tipIncome",         label: "Tip income",                  line: "1c",  tooltip: r ? `Excludable up to ${fmtAmt(r.tipExclusionMax)} (Big Beautiful Bill)` : "May be excludable under Big Beautiful Bill" },
        { key: "overtimePay",       label: "Overtime pay",                             tooltip: `May be excludable up to ${overtimeMaxStr} (Big Beautiful Bill)` },
        { key: "interest",          label: "Interest income",             line: "2b" },
        { key: "ordinaryDividends", label: "Ordinary dividends",          line: "3b" },
        { key: "qualifiedDividends",label: "Qualified dividends",         line: "3a",  tooltip: "Taxed at lower LTCG rates — subset of ordinary dividends" },
        { key: "ltcg",              label: "Long-term capital gains",     line: "7" },
        { key: "stcg",              label: "Short-term capital gains",               tooltip: "Taxed as ordinary income" },
        { key: "businessIncome",    label: "Business income (Sch C)",     line: "Sch C" },
        { key: "rentalIncome",      label: "Rental / partnership income", line: "Sch E" },
        { key: "unemploymentComp",  label: "Unemployment compensation" },
        { key: "socialSecurity",    label: "Social Security benefits (gross)", line: "6a", tooltip: "Up to 85% may be taxable depending on income and filing status" },
        { key: "retirementDist",    label: "Taxable IRA / pension distributions", line: "4b" },
        { key: "otherIncome",       label: "Other income" },
      ],
    },
    {
      title: "Adjustments (above-the-line)",
      fields: [
        { key: "studentLoanInterest",          label: "Student loan interest",           line: "Sch1-21", tooltip: `Max ${sliMaxStr}; phase-out starts at ${sliPhaseOutStr} (single)` },
        { key: "educatorExpenses",             label: "Educator expenses",               line: "Sch1-11", tooltip: `Max ${educatorMaxStr} per educator` },
        { key: "hsaDeduction",                 label: "HSA deduction",                   line: "Sch1-13", tooltip: r ? `Self-only ${fmtAmt(r.hsaSelfOnlyLimit)}, family ${fmtAmt(r.hsaFamilyLimit)}` : undefined },
        { key: "selfEmployedHealthInsurance",  label: "Self-employed health insurance",  line: "Sch1-17" },
        { key: "iraDeduction",                 label: "IRA deduction",                   line: "Sch1-20", tooltip: `Max ${iraLimitStr} (${iraCatchUpStr} if age 50+); income limits apply` },
        { key: "otherAdjustments",             label: "Other adjustments" },
      ],
    },
    {
      title: "Itemized Deductions (Schedule A)",
      fields: [
        { key: "mortgageInterest",  label: "Mortgage interest",                    line: "A-8a", tooltip: "From Form 1098; loans up to $750K" },
        { key: "saltPaid",          label: "State & local taxes paid",             line: "A-5",  tooltip: `Cap: ${saltBaselineStr} baseline; BBB raises to ${saltMfjStr} (MFJ) or ${saltSingleStr} (Single/HOH)` },
        { key: "charitableCash",    label: "Charitable cash donations",            line: "A-11" },
        { key: "charitableNonCash", label: "Charitable non-cash donations",        line: "A-12" },
        { key: "medicalExpenses",   label: "Medical expenses (before 7.5% floor)", line: "A-1" },
      ],
    },
    {
      title: "Credits & Payments",
      fields: [
        { key: "childCareCredit",       label: "Child & Dependent Care Credit" },
        { key: "educationCredit",       label: "Education credit (AOC / LLC)" },
        { key: "eitc",                  label: "Earned Income Credit (EITC)" },
        { key: "federalWithholding",    label: "Federal income tax withheld",    line: "25a", tooltip: "Sum of Box 2 from all W-2s and Box 4 from 1099s" },
        { key: "estimatedTaxPayments",  label: "Estimated tax payments",         line: "26" },
        { key: "carLoanInterest",       label: "Car loan interest (US-made vehicle)", tooltip: `Big Beautiful Bill deduction — up to ${carLoanMaxStr} for US-assembled vehicles` },
      ],
    },
  ];
}

function ConfidenceIcon({ confidence }: { confidence: DocConfidence }) {
  if (confidence === "extracted") return <span title="Extracted from document"><CheckCircle className="w-3.5 h-3.5 text-green-400" /></span>;
  if (confidence === "conflict")  return <span title="Conflicting values in documents"><AlertCircle  className="w-3.5 h-3.5 text-red-400" /></span>;
  if (confidence === "missing")   return <span title="Not found in documents — enter manually"><AlertCircle  className="w-3.5 h-3.5 text-amber-400" /></span>;
  return <span title="Inferred"><HelpCircle className="w-3.5 h-3.5 text-gray-400" /></span>;
}

function AmountField({
  fieldDef,
  meta,
  onChange,
}: {
  fieldDef: FieldDef;
  meta: FieldMeta;
  onChange: (val: number) => void;
}) {
  const [raw, setRaw] = useState(meta.value === 0 ? "" : String(meta.value));

  const borderColor =
    meta.confidence === "conflict" ? "border-red-500 focus:border-red-400" :
    meta.confidence === "missing"  ? "border-amber-500/60 focus:border-amber-400" :
    "border-gray-300 focus:border-blue-400";

  return (
    <div className="flex items-center gap-2">
      <label className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs text-gray-700">{fieldDef.label}</span>
          {fieldDef.line && <span className="text-xs text-gray-400">({fieldDef.line})</span>}
          {fieldDef.tooltip && (
            <span title={fieldDef.tooltip} className="cursor-help">
              <HelpCircle className="w-3 h-3 text-gray-400" />
            </span>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number"
            min={0}
            step={1}
            value={raw}
            onChange={e => {
              setRaw(e.target.value);
              const n = parseFloat(e.target.value);
              if (!isNaN(n) && n >= 0) onChange(n);
            }}
            placeholder="0"
            className={`w-full pl-6 pr-2 py-1.5 rounded border bg-white text-right font-mono text-sm text-gray-900 outline-none transition-colors ${borderColor}`}
          />
        </div>
        {meta.sourceDoc && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">from: {meta.sourceDoc}</p>
        )}
      </label>
      <div className="mt-4 shrink-0">
        <ConfidenceIcon confidence={meta.confidence} />
      </div>
    </div>
  );
}

export function NumberEditor() {
  const { formData, updateFormField } = usePipelineStore();
  const [openSection, setOpenSection] = useState<string>("Income");
  const taxRules = useTaxRules();
  const sections = buildSections(taxRules);

  if (!formData) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Run the pipeline first to auto-populate your tax numbers.
      </div>
    );
  }

  const totalConfidence = Object.values(formData)
    .filter((v): v is FieldMeta => typeof v === "object" && v !== null && "confidence" in v)
    .reduce((acc, f) => {
      acc[f.confidence] = (acc[f.confidence] ?? 0) + 1;
      return acc;
    }, {} as Record<DocConfidence, number>);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Review & Edit Numbers</h2>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="flex items-center gap-1 text-green-400">
              <CheckCircle className="w-3 h-3" /> {totalConfidence.extracted ?? 0} extracted
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <AlertCircle className="w-3 h-3" /> {totalConfidence.missing ?? 0} missing
            </span>
            {(totalConfidence.conflict ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle className="w-3 h-3" /> {totalConfidence.conflict} conflicts
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-700 border border-gray-300 hover:border-gray-400 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset to extracted
        </button>
      </div>

      {/* Filing info strip */}
      <div className="flex flex-wrap gap-3 px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-sm">
        <span className="text-gray-700">{formData.taxpayerName || "—"}</span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-400 uppercase text-xs">{formData.filingStatus}</span>
        <span className="text-gray-400">•</span>
        <span className="text-gray-400">TY {formData.taxYear}</span>
        {formData.bigBeautifulBillEnacted && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-amber-400 text-xs">⚡ Big Beautiful Bill applied</span>
          </>
        )}
      </div>

      {/* Accordion sections */}
      {sections.map(section => (
        <div key={section.title} className="rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setOpenSection(openSection === section.title ? "" : section.title)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left transition-colors"
          >
            <span className="font-medium text-gray-700 text-sm">{section.title}</span>
            <span className="text-gray-400 text-xs">{openSection === section.title ? "▲" : "▼"}</span>
          </button>

          {openSection === section.title && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50">
              {section.fields.map(fieldDef => {
                const meta = formData[fieldDef.key] as FieldMeta;
                if (!meta) return null;
                return (
                  <AmountField
                    key={fieldDef.key}
                    fieldDef={fieldDef}
                    meta={meta}
                    onChange={val => updateFormField(fieldDef.key, { ...meta, value: val })}
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}

      {/* Regenerate button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={async () => {
            await fetch("/api/pipeline/step/generate_1040", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ formData }),
            });
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          ↻ Recalculate Form 1040
        </button>
      </div>
    </div>
  );
}
