import { Receipt, LayoutDashboard, FileText, FolderSearch, Users, Settings, Loader2 } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";

type NavTab = "pipeline" | "form1040" | "documents" | "cpa" | "setup";

interface NavItem {
  id: NavTab;
  label: string;
  Icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "pipeline",  label: "Dashboard",  Icon: LayoutDashboard },
  { id: "form1040",  label: "Form 1040",  Icon: FileText },
  { id: "documents", label: "Documents",  Icon: FolderSearch },
  { id: "cpa",       label: "Find CPAs",  Icon: Users },
  { id: "setup",     label: "Settings",   Icon: Settings },
];

export function TopNav() {
  const { activeTab, setActiveTab, status, history, form1040Text } = usePipelineStore();

  // Compute last result for history badge
  const lastRun = history[0];
  const lastAmount = lastRun?.refundOrOwed;

  // Try to pull refund/owed from current run's form1040Text
  const currentRefund = form1040Text?.match(/REFUND[:\s]+(\$[\d,]+)/i)?.[1];
  const currentOwed   = form1040Text?.match(/AMOUNT YOU OWE[:\s]+(\$[\d,]+)/i)?.[1];
  const badgeText = currentRefund ?? currentOwed ?? (
    lastAmount !== undefined
      ? (lastAmount >= 0 ? `+$${lastAmount.toLocaleString()}` : `-$${Math.abs(lastAmount).toLocaleString()}`)
      : null
  );
  const badgeColor = currentRefund
    ? "text-green-400 bg-green-500/10 border-green-500/30"
    : currentOwed
    ? "text-red-400 bg-red-500/10 border-red-500/30"
    : lastAmount !== undefined && lastAmount >= 0
    ? "text-green-400 bg-green-500/10 border-green-500/30"
    : "text-red-400 bg-red-500/10 border-red-500/30";

  return (
    <nav
      className="top-nav top-nav-glass sticky top-0 z-50 border-b border-indigo-900/50"
      style={{ backgroundColor: "rgba(13,13,43,0.95)" }}
      data-no-print
    >
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0 select-none">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Receipt className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="leading-none">
            <span className="font-bold text-white text-sm tracking-tight">TaxBot</span>
            <span className="block text-[10px] text-indigo-400 leading-none mt-0.5">Tax Year 2025</span>
          </div>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-white/10" />

        {/* Center nav links */}
        <div className="flex items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                }`}
              >
                <Icon className="shrink-0" style={{ width: 15, height: 15 }} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Right: run status + badge */}
        <div className="flex items-center gap-3 shrink-0">
          {status === "running" && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-600/10 border border-indigo-600/20 px-2.5 py-1 rounded-full">
              <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
              <span>Processing…</span>
            </div>
          )}
          {status === "complete" && (
            <div className="flex items-center gap-1.5 text-xs bg-green-500/10 border border-green-500/20 text-green-400 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              <span>Complete</span>
            </div>
          )}
          {badgeText && (
            <div className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-full border ${badgeColor}`}>
              {badgeText}
            </div>
          )}
          {/* History shortcut */}
          <button
            onClick={() => setActiveTab("history" as Parameters<typeof setActiveTab>[0])}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            title="Run history"
          >
            History
          </button>
          <button
            onClick={() => setActiveTab("landing" as Parameters<typeof setActiveTab>[0])}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            title="Home"
          >
            Home
          </button>
        </div>
      </div>
    </nav>
  );
}
