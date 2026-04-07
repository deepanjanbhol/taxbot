/**
 * StepDetail.tsx
 * Slide-in drawer showing full detail for a clicked pipeline step.
 * Each step type renders its own structured view with numbers, sources, and IRS references.
 */

import { X, FileText, Mail, Calculator, Users, MessageSquare, ExternalLink, AlertTriangle, CheckCircle, Zap, MessageCircleQuestion, HelpCircle } from "lucide-react";
import type { DynamicStep } from "../types/pipeline";

// ── IRS References ─────────────────────────────────────────────────────────────

const IRS_REFS: Record<string, { label: string; url: string; desc: string }> = {
  pub17:    { label: "IRS Pub. 17",         url: "https://www.irs.gov/publications/p17",            desc: "Your Federal Income Tax — comprehensive guide" },
  pub525:   { label: "IRS Pub. 525",        url: "https://www.irs.gov/publications/p525",           desc: "Taxable and Nontaxable Income" },
  pub550:   { label: "IRS Pub. 550",        url: "https://www.irs.gov/publications/p550",           desc: "Investment Income and Expenses" },
  pub587:   { label: "IRS Pub. 587",        url: "https://www.irs.gov/publications/p587",           desc: "Business Use of Your Home" },
  pub590a:  { label: "IRS Pub. 590-A",      url: "https://www.irs.gov/publications/p590a",          desc: "Contributions to IRAs" },
  pub590b:  { label: "IRS Pub. 590-B",      url: "https://www.irs.gov/publications/p590b",          desc: "Distributions from IRAs" },
  pub946:   { label: "IRS Pub. 946",        url: "https://www.irs.gov/publications/p946",           desc: "How to Depreciate Property" },
  f1040i:   { label: "Form 1040 Instructions", url: "https://www.irs.gov/instructions/i1040gi",     desc: "Official Form 1040 line-by-line instructions" },
  schedA:   { label: "Schedule A Instr.",   url: "https://www.irs.gov/instructions/i1040sca",       desc: "Itemized Deductions instructions" },
  schedC:   { label: "Schedule C Instr.",   url: "https://www.irs.gov/instructions/i1040sc",        desc: "Profit or Loss from Business" },
  schedD:   { label: "Schedule D Instr.",   url: "https://www.irs.gov/instructions/i1040sd",        desc: "Capital Gains and Losses" },
  schedSE:  { label: "Schedule SE Instr.",  url: "https://www.irs.gov/instructions/i1040sse",       desc: "Self-Employment Tax" },
  irs_rpo:  { label: "IRS Tax Pro Directory", url: "https://irs.treasury.gov/rpo/rpo.jsf",          desc: "Find licensed tax preparers (CPA, EA, Attorney)" },
  bbb_text: { label: "H.R.1 (119th Congress)", url: "https://www.congress.gov/bill/119th-congress/house-bill/1", desc: "One Big Beautiful Bill Act full text" },
  tc_tips:  { label: "IRC § 3402(p)",       url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section3402", desc: "Withholding on supplemental wages including tips" },
};

function RefLink({ id }: { id: string }) {
  const ref = IRS_REFS[id];
  if (!ref) return null;
  return (
    <a href={ref.url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-500/20 transition-colors">
      {ref.label} <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

function RefRow({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {ids.map(id => <RefLink key={id} id={id} />)}
    </div>
  );
}

// ── Individual step views ──────────────────────────────────────────────────────

function ScanFilesDetail({ result }: { result: Record<string, unknown> }) {
  const docs = (result.documents ?? []) as Array<{
    filename: string; type: string; sizeBytes: number; hasError: boolean; isImageBased?: boolean; preview?: string;
  }>;
  const errors  = (result.errors ?? []) as string[];
  const summary = result.summary as string | undefined;

  // Group by type
  const byType = docs.reduce<Record<string, typeof docs>>((acc, d) => {
    (acc[d.type] ??= []).push(d);
    return acc;
  }, {});

  const typeOrder = ["W2", "1099-NEC", "1099-INT", "1099-DIV", "1099-B", "1099-R", "SSA-1099", "1099-G", "1099-K", "1099-MISC", "1098", "1098-T", "1098-E", "K1", "RECEIPT", "OTHER"];
  const sortedTypes = [
    ...typeOrder.filter(t => byType[t]),
    ...Object.keys(byType).filter(t => !typeOrder.includes(t)),
  ];

  return (
    <div className="space-y-4">
      {summary && <p className="text-sm text-slate-300 bg-slate-800 px-3 py-2 rounded">{summary}</p>}

      <div className="space-y-3">
        {sortedTypes.map(type => (
          <div key={type}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{type}</span>
              <span className="text-xs text-slate-600">({byType[type]!.length})</span>
            </div>
            <div className="space-y-1">
              {byType[type]!.map((doc, i) => (
                <div key={i} className={`px-3 py-2 rounded border text-xs ${doc.hasError || doc.isImageBased ? "border-amber-500/30 bg-amber-500/5" : "border-slate-700 bg-slate-800/60"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-200">{doc.filename}</span>
                    <span className="text-slate-500 shrink-0">{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                  </div>
                  {doc.isImageBased && <p className="text-amber-400 mt-1">⚠ Image-based PDF — text extraction failed. Re-scan needed.</p>}
                  {doc.preview && !doc.isImageBased && (
                    <pre className="mt-1.5 text-slate-400 whitespace-pre-wrap leading-relaxed line-clamp-4 font-mono text-[10px]">
                      {doc.preview.slice(0, 400)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Errors</p>
          {errors.map((e, i) => <p key={i} className="text-xs text-amber-300 font-mono pl-2">{e}</p>)}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-400 mb-1.5">IRS References</p>
        <RefRow ids={["f1040i", "pub17", "pub525"]} />
      </div>
    </div>
  );
}

function GmailDetail({ result }: { result: Record<string, unknown> }) {
  // Graceful degradation: attempted but did not succeed
  if (result.attempted && !result.succeeded) {
    const reasons   = (result.gmailUnavailableReasons ?? []) as string[];
    const wouldHave = (result.wouldHaveSearchedFor    ?? []) as string[];
    const fallback  = result.fallbackNote  as string | undefined;
    const setupAction = result.setupAction as string | undefined;

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 px-3 py-3 rounded bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Gmail unavailable — running on local documents only</p>
            {fallback && <p className="text-xs text-amber-300/80">{fallback}</p>}
          </div>
        </div>

        {reasons.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Why Gmail was unavailable:</p>
            <ul className="space-y-0.5 text-xs text-slate-400">
              {reasons.map((r, i) => <li key={i} className="flex items-center gap-2"><span className="text-red-400">✗</span>{r}</li>)}
            </ul>
          </div>
        )}

        {wouldHave.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1">Would have searched Gmail for:</p>
            <ul className="space-y-0.5 text-xs text-slate-400">
              {wouldHave.map((s, i) => <li key={i} className="flex items-center gap-2"><span className="text-blue-400">→</span>{s}</li>)}
            </ul>
          </div>
        )}

        {setupAction && (
          <div className="px-3 py-2.5 rounded bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
            <span className="font-semibold">To fix:</span> {setupAction}
          </div>
        )}
      </div>
    );
  }

  const emails = (result.emails ?? []) as Array<{ subject: string; from: string; date: string; bodyText: string; attachmentNames: string[] }>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">{emails.length} tax-related emails found</p>
      {emails.map((e, i) => (
        <div key={i} className="px-3 py-2.5 rounded border border-slate-700 bg-slate-800/60 space-y-1">
          <p className="text-xs font-semibold text-slate-200">{e.subject}</p>
          <p className="text-xs text-slate-500">From: {e.from} · {e.date}</p>
          {e.attachmentNames.length > 0 && <p className="text-xs text-blue-400">📎 {e.attachmentNames.join(", ")}</p>}
          <pre className="text-[10px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed line-clamp-5 mt-1">{e.bodyText?.slice(0, 500)}</pre>
        </div>
      ))}
    </div>
  );
}

interface CalcRow { label: string; value: string; line?: string; note?: string; isBBB?: boolean; isTotal?: boolean; isResult?: boolean; indent?: boolean }

function CalcTable({ rows }: { rows: CalcRow[] }) {
  return (
    <div className="divide-y divide-slate-800 rounded-lg border border-slate-700 overflow-hidden text-xs">
      {rows.filter(r => r.value !== "$0" && r.value !== "").map((row, i) => (
        <div key={i} className={`flex items-baseline justify-between px-3 py-1.5 gap-4 ${
          row.isResult  ? "bg-green-500/10 font-bold text-green-300" :
          row.isTotal   ? "bg-slate-700/40 font-semibold text-slate-200" :
          row.isBBB     ? "bg-amber-500/8 text-amber-200" :
          "text-slate-300"
        }`}>
          <div className={`flex items-center gap-1.5 min-w-0 ${row.indent ? "pl-3" : ""}`}>
            {row.isBBB && <Zap className="w-3 h-3 text-amber-400 shrink-0" />}
            <span className="truncate">{row.label}</span>
            {row.line && <span className="text-slate-600 shrink-0">(L{row.line})</span>}
          </div>
          <div className="text-right shrink-0 font-mono">
            <span>{row.value}</span>
            {row.note && <span className="ml-2 text-slate-500 font-normal text-[10px]">{row.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Form1040Detail({ result }: { result: Record<string, unknown> }) {
  const form1040Text = result.form1040Text as string | undefined;
  const taxInput     = result.taxInput    as Record<string, unknown> | undefined;

  function fmt(n: unknown): string {
    const num = typeof n === "number" ? n : 0;
    if (num === 0) return "$0";
    return num < 0 ? `-$${Math.abs(num).toLocaleString()}` : `$${num.toLocaleString()}`;
  }

  const incomeRows: CalcRow[] = taxInput ? [
    { label: "Wages, salaries, tips",          line: "1z",  value: fmt(taxInput.wages) },
    taxInput.tipIncome ? { label: "Tip income",                        value: fmt(taxInput.tipIncome), isBBB: true, note: "may be excludable", indent: true } : null,
    taxInput.overtimePay ? { label: "Overtime pay",                       value: fmt(taxInput.overtimePay), isBBB: true, note: "may be excludable", indent: true } : null,
    { label: "Interest income",                line: "2b",  value: fmt(taxInput.interest) },
    { label: "Ordinary dividends",             line: "3b",  value: fmt(taxInput.ordinaryDividends) },
    { label: "Qualified dividends",            line: "3a",  value: fmt(taxInput.qualifiedDividends), note: "lower LTCG rate", indent: true },
    { label: "Long-term capital gains",        line: "7",   value: fmt(taxInput.ltcg) },
    { label: "Short-term capital gains",                    value: fmt(taxInput.stcg), note: "taxed as ordinary" },
    { label: "Business income (Sch C)",        line: "Sch C", value: fmt(taxInput.businessIncome) },
    { label: "Rental / partnership income",    line: "Sch E", value: fmt(taxInput.rentalIncome) },
    { label: "Unemployment compensation",                   value: fmt(taxInput.unemploymentComp) },
    { label: "Social Security (gross)",        line: "6a",  value: fmt(taxInput.socialSecurity) },
    { label: "IRA / pension distributions",    line: "4b",  value: fmt(taxInput.retirementDist) },
    { label: "Other income",                               value: fmt(taxInput.otherIncome) },
  ].filter(Boolean) as CalcRow[] : [];

  const adjRows: CalcRow[] = taxInput ? [
    { label: "Student loan interest",        line: "21", value: fmt(taxInput.studentLoanInterest), note: "max $2,500" },
    { label: "Educator expenses",            line: "11", value: fmt(taxInput.educatorExpenses),    note: "max $300" },
    { label: "HSA deduction",                line: "13", value: fmt(taxInput.hsaDeduction) },
    { label: "Self-employed health ins.",    line: "17", value: fmt(taxInput.selfEmployedHealthInsurance) },
    { label: "IRA deduction",                line: "20", value: fmt(taxInput.iraDeduction) },
    { label: "½ SE tax deduction",                       value: fmt(taxInput.otherAdjustments) },
    { label: "Senior deduction (65+)",                   value: fmt(4000), isBBB: true, note: "Big Beautiful Bill" },
    { label: "Car loan interest",                         value: fmt(taxInput.carLoanInterest), isBBB: true, note: "US-made vehicle" },
  ].filter(r => r.value !== "$0") as CalcRow[] : [];

  const deductionRows: CalcRow[] = taxInput ? [
    { label: "Mortgage interest",     line: "A-8a", value: fmt(taxInput.mortgageInterest) },
    { label: "State & local taxes",   line: "A-5",  value: fmt(taxInput.saltPaid),          note: "cap $30K (BBB)", isBBB: !!(taxInput.saltPaid) },
    { label: "Charitable (cash)",     line: "A-11", value: fmt(taxInput.charitableCash) },
    { label: "Charitable (non-cash)", line: "A-12", value: fmt(taxInput.charitableNonCash) },
    { label: "Medical expenses",      line: "A-1",  value: fmt(taxInput.medicalExpenses),   note: "before 7.5% AGI floor" },
  ].filter(r => r.value !== "$0") as CalcRow[] : [];

  // Parse key numbers from form1040Text
  const extract = (pattern: RegExp) => form1040Text?.match(pattern)?.[1] ?? "—";
  const agi          = extract(/ADJUSTED GROSS INCOME.*?(\$[\d,]+)/i);
  const taxableInc   = extract(/TAXABLE INCOME.*?(\$[\d,]+)/i);
  const totalTax     = extract(/TOTAL TAX BEFORE CREDITS.*?(\$[\d,]+)/i);
  const totalCredits = extract(/TOTAL TAX AFTER CREDITS.*?(\$[\d,]+)/i);
  const withheld     = extract(/Federal income tax withheld.*?(\$[\d,]+)/i);
  const refund       = extract(/REFUND.*?(\$[\d,]+)/i);
  const owed         = extract(/AMOUNT YOU OWE.*?(\$[\d,]+)/i);
  const effRate      = extract(/Effective Tax Rate.*?([\d.]+%)/i);
  const margRate     = extract(/Marginal Tax Rate.*?([\d.]+%)/i);

  return (
    <div className="space-y-5">
      {/* Result callout */}
      {(refund !== "—" || owed !== "—") && (
        <div className={`px-4 py-3 rounded-xl border ${refund !== "—" ? "bg-green-500/10 border-green-500/40" : "bg-red-500/10 border-red-500/40"}`}>
          <p className="text-xs text-slate-400 uppercase tracking-wider">{refund !== "—" ? "Estimated Refund" : "Estimated Amount Owed"}</p>
          <p className={`text-2xl font-bold font-mono mt-0.5 ${refund !== "—" ? "text-green-300" : "text-red-300"}`}>
            {refund !== "—" ? refund : owed}
          </p>
          <div className="flex gap-4 mt-2 text-xs text-slate-400">
            <span>Effective rate: <strong className="text-slate-200">{effRate}</strong></span>
            <span>Marginal rate: <strong className="text-slate-200">{margRate}</strong></span>
          </div>
        </div>
      )}

      {/* Calculation waterfall */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">How We Got Here</p>
        <CalcTable rows={[
          { label: "Gross Income",      value: extract(/TOTAL INCOME.*?(\$[\d,]+)/i),  line: "9",  isTotal: true },
          { label: "− Adjustments",     value: `−${extract(/adjustments.*?(\$[\d,]+)/i) || "—"}`, line: "11", indent: true },
          { label: "= AGI",             value: agi,                                   line: "11", isTotal: true },
          { label: "− Deductions",      value: `−${extract(/DEDUCTION USED.*?(\$[\d,]+)/i) || "—"}`, line: "12", indent: true },
          { label: "− QBI Deduction",   value: `−${extract(/QBI deduction.*?(\$[\d,]+)/i) || "0"}`, line: "13", indent: true, isBBB: true },
          { label: "= Taxable Income",  value: taxableInc,                            line: "15", isTotal: true },
          { label: "Tax on ordinary income",  value: extract(/Tax on ordinary income.*?(\$[\d,]+)/i), line: "16", indent: true },
          { label: "LTCG / Qual. div. tax",   value: extract(/LTCG.*?(\$[\d,]+)/i),   indent: true },
          { label: "SE Tax",                  value: extract(/Self-employment tax.*?(\$[\d,]+)/i), indent: true },
          { label: "NIIT (3.8%)",             value: extract(/Net Investment Income.*?(\$[\d,]+)/i), indent: true },
          { label: "= Total Tax",       value: totalTax,   line: "24", isTotal: true },
          { label: "− Credits",         value: `−${extract(/Credits.*?(\$[\d,]+)/i) || "0"}`, line: "19-23", indent: true },
          { label: "= Tax After Credits", value: totalCredits, isTotal: true },
          { label: "− Withholding",     value: `−${withheld}`,                        line: "25", indent: true },
          { label: "= " + (refund !== "—" ? "REFUND" : "AMOUNT OWED"),
            value: refund !== "—" ? refund : owed, isResult: true },
        ]} />
      </div>

      {/* Income breakdown */}
      {incomeRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Income Sources</p>
          <CalcTable rows={incomeRows} />
        </div>
      )}

      {/* Adjustments */}
      {adjRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Above-the-Line Adjustments</p>
          <CalcTable rows={adjRows} />
          <RefRow ids={["pub590a", "pub590b"]} />
        </div>
      )}

      {/* Deductions */}
      {deductionRows.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Itemized Deductions (Schedule A)</p>
          <CalcTable rows={deductionRows} />
          <RefRow ids={["schedA"]} />
        </div>
      )}

      {/* Big Beautiful Bill */}
      <div className="px-3 py-3 rounded-lg bg-amber-500/8 border border-amber-500/30">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="text-xs font-semibold text-amber-300">Big Beautiful Bill Provisions Applied</p>
        </div>
        <ul className="space-y-1 text-xs text-amber-200 pl-1">
          <li>⚡ Tip income exclusion — up to $25,000 (verify enacted)</li>
          <li>⚡ Overtime pay exclusion — up to $12,500 (verify enacted)</li>
          <li>⚡ Senior deduction $4,000 for age 65+ (verify enacted)</li>
          <li>⚡ SALT cap raised to $30,000 (verify enacted)</li>
          <li>⚡ Child Tax Credit raised to $2,500/child (verify enacted)</li>
          <li>⚡ QBI deduction at 23% instead of 20% (verify enacted)</li>
          <li>⚡ Car loan interest up to $10,000 for US-made vehicles (verify enacted)</li>
        </ul>
        <RefRow ids={["bbb_text", "tc_tips"]} />
      </div>

      {/* All IRS references */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">IRS References</p>
        <RefRow ids={["f1040i", "pub17", "pub525", "schedA", "schedC", "schedD", "schedSE", "pub590a"]} />
      </div>

      {/* Full raw form */}
      {form1040Text && (
        <details className="group">
          <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 select-none">
            View full Form 1040 text ▾
          </summary>
          <pre className="mt-2 text-[10px] font-mono text-slate-400 whitespace-pre-wrap leading-relaxed bg-slate-950 p-3 rounded border border-slate-800 max-h-96 overflow-auto">
            {form1040Text}
          </pre>
        </details>
      )}
    </div>
  );
}

function FindCPADetail({ result }: { result: Record<string, unknown> }) {
  const cpas = (result.cpas ?? []) as Array<{ name: string; type: string; rating?: number; estimatedPrice?: string; specialties: string[]; phone?: string }>;
  const noLocationNote = result.noLocationNote as string | undefined;
  const irsDirectoryUrl = result.irsDirectoryUrl as string | undefined;

  return (
    <div className="space-y-3">
      {noLocationNote && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>{noLocationNote}</span>
        </div>
      )}

      <p className="text-sm text-slate-300">{cpas.length} tax professionals found</p>
      {cpas.map((cpa, i) => (
        <div key={i} className="px-3 py-2.5 rounded border border-slate-700 bg-slate-800/60 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200">{cpa.name}</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">{cpa.type}</span>
          </div>
          {cpa.rating    && <p className="text-amber-400">⭐ {cpa.rating}</p>}
          {cpa.estimatedPrice && <p className="text-green-400 font-mono">💰 {cpa.estimatedPrice}</p>}
          {cpa.specialties?.length > 0 && <p className="text-slate-400">🎯 {cpa.specialties.join(", ")}</p>}
          {cpa.phone     && <p className="text-blue-400 font-mono">📞 {cpa.phone}</p>}
        </div>
      ))}

      <div>
        <p className="text-xs font-semibold text-slate-400 mb-1.5">IRS References</p>
        {irsDirectoryUrl && (
          <a href={irsDirectoryUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-500/20 transition-colors mb-1.5">
            IRS Tax Pro Directory <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        <RefRow ids={["irs_rpo"]} />
      </div>
    </div>
  );
}

function SendSMSDetail({ result }: { result: Record<string, unknown> }) {
  const success      = result.success      as boolean | undefined;
  const ids          = (result.messageIds ?? []) as string[];
  const twilioMissing = result.twilioMissing as boolean | undefined;
  const smsText      = result.smsText      as string | undefined;
  const snapshotFile = result.snapshotFile as string | undefined;
  const setupAction  = result.setupAction  as string | undefined;

  // Twilio not configured — show snapshot
  if (twilioMissing) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 px-3 py-3 rounded bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">SMS not sent — Twilio not configured</p>
            <p className="text-xs text-amber-300/80">Your tax summary has been saved as a snapshot file instead.</p>
          </div>
        </div>

        {snapshotFile && (
          <div className="text-xs">
            <p className="font-semibold text-slate-400 mb-1">Snapshot saved to:</p>
            <code className="block px-2 py-1.5 bg-slate-800 rounded border border-slate-700 text-green-300 font-mono break-all">{snapshotFile}</code>
          </div>
        )}

        {setupAction && (
          <div className="px-3 py-2.5 rounded bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
            <span className="font-semibold">To enable SMS:</span> {setupAction}
          </div>
        )}

        {smsText && (
          <details className="group">
            <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 select-none">
              View SMS snapshot content ▾
            </summary>
            <pre className="mt-2 text-[10px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-950 p-3 rounded border border-slate-800 max-h-80 overflow-auto">
              {smsText}
            </pre>
          </details>
        )}
      </div>
    );
  }

  // Sent (or failed to send)
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 px-3 py-3 rounded border text-sm ${success ? "bg-green-500/10 border-green-500/40 text-green-300" : "bg-red-500/10 border-red-500/40 text-red-300"}`}>
        {success ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
        {success ? `Sent ${ids.length} message${ids.length !== 1 ? "s" : ""}` : (result.error as string ?? "Failed")}
      </div>
      {ids.length > 0 && (
        <div className="text-xs font-mono text-slate-400 space-y-0.5">
          {ids.map((id, i) => <div key={i} className="px-2 py-1 bg-slate-800 rounded">Msg {i + 1}: {id}</div>)}
        </div>
      )}
      {smsText && (
        <details className="group">
          <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 select-none">
            View sent message content ▾
          </summary>
          <pre className="mt-2 text-[10px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-950 p-3 rounded border border-slate-800 max-h-80 overflow-auto">
            {smsText}
          </pre>
        </details>
      )}
    </div>
  );
}

// ── Human input step detail ────────────────────────────────────────────────────

function HumanInputDetail({ result }: { result: Record<string, unknown> }) {
  const question = result.question as string | undefined;
  const answer   = result.answer   as string | undefined;
  return (
    <div className="space-y-3">
      {question && (
        <div className="px-3 py-3 rounded bg-amber-500/10 border border-amber-500/30">
          <p className="text-xs font-semibold text-amber-400 mb-1">Question asked</p>
          <p className="text-sm text-slate-200">{question}</p>
        </div>
      )}
      {answer && (
        <div className="px-3 py-3 rounded bg-green-500/10 border border-green-500/30">
          <p className="text-xs font-semibold text-green-400 mb-1">Your answer</p>
          <p className="text-sm text-slate-200 font-medium">{answer}</p>
        </div>
      )}
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────────

function stepIcon(stepId: string): React.ReactNode {
  if (stepId.startsWith("ask_human"))         return <MessageCircleQuestion className="w-4 h-4" />;
  if (stepId === "scan_tax_documents")        return <FileText    className="w-4 h-4" />;
  if (stepId === "extract_income_fields")     return <FileText    className="w-4 h-4" />;
  if (stepId === "compute_form_1040")         return <Calculator  className="w-4 h-4" />;
  if (stepId === "find_tax_professionals")    return <Users       className="w-4 h-4" />;
  if (stepId === "send_tax_report" ||
      stepId === "save_report_snapshot")      return <MessageSquare className="w-4 h-4" />;
  if (stepId === "read_gmail")               return <Mail        className="w-4 h-4" />;
  return <HelpCircle className="w-4 h-4" />;
}

const STEP_DESC: Record<string, string> = {
  scan_tax_documents:     "Scans your local folder for PDFs and extracts text from W-2s, 1099s, 1098s and other tax documents.",
  extract_income_fields:  "Uses AI to extract every dollar value from the scanned documents, matching amounts to the correct IRS box labels.",
  compute_form_1040:      "Computes the complete Form 1040 using 2025 tax brackets, BBB provisions, SALT cap, NIIT, and itemized vs. standard deduction.",
  find_tax_professionals: "Searches the web for CPAs and Enrolled Agents near you with ratings, pricing, and specialty information.",
  send_tax_report:        "Sends the Form 1040 summary and CPA shortlist via Twilio SMS, splitting into segments if needed.",
  save_report_snapshot:   "Saves the tax report snapshot to disk (Twilio not configured).",
  read_gmail:             "Searches Gmail for W-2 notifications, 1099 emails, 1098 statements, and IRS correspondence.",
};

interface StepDetailProps {
  step: DynamicStep;
  onClose: () => void;
}

export function StepDetail({ step, onClose }: StepDetailProps) {
  const result = (step.result ?? {}) as Record<string, unknown>;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[520px] max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 p-2 rounded-lg ${
              step.status === "complete" ? "bg-green-500/20 text-green-400" :
              step.status === "error"    ? "bg-red-500/20 text-red-400" :
              step.isHumanInput          ? "bg-amber-500/20 text-amber-400" :
              step.status === "running"  ? "bg-blue-500/20 text-blue-400" :
              "bg-slate-700 text-slate-400"
            }`}>
              {stepIcon(step.stepId)}
            </div>
            <div>
              <h2 className="font-semibold text-slate-100">{step.label}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{STEP_DESC[step.stepId] ?? step.label}</p>
              {step.durationMs !== undefined && step.durationMs > 0 && (
                <p className="text-xs text-slate-500 mt-1">Completed in {(step.durationMs / 1000).toFixed(2)}s</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 shrink-0 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {step.status === "waiting" && (
            <p className="text-sm text-slate-500">This step has not run yet.</p>
          )}
          {step.status === "error" && (
            <div className="mb-4 px-3 py-3 rounded bg-red-500/10 border border-red-500/30 text-sm text-red-300">
              <p className="font-semibold mb-1">Error</p>
              <p className="font-mono text-xs">{step.error}</p>
            </div>
          )}
          {(step.status === "complete" || step.status === "skipped" || step.status === "error") && (
            <>
              {step.isHumanInput                                 && <HumanInputDetail    result={result} />}
              {step.stepId === "scan_tax_documents"              && <ScanFilesDetail     result={result} />}
              {step.stepId === "read_gmail"                      && <GmailDetail         result={result} />}
              {(step.stepId === "extract_income_fields" ||
                step.stepId === "compute_form_1040")             && <Form1040Detail      result={result} />}
              {step.stepId === "find_tax_professionals"          && <FindCPADetail       result={result} />}
              {(step.stepId === "send_tax_report" ||
                step.stepId === "save_report_snapshot")          && <SendSMSDetail       result={result} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
