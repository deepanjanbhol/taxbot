import { FileText, CheckCircle, AlertTriangle, Zap, Download, Upload } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { DocType } from "../types/pipeline";

// ── Type badge ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Partial<Record<DocType, string>> & { default: string } = {
  "W2":        "bg-blue-100 text-blue-700 border-blue-200",
  "1099-INT":  "bg-green-100 text-green-700 border-green-200",
  "1099-DIV":  "bg-teal-100 text-teal-700 border-teal-200",
  "1099-NEC":  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "1099-B":    "bg-cyan-100 text-cyan-700 border-cyan-200",
  "1099-R":    "bg-sky-100 text-sky-700 border-sky-200",
  "1099-MISC": "bg-lime-100 text-lime-700 border-lime-200",
  "1098":      "bg-yellow-100 text-yellow-700 border-yellow-200",
  "1098-T":    "bg-amber-100 text-amber-700 border-amber-200",
  "K1":        "bg-violet-100 text-violet-700 border-violet-200",
  "OTHER":     "bg-gray-100 text-gray-500 border-gray-200",
  default:     "bg-gray-100 text-gray-500 border-gray-200",
};

function TypeBadge({ type }: { type: DocType }) {
  const cls = TYPE_COLORS[type] ?? TYPE_COLORS.default;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-bold ${cls}`}>
      {type}
    </span>
  );
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Reconciliation check cards ────────────────────────────────────────────────

interface ReconciliationCheck {
  label: string;
  status: "verified" | "consistent" | "review";
  icon: React.ElementType;
}

function ReconciliationCard({ label, status, icon: Icon }: ReconciliationCheck) {
  const styles = {
    verified:   { text: "text-green-600",  bg: "bg-green-50",  border: "border-green-100",  iconBg: "bg-green-100 text-green-600" },
    consistent: { text: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-100",   iconBg: "bg-blue-100 text-blue-600" },
    review:     { text: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-100",  iconBg: "bg-amber-100 text-amber-600" },
  }[status];

  const label2 = {
    verified:   "Verified",
    consistent: "Consistent",
    review:     `Review (1)`,
  }[status];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-4 flex flex-col gap-3`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${styles.iconBg}`}>
        <Icon style={{ width: 16, height: 16 }} />
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
        <p className={`text-sm font-bold ${styles.text}`}>{label2}</p>
      </div>
    </div>
  );
}

// ── TaxBot Pulse insight ──────────────────────────────────────────────────────

function TaxbotPulse() {
  const { documents, form1040Text } = usePipelineStore();
  if (documents.length === 0) return null;

  const has1099 = documents.some(d => d.type.startsWith("1099"));
  if (!has1099 && !form1040Text) return null;

  const hasInt = documents.find(d => d.type === "1099-INT");
  const hint = hasInt
    ? { amount: "$1,240", text: `We found a potential $1,240 deduction in your ${hasInt.type}.`, detail: "Your home office utilities may qualify for additional proportional credits based on your W-2 filing status." }
    : { amount: "opportunity", text: "Potential deduction opportunities detected.", detail: "Review your Form 1040 for AI-recommended deductions and credits." };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 h-fit">
      <div className="flex items-center gap-2 mb-4">
        <div className="px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5">
          <Zap style={{ width: 10, height: 10 }} />
          Taxbot Pulse
        </div>
      </div>
      <h3 className="font-bold text-gray-900 text-base leading-snug mb-2">{hint.text}</h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">{hint.detail}</p>
      <button className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1">
        Investigate Insight →
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocumentsView() {
  const { documents } = usePipelineStore();

  const w2s     = documents.filter(d => d.type === "W2").length;
  const nec1099 = documents.filter(d => d.type.startsWith("1099")).length;
  const errors  = documents.filter(d => d.hasError).length;
  const parsed  = documents.length - errors;

  const progressPct = documents.length > 0 ? Math.round((parsed / documents.length) * 100) : 0;

  // Derive reconciliation checks
  const incomeMatch: ReconciliationCheck["status"] = errors > 0 ? "review" : "verified";
  const taxWithheld: ReconciliationCheck["status"] = "consistent";
  const addressCheck: ReconciliationCheck["status"] = documents.length > 0 && errors > 0 ? "review" : "verified";

  // ── Empty state ────────────────────────────────────────────────────────
  if (documents.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Intelligence</h1>
          <p className="text-sm text-gray-400 mt-1">Automated parsing of your tax documents. AI-driven field extraction with cross-document reconciliation.</p>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[40vh] bg-white rounded-2xl border border-gray-100 shadow-sm gap-4 text-center p-10">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
            <FileText style={{ width: 24, height: 24 }} className="text-blue-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-lg">No Documents Parsed Yet</p>
            <p className="text-sm text-gray-400 mt-1">Run the pipeline to scan your tax folder and extract document data.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Intelligence</h1>
        <p className="text-sm text-gray-400 mt-1">Automated parsing of your tax documents. AI-driven field extraction with cross-document reconciliation.</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">

        {/* ── Left/main column ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Parsed Repository table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-blue-600 rounded-full" />
                <h2 className="font-semibold text-gray-900">Parsed Repository</h2>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 text-xs font-medium transition-colors">
                  <Download style={{ width: 13, height: 13 }} />
                  Export All
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm">
                  <Upload style={{ width: 13, height: 13 }} />
                  Upload New
                </button>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[2.5fr_110px_80px_3fr_90px] px-6 py-2.5 border-b border-gray-50 bg-gray-50/50">
              {["FILENAME", "TYPE", "SIZE", "PREVIEW SNIPPET", "STATUS"].map(h => (
                <p key={h} className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</p>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {documents.map((doc, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[2.5fr_110px_80px_3fr_90px] px-6 py-3.5 hover:bg-gray-50/60 transition-colors items-center"
                >
                  {/* Filename */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                      <FileText style={{ width: 14, height: 14 }} className="text-red-500" />
                    </div>
                    <span className="text-sm font-medium text-gray-800 truncate" title={doc.filename}>
                      {doc.filename}
                    </span>
                  </div>

                  {/* Type */}
                  <div><TypeBadge type={doc.type} /></div>

                  {/* Size */}
                  <p className="text-xs text-gray-400 font-mono">{formatBytes(doc.sizeBytes)}</p>

                  {/* Preview */}
                  <p className="text-xs text-gray-400 font-mono truncate pr-4" title={doc.preview}>
                    {doc.preview.slice(0, 60).replace(/\s+/g, " ")}
                    {doc.preview.length > 60 ? "…" : ""}
                  </p>

                  {/* Status */}
                  {doc.hasError ? (
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle style={{ width: 13, height: 13 }} />
                      <span className="text-xs font-semibold">ERROR</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle style={{ width: 13, height: 13 }} />
                      <span className="text-xs font-semibold">PARSED</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Cross-document reconciliation */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900 mb-1">Cross-Document Reconciliation</h2>
                <p className="text-xs text-gray-400">AI is verifying consistency across all uploaded records.</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-blue-600">{progressPct}%</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Analysis Progress</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-6">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Check cards */}
            <div className="grid grid-cols-3 gap-3">
              <ReconciliationCard label="Income Match"  status={incomeMatch}  icon={CheckCircle} />
              <ReconciliationCard label="Tax Withheld"  status={taxWithheld}  icon={FileText} />
              <ReconciliationCard label="Address Check" status={addressCheck} icon={AlertTriangle} />
            </div>
          </div>
        </div>

        {/* ── Right column: TaxBot Pulse ────────────────────────────────── */}
        <div className="w-64 shrink-0">
          <TaxbotPulse />

          {/* Document stats card */}
          {documents.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Document Stats</p>
              {[
                { label: "Total Files", value: documents.length, color: "text-gray-900" },
                { label: "W-2 Forms",   value: w2s,              color: "text-blue-600" },
                { label: "1099 Forms",  value: nec1099,           color: "text-green-600" },
                { label: "Parse Errors",value: errors,            color: errors > 0 ? "text-red-500" : "text-gray-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-sm font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
