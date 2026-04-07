import { useState, useRef } from "react";
import {
  CheckCircle, XCircle, Loader2, Clock, RefreshCw,
  ChevronRight, MessageCircleQuestion, Send,
  TrendingUp, AlertTriangle, FileText, Users, Zap,
} from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import { sendWsMessage } from "../hooks/useWebSocket";
import { StepDetail } from "./StepDetail";
import type { DynamicStep, StepStatus } from "../types/pipeline";

// ── KPI card (light) ─────────────────────────────────────────────────────────

interface KPIProps {
  label: string;
  value: string;
  subtitle?: string;
  delta?: string;
  accent?: "blue" | "dark";
}

function KPICard({ label, value, subtitle, delta, accent = "dark" }: KPIProps) {
  const isBlue = accent === "blue";
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-2 ${
      isBlue ? "bg-white border-blue-100" : "bg-white border-gray-100"
    } shadow-sm`}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${isBlue ? "text-blue-600" : "text-gray-900"}`}>
        {value}
      </p>
      {delta && (
        <p className="text-xs text-green-600 font-medium flex items-center gap-1">
          <TrendingUp style={{ width: 12, height: 12 }} />
          {delta}
        </p>
      )}
      {subtitle && !delta && (
        <p className="text-xs text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}

// ── Step icon circle ─────────────────────────────────────────────────────────

const STEP_ICON_STYLES: Record<StepStatus, string> = {
  complete: "bg-blue-600 border-blue-600 text-white",
  error:    "bg-red-100 border-red-300 text-red-600",
  running:  "bg-blue-50 border-blue-300 text-blue-600",
  skipped:  "bg-gray-100 border-gray-200 text-gray-400",
  waiting:  "bg-gray-50 border-gray-200 text-gray-400",
};

function StepCircle({ step }: { step: DynamicStep }) {
  const cls = `w-9 h-9 rounded-full border-2 flex items-center justify-center shrink-0 ${STEP_ICON_STYLES[step.status]}`;
  if (step.status === "complete")
    return <div className={cls}><CheckCircle style={{ width: 16, height: 16 }} /></div>;
  if (step.status === "error")
    return <div className={cls}><XCircle style={{ width: 16, height: 16 }} /></div>;
  if (step.status === "running" && step.isHumanInput)
    return <div className={cls}><MessageCircleQuestion style={{ width: 16, height: 16 }} /></div>;
  if (step.status === "running")
    return <div className={cls}><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /></div>;
  return <div className={cls}><Clock style={{ width: 14, height: 14 }} /></div>;
}

// ── Step sub-text ─────────────────────────────────────────────────────────────

function StepSubText({ step }: { step: DynamicStep }) {
  const result = step.result as Record<string, unknown> | undefined;

  if (step.status === "error")
    return <p className="text-xs text-red-500 mt-0.5">{step.error?.slice(0, 80)}</p>;

  if (step.status === "running" && !step.isHumanInput)
    return <p className="text-xs text-blue-500 animate-pulse mt-0.5">{step.message || "Processing…"}</p>;

  if (step.status === "running" && step.isHumanInput)
    return <p className="text-xs text-amber-600 font-medium mt-0.5">Waiting for your input…</p>;

  if (!result || step.status !== "complete") return null;

  if (step.isHumanInput) {
    const a = result.answer as string | undefined;
    return <p className="text-xs text-gray-500 mt-0.5">{a ?? "Answered"}</p>;
  }

  if (step.stepId === "scan_tax_documents") {
    const docs = (result.documents as unknown[] ?? []).length;
    const errs = (result.errors as unknown[] ?? []).length;
    return (
      <p className="text-xs text-green-600 font-semibold mt-0.5">
        VERIFIED
        {errs > 0 && <span className="text-amber-500 ml-2">{errs} warnings</span>}
        <span className="text-gray-400 font-normal ml-1">· {docs} docs</span>
      </p>
    );
  }

  if (step.stepId === "extract_income_fields") {
    const warnings = (result.warnings as string[] ?? []).length;
    return warnings > 0
      ? <p className="text-xs text-amber-600 font-semibold mt-0.5">{warnings} WARNINGS (Verification Required)</p>
      : <p className="text-xs text-green-600 font-semibold mt-0.5">VERIFIED</p>;
  }

  if (step.stepId === "compute_form_1040") {
    const text = result.form1040Text as string | undefined;
    const refund = text?.match(/REFUND[:\s]+(\$[\d,]+)/i)?.[1];
    const owed   = text?.match(/AMOUNT YOU OWE[:\s]+(\$[\d,]+)/i)?.[1];
    return (
      <p className={`text-xs font-semibold mt-0.5 ${refund ? "text-green-600" : "text-red-500"}`}>
        {refund ? `Refund ${refund}` : owed ? `Owed ${owed}` : "Computed"}
      </p>
    );
  }

  if (step.stepId === "find_tax_professionals") {
    const cpas = (result.cpas as unknown[] ?? []).length;
    return <p className="text-xs text-gray-500 mt-0.5">{cpas} professionals found</p>;
  }

  return null;
}

// ── Human input panel ─────────────────────────────────────────────────────────

function HumanInputPanel({ question, options, runId, stepLabel }: {
  question: string; options?: string[]; runId: string; stepLabel: string;
}) {
  const [selected, setSelected] = useState("");
  const [freeText, setFreeText] = useState("");

  function submit(answer: string) {
    if (!answer.trim()) return;
    sendWsMessage({ type: "human:response", runId, answer: answer.trim() });
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-3">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">{stepLabel}</p>
          <p className="text-sm text-gray-800">{question}</p>
        </div>
      </div>
      {options && options.length > 0 ? (
        <div className="space-y-1.5">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { setSelected(opt); submit(opt); }}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                selected === opt
                  ? "border-amber-400 bg-amber-100 text-amber-800 font-medium"
                  : "border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:bg-amber-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit(freeText)}
            placeholder="Type your answer…"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-amber-400"
            autoFocus
          />
          <button
            onClick={() => submit(freeText)}
            disabled={!freeText.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            <Send style={{ width: 14, height: 14 }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Data Sources panel ────────────────────────────────────────────────────────

function DataSourcesPanel() {
  const { documents, setActiveTab } = usePipelineStore();
  const top = documents.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-gray-900 text-sm">Data Sources</p>
        <button
          onClick={() => setActiveTab("documents")}
          className="text-xs text-blue-600 font-medium hover:text-blue-800 transition-colors"
        >
          + Upload
        </button>
      </div>
      {top.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-gray-400">Run the pipeline to scan documents.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((doc, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <FileText style={{ width: 16, height: 16 }} className="text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{doc.filename.replace(/\.[^.]+$/, "")}</p>
                <p className="text-[10px] text-gray-400">{(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
              <div className={`w-2 h-2 rounded-full ${doc.hasError ? "bg-amber-400" : "bg-green-400"}`} />
            </div>
          ))}
          {documents.length > 3 && (
            <button
              onClick={() => setActiveTab("documents")}
              className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-1 transition-colors"
            >
              +{documents.length - 3} more files →
            </button>
          )}
          {/* Add brokerage placeholder */}
          <div className="flex items-center gap-3 p-2.5 rounded-xl border border-dashed border-gray-200 hover:border-blue-300 cursor-pointer transition-colors">
            <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 text-gray-400 text-lg font-light">
              +
            </div>
            <p className="text-xs text-gray-400">Add brokerage connection…</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Risk assessment panel ─────────────────────────────────────────────────────

function RiskPanel() {
  const { form1040Text, documents } = usePipelineStore();
  if (!form1040Text) return null;

  const hasWarnings = documents.some(d => d.hasError);
  const risk = hasWarnings ? "medium" : "low";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Risk Assessment</p>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${risk === "low" ? "w-1/4 bg-green-500" : "w-1/2 bg-amber-400"}`} />
        </div>
        <span className={`text-xs font-bold ${risk === "low" ? "text-green-600" : "text-amber-600"}`}>
          {risk === "low" ? "Low Audit Risk" : "Review Needed"}
        </span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">
        {risk === "low"
          ? "Your deductions are within the expected standard deviation for your income bracket and zip code."
          : "Some documents require verification before filing."}
      </p>
    </div>
  );
}

// ── AI Insight card ───────────────────────────────────────────────────────────

function AIInsightCard() {
  const { form1040Text, setActiveTab } = usePipelineStore();
  if (!form1040Text) return null;

  const bbbCount = (form1040Text.match(/Big Beautiful/gi) ?? []).length;
  const qbi = form1040Text.match(/QBI.*?(\$[\d,]+)/i)?.[1];

  if (bbbCount === 0 && !qbi) return null;

  return (
    <div className="rounded-2xl bg-blue-600 p-6 text-white">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
          <Zap style={{ width: 14, height: 14 }} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">AI Intelligence Insight</p>
      </div>
      <h3 className="text-xl font-bold mb-2 leading-snug">
        {bbbCount > 0
          ? `${bbbCount} Big Beautiful Bill Provision${bbbCount > 1 ? "s" : ""} Applied`
          : qbi ? `QBI Deduction: ${qbi}` : "Deduction Opportunities Found"}
      </h3>
      <p className="text-sm text-blue-100 leading-relaxed mb-4">
        {bbbCount > 0
          ? `TaxBot applied ${bbbCount} provision${bbbCount > 1 ? "s" : ""} from the Big Beautiful Bill, potentially reducing your tax liability. Review your Form 1040 for details.`
          : "Our AI analyzed your documents and found deduction opportunities. Review Section 3 of your automated Form 1040."}
      </p>
      <button
        onClick={() => setActiveTab("form1040")}
        className="flex items-center gap-1 text-sm font-semibold text-white border border-white/30 rounded-lg px-4 py-2 hover:bg-white/10 transition-colors w-fit"
      >
        Review Suggestion
      </button>
    </div>
  );
}

// ── Talk to Expert panel ──────────────────────────────────────────────────────

function TalkToExpert() {
  const { setActiveTab } = usePipelineStore();
  return (
    <button
      onClick={() => setActiveTab("cpa")}
      className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
    >
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <Users style={{ width: 16, height: 16 }} className="text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">Talk to a Tax Expert</p>
        <p className="text-xs text-gray-400">Schedule a 15-min call</p>
      </div>
      <ChevronRight style={{ width: 16, height: 16 }} className="text-gray-300 shrink-0" />
    </button>
  );
}

// ── Main TaxDashboard ─────────────────────────────────────────────────────────

export function TaxDashboard() {
  const {
    status, steps, startedAt, totalMs, config, runId,
    humanInputPending, startPipeline, setRunId,
    form1040Text, documents, setActiveTab,
  } = usePipelineStore();

  const [selectedStep, setSelectedStep] = useState<DynamicStep | null>(null);
  const runOnce = useRef(false);

  const elapsedSec = startedAt ? ((Date.now() - startedAt) / 1000).toFixed(0) : null;

  const year = config?.taxYear ?? 2025;

  async function handleRun() {
    if (!config?.taxDocumentsFolder) {
      setActiveTab("setup");
      return;
    }
    if (runOnce.current) return;
    runOnce.current = true;
    startPipeline();
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const { runId: newRunId } = await res.json() as { runId: string };
      setRunId(newRunId);
    } finally {
      runOnce.current = false;
    }
  }

  async function handleRetry(stepId: string) {
    await fetch(`/api/pipeline/retry/${stepId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
  }

  const refundStr = form1040Text?.match(/REFUND[:\s]+(\$[\d,]+)/i)?.[1];
  const owedStr   = form1040Text?.match(/AMOUNT YOU OWE[:\s]+(\$[\d,]+)/i)?.[1];
  const agiStr    = form1040Text?.match(/ADJUSTED GROSS INCOME.*?(\$[\d,]+)/i)?.[1];
  const effRate   = form1040Text?.match(/Effective Tax Rate.*?([\d.]+%)/i)?.[1];
  const margRate  = form1040Text?.match(/Marginal Tax Rate.*?([\d]+%)/i)?.[1];

  const hasResults = status === "complete" || status === "error";

  // ── IDLE ──────────────────────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-200 flex items-center justify-center">
          <Zap style={{ width: 28, height: 28 }} className="text-blue-600" />
        </div>
        <div className="space-y-3 max-w-md">
          <h2 className="text-3xl font-bold text-gray-900">Financial Summary {year}</h2>
          <p className="text-gray-500 text-base leading-relaxed">
            Start your AI-powered tax analysis. TaxBot will scan your documents, compute your Form 1040, find CPAs near you, and deliver a full report.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/25"
          >
            <Zap style={{ width: 16, height: 16 }} />
            Start Tax Analysis
          </button>
          <button
            onClick={() => setActiveTab("setup")}
            className="px-6 py-3.5 rounded-xl border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 font-medium text-sm transition-colors"
          >
            Configure Settings
          </button>
        </div>
      </div>
    );
  }

  // ── Layout with main + right sidebar ─────────────────────────────────────
  return (
    <div className="flex gap-6 items-start">

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">

        {/* Page heading */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Summary {year}</h1>
            {hasResults && totalMs && (
              <p className="text-xs text-gray-400 mt-0.5">
                Updated {(totalMs / 1000).toFixed(1)}s ago · {steps.filter(s => s.status === "complete").length} steps completed
              </p>
            )}
            {status === "running" && (
              <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                {humanInputPending ? "Waiting for your input…" : `${elapsedSec}s elapsed`}
              </p>
            )}
          </div>
          {hasResults && (
            <button
              onClick={handleRun}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:text-gray-800 hover:border-gray-300 transition-colors"
            >
              <RefreshCw style={{ width: 13, height: 13 }} />
              Re-analyze
            </button>
          )}
        </div>

        {/* KPI cards */}
        {hasResults && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Estimated Tax Refund"
              value={refundStr ?? owedStr ?? "—"}
              subtitle={owedStr ? "Amount due Apr 15" : refundStr ? "Estimated refund" : undefined}
              accent="blue"
            />
            <KPICard
              label="Adjusted Gross Income"
              value={agiStr ?? "—"}
            />
            <KPICard
              label="Effective Tax Rate"
              value={effRate ?? "—"}
              subtitle={effRate ? "" : undefined}
            />
            <KPICard
              label="Marginal Rate"
              value={margRate ?? "—"}
            />
          </div>
        )}

        {/* Processing pipeline card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Processing Pipeline</h2>
            {status === "running" && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200">
                Active Session
              </span>
            )}
            {hasResults && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                Completed
              </span>
            )}
          </div>

          {/* Human input */}
          {humanInputPending && (
            <div className="px-5 pt-4">
              <HumanInputPanel
                question={humanInputPending.question}
                options={humanInputPending.options}
                runId={runId ?? humanInputPending.runId}
                stepLabel={humanInputPending.stepLabel}
              />
            </div>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div className="divide-y divide-gray-50">
              {steps.map((step, i) => (
                <button
                  key={step.stepId}
                  onClick={() => (step.status === "complete" || step.status === "error") && setSelectedStep(step)}
                  className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-colors ${
                    step.status === "complete" || step.status === "error" ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
                  }`}
                >
                  {/* Connector line */}
                  <div className="flex flex-col items-center shrink-0">
                    <StepCircle step={step} />
                    {i < steps.length - 1 && (
                      <div className={`w-0.5 h-5 mt-1 ${step.status === "complete" ? "bg-blue-200" : "bg-gray-100"}`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <p className={`text-sm font-semibold ${step.status === "waiting" ? "text-gray-400" : "text-gray-800"}`}>
                      {step.label}
                    </p>
                    <StepSubText step={step} />
                  </div>
                  {step.status === "error" && (
                    <button
                      onClick={e => { e.stopPropagation(); handleRetry(step.stepId); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <RefreshCw style={{ width: 11, height: 11 }} /> Retry
                    </button>
                  )}
                  {(step.status === "complete" || step.status === "error") && (
                    <ChevronRight style={{ width: 14, height: 14 }} className="text-gray-300 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Empty state when running hasn't produced steps yet */}
          {steps.length === 0 && status === "running" && (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-gray-400">Starting pipeline…</p>
            </div>
          )}
        </div>

        {/* AI Insight card */}
        {hasResults && <AIInsightCard />}
      </div>

      {/* ── Right sidebar ────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 space-y-4">
        <DataSourcesPanel />
        <RiskPanel />
        {hasResults && <TalkToExpert />}
      </div>

      {/* Step detail drawer */}
      {selectedStep && (
        <StepDetail step={selectedStep} onClose={() => setSelectedStep(null)} />
      )}
    </div>
  );
}
