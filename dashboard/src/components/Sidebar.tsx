import { Receipt, Settings, History, FileText, Users, MessageSquare, LayoutDashboard, PenLine, FolderSearch } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { RunHistory } from "../types/pipeline";

function fmtDollar(n: number) {
  return n >= 0 ? `+$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;
}

function HistoryItem({ run }: { run: RunHistory }) {
  const date = new Date(run.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 cursor-pointer group transition-colors">
      <div className="min-w-0">
        <p className="text-xs text-slate-300 truncate">{date}</p>
        <p className={`text-xs font-mono font-medium ${
          run.status === "complete"
            ? run.refundOrOwed !== undefined
              ? run.refundOrOwed >= 0 ? "text-green-400" : "text-red-400"
              : "text-slate-400"
            : "text-slate-500"
        }`}>
          {run.status === "complete" && run.refundOrOwed !== undefined
            ? fmtDollar(run.refundOrOwed)
            : run.status}
        </p>
      </div>
      <span className={`w-2 h-2 rounded-full shrink-0 ${
        run.status === "complete" ? "bg-green-500" :
        run.status === "error"    ? "bg-red-500" :
        run.status === "running"  ? "bg-blue-500 animate-pulse" :
        "bg-slate-600"
      }`} />
    </div>
  );
}

export function Sidebar() {
  const { activeTab, setActiveTab, history, status } = usePipelineStore();

  const navItems = [
    { id: "pipeline"  as const, label: "Pipeline",     icon: LayoutDashboard },
    { id: "documents" as const, label: "Documents",    icon: FolderSearch },
    { id: "editor"    as const, label: "Edit Numbers", icon: PenLine },
    { id: "form1040"  as const, label: "Form 1040",    icon: FileText },
    { id: "cpa"       as const, label: "Find CPA",     icon: Users },
    { id: "sms"       as const, label: "Send SMS",     icon: MessageSquare },
  ];

  return (
    <aside className="flex flex-col w-56 shrink-0 bg-slate-900 border-r border-slate-800 h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
        <Receipt className="w-6 h-6 text-green-400" />
        <div>
          <p className="text-sm font-bold text-slate-100">TaxBot</p>
          <p className="text-xs text-slate-500">Tax Year 2025</p>
        </div>
        {status === "running" && (
          <div className="ml-auto w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
              activeTab === id
                ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* History */}
      {history.length > 0 && (
        <div className="px-2 pb-2 border-t border-slate-800 pt-3">
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-2 transition-colors ${
              activeTab === "history"
                ? "bg-blue-600/20 text-blue-300"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <History className="w-4 h-4" /> History
          </button>
          <div className="space-y-0.5">
            {history.slice(0, 5).map(r => <HistoryItem key={r.runId} run={r} />)}
          </div>
        </div>
      )}

      {/* Setup */}
      <div className="px-2 pb-3 border-t border-slate-800 pt-3">
        <button
          onClick={() => setActiveTab("setup")}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            activeTab === "setup"
              ? "bg-blue-600/20 text-blue-300"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          <Settings className="w-4 h-4" /> Setup
        </button>
      </div>
    </aside>
  );
}
