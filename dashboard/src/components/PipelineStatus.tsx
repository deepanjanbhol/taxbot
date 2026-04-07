import { useState, useRef } from "react";
import {
  CheckCircle, XCircle, Loader2, Clock, RefreshCw,
  ChevronDown, Zap, MessageCircleQuestion, Send,
} from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import { sendWsMessage } from "../hooks/useWebSocket";
import { StepDetail } from "./StepDetail";
import type { DynamicStep, StepStatus } from "../types/pipeline";

const STEP_COLORS: Record<StepStatus, string> = {
  complete: "border-green-500/40 bg-green-500/5",
  error:    "border-red-500/40 bg-red-500/5",
  running:  "border-blue-500/40 bg-blue-500/5",
  skipped:  "border-slate-700 bg-slate-800/20",
  waiting:  "border-slate-700 bg-slate-800/40",
};

// ── Step summary line (inline result under each row) ─────────────────────────

function StepSummaryLine({ step }: { step: DynamicStep }) {
  const result = step.result as Record<string, unknown> | undefined;
  if (!result || step.status !== "complete") return null;

  // Human input: show Q&A
  if (step.isHumanInput) {
    const q = result.question as string | undefined;
    const a = result.answer as string | undefined;
    return (
      <div className="mt-1.5 space-y-0.5">
        {q && <p className="text-xs text-slate-400 italic">{q}</p>}
        {a && <p className="text-xs text-slate-200 font-medium">→ {a}</p>}
      </div>
    );
  }

  if (step.stepId === "scan_tax_documents") {
    const docs = (result.documents ?? []) as unknown[];
    const errors = (result.errors ?? []) as unknown[];
    const byType = (result.documents as Array<{ type: string }> ?? []).reduce<Record<string, number>>((a, d) => {
      a[d.type] = (a[d.type] ?? 0) + 1; return a;
    }, {});
    const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => `${n}× ${t}`).join("  ·  ");
    return (
      <div className="mt-1.5 space-y-0.5">
        <p className="text-xs text-slate-300">{docs.length} documents extracted</p>
        {topTypes && <p className="text-xs text-slate-500 font-mono">{topTypes}</p>}
        {errors.length > 0 && <p className="text-xs text-amber-400">⚠ {errors.length} parse error{errors.length > 1 ? "s" : ""}</p>}
      </div>
    );
  }

  if (step.stepId === "extract_income_fields") {
    const log = (result.extractionLog ?? []) as unknown[];
    const warnings = (result.warnings ?? []) as string[];
    return (
      <div className="mt-1.5 space-y-0.5">
        <p className="text-xs text-slate-300">{log.length} fields extracted</p>
        {warnings.length > 0 && <p className="text-xs text-amber-400">⚠ {warnings.length} warning{warnings.length > 1 ? "s" : ""}</p>}
      </div>
    );
  }

  if (step.stepId === "compute_form_1040") {
    const text = result.form1040Text as string | undefined;
    const refund = text?.match(/REFUND[:\s]+(\$[\d,]+)/i)?.[1];
    const owed   = text?.match(/AMOUNT YOU OWE[:\s]+(\$[\d,]+)/i)?.[1];
    const agi    = text?.match(/ADJUSTED GROSS INCOME.*?(\$[\d,]+)/i)?.[1];
    const eff    = text?.match(/Effective Tax Rate.*?([\d.]+%)/i)?.[1];
    const bbbCount = (text?.match(/Big Beautiful/gi) ?? []).length;
    return (
      <div className="mt-1.5 space-y-0.5">
        {(refund || owed) && (
          <p className={`text-sm font-bold font-mono ${refund ? "text-green-400" : "text-red-400"}`}>
            {refund ? `Refund: ${refund}` : `Owed: ${owed}`}
          </p>
        )}
        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          {agi && <span>AGI: <strong className="text-slate-200">{agi}</strong></span>}
          {eff && <span>Effective rate: <strong className="text-slate-200">{eff}</strong></span>}
        </div>
        {bbbCount > 0 && (
          <p className="text-xs text-amber-400 flex items-center gap-1">
            <Zap className="w-3 h-3" /> {bbbCount} Big Beautiful Bill provision{bbbCount > 1 ? "s" : ""} applied
          </p>
        )}
      </div>
    );
  }

  if (step.stepId === "find_tax_professionals") {
    const cpas = (result.cpas ?? []) as unknown[];
    return <p className="text-xs text-slate-400 mt-1">{cpas.length} tax professionals found</p>;
  }

  if (step.stepId === "send_tax_report" || step.stepId === "save_report_snapshot") {
    if (result.twilioMissing) {
      return <p className="text-xs text-amber-400 mt-1">⚠ Twilio not configured — snapshot saved. Click to view.</p>;
    }
    const sent = result.success as boolean;
    const ids  = (result.messageIds ?? []) as unknown[];
    return (
      <p className={`text-xs mt-1 ${sent ? "text-green-400" : "text-red-400"}`}>
        {sent ? `✓ Delivered (${ids.length} message${ids.length !== 1 ? "s" : ""})` : `✗ Failed: ${result.error ?? "unknown error"}`}
      </p>
    );
  }

  return null;
}

// ── Step icon ────────────────────────────────────────────────────────────────

function StepIcon({ step }: { step: DynamicStep }) {
  if (step.status === "complete") return <CheckCircle className="w-5 h-5 text-green-400" />;
  if (step.status === "error")    return <XCircle    className="w-5 h-5 text-red-400" />;
  if (step.status === "running" && step.isHumanInput)
    return <MessageCircleQuestion className="w-5 h-5 text-amber-400 animate-pulse" />;
  if (step.status === "running")  return <Loader2    className="w-5 h-5 text-blue-400 animate-spin" />;
  if (step.status === "skipped")  return <ChevronDown className="w-5 h-5 text-slate-500" />;
  return <Clock className="w-5 h-5 text-slate-500" />;
}

// ── Human input panel ────────────────────────────────────────────────────────

function HumanInputPanel({ question, options, runId, stepLabel }: {
  question: string;
  options?: string[];
  runId: string;
  stepLabel: string;
}) {
  const [selected, setSelected] = useState<string>("");
  const [freeText, setFreeText] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(answer: string) {
    if (!answer.trim()) return;
    sendWsMessage({ type: "human:response", runId, answer: answer.trim() });
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-4 space-y-3">
      <div className="flex items-start gap-2">
        <MessageCircleQuestion className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-1">{stepLabel}</p>
          <p className="text-sm text-slate-100">{question}</p>
        </div>
      </div>

      {options && options.length > 0 ? (
        <div className="space-y-1.5">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { setSelected(opt); submit(opt); }}
              className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${
                selected === opt
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-slate-600 bg-slate-800 text-slate-200 hover:border-amber-500/50 hover:bg-amber-500/10"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={freeText}
            onChange={e => setFreeText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit(freeText)}
            placeholder="Type your answer…"
            className="flex-1 px-3 py-2 rounded border border-slate-600 bg-slate-800 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:border-amber-400"
            autoFocus
          />
          <button
            onClick={() => submit(freeText)}
            disabled={!freeText.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            <Send className="w-3.5 h-3.5" /> Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Step row ─────────────────────────────────────────────────────────────────

function StepRow({
  step, isClickable, onClick, onRetry,
}: {
  step: DynamicStep;
  isClickable: boolean;
  onClick: () => void;
  onRetry: (stepId: string) => void;
}) {
  return (
    <div
      onClick={isClickable ? onClick : undefined}
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${STEP_COLORS[step.status]} ${isClickable ? "cursor-pointer hover:brightness-125" : ""}`}
    >
      <div className="mt-0.5 shrink-0"><StepIcon step={step} /></div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-medium text-sm ${step.status === "waiting" ? "text-slate-400" : "text-slate-100"}`}>
            {step.label}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {step.durationMs !== undefined && step.durationMs > 0 && (
              <span className="text-xs text-slate-500 tabular-nums">{(step.durationMs / 1000).toFixed(1)}s</span>
            )}
            {step.status === "running" && !step.isHumanInput && (
              <span className="text-xs text-slate-500 tabular-nums">running…</span>
            )}
            {step.status === "running" && step.isHumanInput && (
              <span className="text-xs text-amber-400 tabular-nums">waiting for input…</span>
            )}
          </div>
        </div>

        {/* Live sub-status */}
        {step.message && step.status === "running" && !step.isHumanInput && (
          <p className="text-xs mt-0.5 text-blue-400 animate-pulse">{step.message}</p>
        )}

        {/* Inline result summary */}
        <StepSummaryLine step={step} />

        {/* Error */}
        {step.error && step.status === "error" && (
          <p className="text-xs mt-1 text-red-300 line-clamp-2">{step.error}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {step.status === "error" && (
          <button
            onClick={e => { e.stopPropagation(); onRetry(step.stepId); }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        )}
        {isClickable && (
          <ChevronDown className="w-4 h-4 text-slate-600" />
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PipelineStatus() {
  const { status, steps, startedAt, totalMs, config, runId, humanInputPending, startPipeline, setRunId } = usePipelineStore();
  const [selectedStep, setSelectedStep] = useState<DynamicStep | null>(null);

  const elapsedSec = startedAt ? ((Date.now() - startedAt) / 1000).toFixed(0) : null;
  const completedCount = steps.filter(s => s.status === "complete" || s.status === "skipped").length;
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : (status === "running" ? 15 : 0);

  async function handleRun() {
    if (!config?.taxDocumentsFolder) {
      alert("Please complete Setup first — set your tax documents folder.");
      return;
    }
    startPipeline();
    const res = await fetch("/api/pipeline/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    const { runId: newRunId } = await res.json() as { runId: string };
    setRunId(newRunId);
  }

  async function handleRetry(stepId: string) {
    await fetch(`/api/pipeline/retry/${stepId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
  }

  const isClickable = (step: DynamicStep) =>
    step.status === "complete" || step.status === "error" || step.status === "skipped";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Pipeline</h2>
          {status === "running" && humanInputPending && (
            <p className="text-xs text-amber-400 mt-0.5">Waiting for your input…</p>
          )}
          {status === "running" && !humanInputPending && elapsedSec && (
            <p className="text-xs text-slate-400 mt-0.5">Running — {elapsedSec}s elapsed</p>
          )}
          {status === "complete" && totalMs && (
            <p className="text-xs text-green-400 mt-0.5">Completed in {(totalMs / 1000).toFixed(1)}s</p>
          )}
        </div>

        {status === "idle" || status === "complete" || status === "error" ? (
          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-400 text-white font-semibold text-sm transition-colors shadow-lg shadow-green-500/20"
          >
            {status === "idle" ? "▶ Prepare My Taxes" : "↺ Run Again"}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-sm text-blue-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Processing…
          </div>
        )}
      </div>

      {/* Progress bar */}
      {status !== "idle" && (
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === "error"    ? "bg-red-500" :
              status === "complete" ? "bg-green-500" :
              humanInputPending     ? "bg-amber-500 animate-pulse" : "bg-blue-500"
            }`}
            style={{ width: status === "running" && steps.length === 0 ? "8%" : `${progressPct}%` }}
          />
        </div>
      )}

      {/* Human input panel — shown above steps when waiting */}
      {humanInputPending && (
        <HumanInputPanel
          question={humanInputPending.question}
          options={humanInputPending.options}
          runId={runId ?? humanInputPending.runId}
          stepLabel={humanInputPending.stepLabel}
        />
      )}

      {/* Dynamic steps */}
      <div className="space-y-2">
        {steps.map(step => (
          <StepRow
            key={step.stepId}
            step={step}
            isClickable={isClickable(step)}
            onClick={() => setSelectedStep(step)}
            onRetry={handleRetry}
          />
        ))}
      </div>

      {/* Click hint */}
      {status === "complete" && steps.length > 0 && (
        <p className="text-xs text-slate-500 text-center">
          Click any step to see the full detail and calculations
        </p>
      )}

      {/* Idle prompt */}
      {status === "idle" && (
        <div className="text-center py-6 text-slate-500 text-sm">
          Click <span className="text-green-400 font-medium">▶ Prepare My Taxes</span> to start
        </div>
      )}

      {/* Step detail drawer */}
      {selectedStep && (
        <StepDetail step={selectedStep} onClose={() => setSelectedStep(null)} />
      )}
    </div>
  );
}
