import { useState } from "react";
import { FileText, AlertTriangle, Camera, X, ChevronRight } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { DocType, ScannedDocument } from "../types/pipeline";

const TYPE_COLOR: Record<DocType | "OTHER", string> = {
  "W2":        "bg-blue-50 text-blue-700 border-blue-200",
  "1099-NEC":  "bg-blue-50 text-blue-600 border-blue-200",
  "1099-INT":  "bg-cyan-50 text-cyan-700 border-cyan-200",
  "1099-DIV":  "bg-cyan-50 text-cyan-600 border-cyan-200",
  "1099-B":    "bg-indigo-50 text-indigo-700 border-indigo-200",
  "1099-MISC": "bg-blue-50 text-blue-500 border-blue-200",
  "1099-R":    "bg-purple-50 text-purple-700 border-purple-200",
  "1099-G":    "bg-violet-50 text-violet-700 border-violet-200",
  "1099-K":    "bg-blue-50 text-blue-700 border-blue-200",
  "SSA-1099":  "bg-purple-50 text-purple-600 border-purple-200",
  "1098":      "bg-green-50 text-green-700 border-green-200",
  "1098-T":    "bg-green-50 text-green-600 border-green-200",
  "1098-E":    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "K1":        "bg-amber-50 text-amber-700 border-amber-200",
  "RECEIPT":   "bg-teal-50 text-teal-700 border-teal-200",
  "OTHER":     "bg-gray-100 text-gray-600 border-gray-200",
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
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{doc.filename}</p>
          <div className="mt-1"><TypeBadge type={doc.type} /></div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {doc.isImageBased ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Camera className="w-10 h-10 text-amber-400" />
            <p className="text-amber-600 font-medium">Scanned PDF — no text detected</p>
            <p className="text-sm text-gray-500">
              This file appears to be image-based. Try re-scanning with a higher-quality scanner
              or photograph each page with your phone and place the images in the documents folder.
            </p>
            <a
              href="https://apps.apple.com/app/scanner-pro/id333710667"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-600 underline"
            >
              Scanner Pro (iOS) — recommended
            </a>
          </div>
        ) : (
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
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
          <h2 className="text-lg font-semibold text-gray-900">
            Documents
            <span className="ml-2 text-sm font-normal text-gray-400">({documents.length})</span>
          </h2>
          {warnings > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
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
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-400"
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
          <div className="text-center py-8 text-gray-400 text-sm">
            {documents.length === 0
              ? "No documents scanned yet — run the pipeline to scan your tax folder."
              : "No documents match this filter."}
          </div>
        )}
        {filtered.map(doc => (
          <button
            key={doc.filePath}
            onClick={() => setSelected(doc)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all group ${
              doc.hasError || doc.isImageBased
                ? "border-amber-200 bg-amber-50 hover:border-amber-300"
                : "border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <FileText className={`w-4 h-4 shrink-0 ${doc.hasError || doc.isImageBased ? "text-amber-400" : "text-gray-400"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-800 truncate">{doc.filename}</span>
                {(doc.hasError || doc.isImageBased) && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <TypeBadge type={doc.type} />
                <span className="text-xs text-gray-400">{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                {doc.isImageBased && (
                  <span className="text-xs text-amber-600">Image-based PDF — re-scan needed</span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
          </button>
        ))}
      </div>

      {/* Drawer */}
      {selected && <DocDrawer doc={selected} onClose={() => setSelected(null)} />}
      {selected && <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelected(null)} />}
    </div>
  );
}
