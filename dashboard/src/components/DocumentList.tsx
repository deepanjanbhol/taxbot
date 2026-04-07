import { useState } from "react";
import { FileText, AlertTriangle, Camera, X, ChevronRight } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { DocType, ScannedDocument } from "../types/pipeline";

const TYPE_COLOR: Record<DocType | "OTHER", string> = {
  "W2":        "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "1099-NEC":  "bg-blue-400/20 text-blue-200 border-blue-400/30",
  "1099-INT":  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "1099-DIV":  "bg-cyan-400/20 text-cyan-200 border-cyan-400/30",
  "1099-B":    "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "1099-MISC": "bg-blue-300/20 text-blue-200 border-blue-300/30",
  "1099-R":    "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "1099-G":    "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "1099-K":    "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "SSA-1099":  "bg-purple-400/20 text-purple-200 border-purple-400/30",
  "1098":      "bg-green-500/20 text-green-300 border-green-500/30",
  "1098-T":    "bg-green-400/20 text-green-200 border-green-400/30",
  "1098-E":    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "K1":        "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "RECEIPT":   "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "OTHER":     "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function TypeBadge({ type }: { type: DocType }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLOR[type] ?? TYPE_COLOR["OTHER"]}`}>
      {type}
    </span>
  );
}

function DocDrawer({ doc, onClose }: { doc: ScannedDocument; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-900 border-l border-slate-700 shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="min-w-0">
          <p className="font-medium text-slate-100 truncate">{doc.filename}</p>
          <TypeBadge type={doc.type} />
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-700 text-slate-400">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {doc.isImageBased ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Camera className="w-10 h-10 text-amber-400" />
            <p className="text-amber-300 font-medium">Scanned PDF — no text detected</p>
            <p className="text-sm text-slate-400">
              This file appears to be image-based. Try re-scanning with a higher-quality scanner
              or photograph each page with your phone and place the images in the documents folder.
            </p>
            <a
              href="https://apps.apple.com/app/scanner-pro/id333710667"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-400 underline"
            >
              Scanner Pro (iOS) — recommended
            </a>
          </div>
        ) : (
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
            {doc.preview}
          </pre>
        )}
      </div>
    </div>
  );
}

export function DocumentList() {
  const { documents } = usePipelineStore();
  const [selected, setSelected] = useState<ScannedDocument | null>(null);
  const [filter, setFilter] = useState<DocType | "ALL">("ALL");

  const types = ["ALL", ...Array.from(new Set(documents.map(d => d.type)))] as Array<DocType | "ALL">;
  const filtered = filter === "ALL" ? documents : documents.filter(d => d.type === filter);

  const warnings = documents.filter(d => d.hasError || d.isImageBased).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Documents
            <span className="ml-2 text-sm font-normal text-slate-400">({documents.length})</span>
          </h2>
          {warnings > 0 && (
            <p className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3" /> {warnings} document{warnings > 1 ? "s" : ""} need review
            </p>
          )}
        </div>
      </div>

      {/* Type filter pills */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filter === t
                  ? "bg-blue-500/30 border-blue-400 text-blue-200"
                  : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Document rows */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            {documents.length === 0
              ? "No documents scanned yet — run the pipeline to scan your tax folder."
              : "No documents match this filter."}
          </div>
        )}
        {filtered.map(doc => (
          <button
            key={doc.filePath}
            onClick={() => setSelected(doc)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all hover:border-slate-500 group ${
              doc.hasError || doc.isImageBased
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-slate-700 bg-slate-800/40 hover:bg-slate-800"
            }`}
          >
            <FileText className={`w-4 h-4 shrink-0 ${doc.hasError || doc.isImageBased ? "text-amber-400" : "text-slate-400"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-200 truncate">{doc.filename}</span>
                {(doc.hasError || doc.isImageBased) && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <TypeBadge type={doc.type} />
                <span className="text-xs text-slate-500">{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                {doc.isImageBased && (
                  <span className="text-xs text-amber-400">Image-based PDF — prompt to re-scan</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
          </button>
        ))}
      </div>

      {/* Drawer */}
      {selected && <DocDrawer doc={selected} onClose={() => setSelected(null)} />}
      {selected && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelected(null)} />}
    </div>
  );
}
