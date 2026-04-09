import { useEffect, useState } from "react";
import { useWebSocket } from "./hooks/useWebSocket";
import { usePipelineStore } from "./store/pipeline";
import { AppShell } from "./components/AppShell";
import { LandingPage } from "./components/LandingPage";
import { TaxDashboard } from "./components/TaxDashboard";
import { Form1040PDF } from "./components/Form1040PDF";
import { DocumentsView } from "./components/DocumentsView";
import { CPAGrid } from "./components/CPAGrid";
import { SetupWizard } from "./components/SetupWizard";
import { SMSPreview } from "./components/SMSPreview";
import { BotChat } from "./components/BotChat";

function HistoryView({ query }: { query: string }) {
  const { history, setActiveTab } = usePipelineStore();
  const filtered = query.trim()
    ? history.filter(r =>
        new Date(r.startedAt).toLocaleString().toLowerCase().includes(query.toLowerCase()) ||
        r.status.includes(query.toLowerCase()) ||
        (r.refundOrOwed !== undefined && String(r.refundOrOwed).includes(query))
      )
    : history;
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Run History</h2>
          <p className="text-sm text-gray-400 mt-0.5">{history.length} past run{history.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setActiveTab("pipeline")} className="text-xs text-blue-600 hover:text-blue-800 transition-colors">
          ← Back to Dashboard
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-700">
        <span className="font-semibold">Ready to file?</span>
        <span>Download a run as CSV or JSON, then use</span>
        <a href="https://www.irs.gov/filing/free-file-do-your-federal-taxes-for-free" target="_blank" rel="noreferrer" className="underline font-medium">IRS Free File</a>
        <span>·</span>
        <a href="https://www.freetaxusa.com" target="_blank" rel="noreferrer" className="underline font-medium">FreeTaxUSA</a>
        <span>·</span>
        <a href="https://cash.app/taxes" target="_blank" rel="noreferrer" className="underline font-medium">Cash App Taxes</a>
        <span className="text-blue-500">(all $0 federal)</span>
      </div>
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center bg-white rounded-2xl border border-gray-100 shadow-sm p-10">
          <p className="text-gray-400 text-sm">No past runs yet.</p>
          <button onClick={() => setActiveTab("pipeline")} className="text-blue-600 hover:text-blue-800 text-sm underline transition-colors">
            Start your first tax analysis →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No runs match "{query}"</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(run => (
            <div key={run.runId} className="px-5 py-4 rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-700 font-medium">{new Date(run.startedAt).toLocaleString()}</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${
                    run.status === "complete" ? "bg-green-50 text-green-600 border-green-200" :
                    run.status === "error"    ? "bg-red-50 text-red-600 border-red-200" :
                    "bg-gray-50 text-gray-500 border-gray-200"
                  }`}>{run.status}</span>
                  {run.status === "complete" && (
                    <div className="flex items-center gap-1">
                      <a
                        href={`/api/history/${run.runId}/export?format=csv`}
                        download
                        className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors"
                        title="Download CSV"
                      >
                        CSV
                      </a>
                      <a
                        href={`/api/history/${run.runId}/export?format=json`}
                        download
                        className="text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 transition-colors"
                        title="Download JSON"
                      >
                        JSON
                      </a>
                    </div>
                  )}
                </div>
              </div>
              {run.refundOrOwed !== undefined && (
                <p className={`text-xl font-bold mt-2 ${run.refundOrOwed >= 0 ? "text-blue-600" : "text-red-500"}`}>
                  {run.refundOrOwed >= 0 ? `Refund: $${run.refundOrOwed.toLocaleString()}` : `Owed: $${Math.abs(run.refundOrOwed).toLocaleString()}`}
                </p>
              )}
              {run.steps.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">{run.steps.filter(s => s.status === "complete").length} of {run.steps.length} steps completed</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function App() {
  const { activeTab, setConfig, loadHistory } = usePipelineStore();
  const [historyQuery, setHistoryQuery] = useState("");

  // Connect WebSocket for live pipeline events
  useWebSocket();

  // Load config and history on mount
  useEffect(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {/* no config yet — setup wizard will handle */});

    fetch("/api/history")
      .then(r => r.json())
      .then(loadHistory)
      .catch(() => {});
  }, [setConfig, loadHistory]);

  // Landing page renders full-page with its own nav
  if (activeTab === "landing") {
    return <LandingPage />;
  }

  const PAGE_META: Record<Exclude<typeof activeTab, "landing">, { title: string; subtitle?: string }> = {
    pipeline:  { title: "Financial Summary",   subtitle: `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ago` },
    form1040:  { title: "Form 1040",           subtitle: "AI-generated estimate" },
    documents: { title: "Document Intelligence", subtitle: "Automated parsing of your fiscal ecosystem" },
    cpa:       { title: "Find Tax Pros",        subtitle: "CPAs, EAs, online services & freelancers" },
    sms:       { title: "Report Delivery",     subtitle: "SMS & Telegram" },
    editor:    { title: "Number Editor" },
    history:   { title: "Run History" },
    bot:       { title: "TaxBot Assistant",    subtitle: "Chat with your tax data — also available via Telegram & SMS" },
    setup:     { title: "Settings",            subtitle: "Configure your data sources and delivery" },
  };

  const meta = PAGE_META[activeTab as Exclude<typeof activeTab, "landing">];

  const content: Record<Exclude<typeof activeTab, "landing">, React.ReactNode> = {
    pipeline:  <TaxDashboard />,
    form1040:  <Form1040PDF />,
    documents: <DocumentsView />,
    cpa:       <CPAGrid />,
    sms:       <SMSPreview />,
    editor:    <div className="p-6 text-slate-500 text-sm">Number editor coming soon.</div>,
    history:   <HistoryView query={historyQuery} />,
    bot:       <BotChat />,
    setup:     <SetupWizard />,
  };

  return (
    <AppShell
      pageTitle={meta?.title}
      pageSubtitle={meta?.subtitle}
      onHistorySearch={activeTab === "history" ? setHistoryQuery : undefined}
    >
      {content[activeTab as Exclude<typeof activeTab, "landing">]}
    </AppShell>
  );
}
