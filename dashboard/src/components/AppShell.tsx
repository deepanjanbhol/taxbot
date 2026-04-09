import { useState } from "react";
import {
  LayoutDashboard, FileText, FolderOpen, Users, Settings,
  Zap, Bell, HelpCircle, Search, History, Bot,
} from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { RunHistory } from "../types/pipeline";

type AppTab = "pipeline" | "form1040" | "documents" | "cpa" | "setup" | "history" | "sms" | "editor" | "bot";

const NAV_ITEMS: { id: AppTab; label: string; Icon: React.ElementType }[] = [
  { id: "pipeline",  label: "Dashboard",  Icon: LayoutDashboard },
  { id: "form1040",  label: "Form 1040",  Icon: FileText },
  { id: "documents", label: "Documents",  Icon: FolderOpen },
  { id: "cpa",       label: "Tax Pros",   Icon: Users },
  { id: "bot",       label: "Assistant",  Icon: Bot },
  { id: "history",   label: "History",    Icon: History },
  { id: "setup",     label: "Settings",   Icon: Settings },
];

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar() {
  const { activeTab, setActiveTab, status, config } = usePipelineStore();
  const [runOnce, setRunOnce] = useState(false);

  async function handleFileNow() {
    if (runOnce || status === "running") return;
    if (!config?.taxDocumentsFolder) {
      setActiveTab("setup");
      return;
    }
    setRunOnce(true);
    setActiveTab("pipeline");
    // Trigger run via store
    const { startPipeline, setRunId } = usePipelineStore.getState();
    startPipeline();
    try {
      const res = await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const { runId } = await res.json() as { runId: string };
      setRunId(runId);
    } finally {
      setRunOnce(false);
    }
  }

  return (
    <aside className="w-[220px] min-h-screen bg-white border-r border-gray-100 flex flex-col shrink-0" data-no-print>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <img src="/taxbot-logo.png" alt="TaxBot" className="w-9 h-9 object-contain" />
          <div className="leading-none">
            <p className="font-bold text-gray-900 text-sm tracking-tight">TaxBot</p>
            <p className="text-gray-400 text-[10px] uppercase tracking-widest font-medium mt-0.5">Intelligence</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-blue-50 text-blue-700 border-l-[3px] border-blue-600 rounded-l-none pl-[9px]"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              <Icon style={{ width: 16, height: 16 }} className={active ? "text-blue-600" : "text-gray-400"} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* File Now CTA */}
      <div className="px-4 pb-6">
        <button
          onClick={handleFileNow}
          disabled={status === "running"}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/25"
        >
          <Zap style={{ width: 14, height: 14 }} />
          {status === "running" ? "Processing…" : "File Now"}
        </button>
      </div>
    </aside>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({ title, subtitle, onHistorySearch }: {
  title?: string;
  subtitle?: string;
  onHistorySearch?: (q: string) => void;
}) {
  const { config, activeTab } = usePipelineStore();
  const year = config?.taxYear ?? 2025;
  const showSearch = activeTab === "history" && onHistorySearch;

  return (
    <header className="h-14 border-b border-gray-100 bg-white flex items-center gap-4 px-6 shrink-0">
      {/* Search — only on History page */}
      {showSearch ? (
        <div className="flex items-center gap-2 flex-1 max-w-xs bg-gray-50 rounded-lg border border-gray-100 px-3 py-2 focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-300 transition-all">
          <Search style={{ width: 14, height: 14 }} className="text-gray-400 shrink-0" />
          <input
            placeholder="Search run history…"
            onChange={e => onHistorySearch(e.target.value)}
            className="bg-transparent text-sm text-gray-600 placeholder-gray-400 outline-none w-full"
          />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Tax year tab */}
      <div className="border-b-2 border-blue-600 pb-0.5 px-1">
        <span className="text-sm font-semibold text-blue-600">Tax Year {year}</span>
      </div>

      {subtitle && (
        <span className="text-xs text-gray-400 hidden md:block">{subtitle}</span>
      )}

      {/* Right actions */}
      <div className="flex items-center gap-3 ml-auto">
        <button className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          <Bell style={{ width: 16, height: 16 }} />
        </button>
        <button className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          <HelpCircle style={{ width: 16, height: 16 }} />
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          T
        </div>
      </div>
    </header>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  onHistorySearch?: (q: string) => void;
}

export function AppShell({ children, pageTitle, pageSubtitle, onHistorySearch }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-gray-50 font-['Inter',system-ui,sans-serif]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={pageTitle} subtitle={pageSubtitle} onHistorySearch={onHistorySearch} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
        {/* Footer */}
        <footer className="border-t border-gray-100 bg-white px-6 py-3 flex items-center justify-between text-xs text-gray-400">
          <span>© 2025 TaxBot Intelligence. AI estimates only — not a substitute for professional tax advice.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-600 transition-colors">Privacy Standard</a>
            <a href="#" className="hover:text-gray-600 transition-colors">AI Audit Log</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Support Portal</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
