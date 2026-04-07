import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer, Copy, Pencil, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";

interface ParsedSection {
  title: string;
  lines: string[];
  highlight?: boolean;   // Big Beautiful Bill section
}

/** Parse the plain-text 1040 output into sections for structured rendering. */
function parseSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();

    // Section headers (ALL CAPS lines that aren't separators)
    if (/^[A-Z][A-Z\s/&()–-]{4,}$/.test(line.trim()) && !line.trim().startsWith("─") && !line.trim().startsWith("═")) {
      if (current) sections.push(current);
      current = { title: line.trim(), lines: [], highlight: line.includes("BIG BEAUTIFUL") };
      continue;
    }
    if (current) {
      if (line.trim()) current.lines.push(line);
    } else if (line.trim()) {
      current = { title: "Header", lines: [line] };
    }
  }
  if (current) sections.push(current);
  return sections.filter(s => s.lines.length > 0);
}

/** Extract the refund/owed line from the text. */
function extractResult(text: string): { type: "refund" | "owed" | null; amount: string } {
  const refundMatch = text.match(/REFUND[:\s]+(\$[\d,]+)/i);
  const owedMatch   = text.match(/AMOUNT YOU OWE[:\s]+(\$[\d,]+)/i);
  if (refundMatch) return { type: "refund", amount: refundMatch[1]! };
  if (owedMatch)   return { type: "owed",   amount: owedMatch[1]! };
  return { type: null, amount: "" };
}

function BBBLine({ line }: { line: string }) {
  const isBBB = line.includes("Big Beautiful") || line.includes("⚡") || line.includes("23%") ||
    line.includes("Tip income") || line.includes("overtime") || line.includes("Senior deduction") ||
    line.includes("Car loan");
  return (
    <div className={`flex items-baseline gap-1 py-0.5 rounded px-1 -mx-1 ${isBBB ? "bg-amber-500/10" : ""}`}>
      {isBBB && <Zap className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />}
      <pre className={`text-xs font-mono whitespace-pre-wrap ${isBBB ? "text-amber-200" : "text-slate-300"}`}>
        {line}
      </pre>
    </div>
  );
}

function SectionBlock({ section, defaultOpen }: { section: ParsedSection; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasNumbers = section.lines.some(l => l.includes("$"));

  return (
    <div className={`rounded-lg border overflow-hidden ${section.highlight ? "border-amber-500/40" : "border-slate-700"}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors ${
          section.highlight ? "bg-amber-500/10 hover:bg-amber-500/15" : "bg-slate-800 hover:bg-slate-750"
        }`}
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        }
        <span className={`text-sm font-semibold ${section.highlight ? "text-amber-300" : "text-slate-200"}`}>
          {section.title}
        </span>
        {section.highlight && <Zap className="w-3.5 h-3.5 text-amber-400" />}
        {!open && hasNumbers && (
          <span className="ml-auto text-xs text-slate-500">
            {section.lines.find(l => l.includes("$"))?.match(/\$[\d,]+/)?.[0] ?? ""}
          </span>
        )}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-0.5 bg-slate-900/50">
          {section.lines.map((line, i) => <BBBLine key={i} line={line} />)}
        </div>
      )}
    </div>
  );
}

export function Form1040Viewer() {
  const { form1040Text, setActiveTab } = usePipelineStore();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  if (!form1040Text) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        Form 1040 will appear here after the pipeline completes.
      </div>
    );
  }

  const sections = parseSections(form1040Text);
  const result   = extractResult(form1040Text);

  // Extract Big Beautiful Bill lines
  const bbbLines = form1040Text
    .split("\n")
    .filter(l => l.includes("Big Beautiful") || l.includes("⚡") || l.includes("excluded") || l.includes("23%"))
    .slice(0, 6);

  function copyForCPA() {
    navigator.clipboard.writeText(form1040Text ?? "");
  }

  return (
    <div className="space-y-4">
      {/* Result banner */}
      {result.type && (
        <div className={`flex items-center justify-between px-6 py-4 rounded-xl border ${
          result.type === "refund"
            ? "bg-green-500/10 border-green-500/40 text-green-300"
            : "bg-red-500/10 border-red-500/40 text-red-300"
        }`}>
          <div>
            <p className="text-xs uppercase tracking-wider opacity-70">
              {result.type === "refund" ? "Estimated Refund" : "Estimated Amount Owed"}
            </p>
            <p className="text-3xl font-bold font-mono mt-0.5">{result.amount}</p>
          </div>
          {result.type === "refund"
            ? <span className="text-4xl">✅</span>
            : <span className="text-4xl">⚠️</span>
          }
        </div>
      )}

      {/* Effective / marginal rates */}
      {(() => {
        const effMatch = form1040Text.match(/Effective Tax Rate:\s+([\d.]+%)/);
        const margMatch = form1040Text.match(/Marginal Tax Rate:\s+([\d.]+%)/);
        const agiMatch  = form1040Text.match(/AGI:\s+(\$[\d,]+)/);
        if (!effMatch) return null;
        return (
          <div className="flex flex-wrap gap-4 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-sm">
            {effMatch  && <div><span className="text-slate-500">Effective rate </span><span className="text-slate-100 font-mono font-medium">{effMatch[1]}</span></div>}
            {margMatch && <div><span className="text-slate-500">Marginal rate </span><span className="text-slate-100 font-mono font-medium">{margMatch[1]}</span></div>}
            {agiMatch  && <div><span className="text-slate-500">AGI </span><span className="text-slate-100 font-mono font-medium">{agiMatch[1]}</span></div>}
          </div>
        );
      })()}

      {/* BBB highlights */}
      {bbbLines.length > 0 && (
        <div className="px-4 py-3 rounded-lg bg-amber-500/8 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Big Beautiful Bill provisions applied</span>
          </div>
          <ul className="space-y-1">
            {bbbLines.map((l, i) => (
              <li key={i} className="text-xs text-amber-200 font-mono pl-2 border-l border-amber-500/40">
                {l.trim().replace(/^\s*•?\s*/, "")}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-400/70 mt-2">⚠ Verify enacted status with IRS.gov or your CPA.</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handlePrint()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 text-sm transition-colors"
        >
          <Printer className="w-4 h-4" /> Print
        </button>
        <button
          onClick={copyForCPA}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 text-sm transition-colors"
        >
          <Copy className="w-4 h-4" /> Copy for CPA
        </button>
        <button
          onClick={() => setActiveTab("editor")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-600 text-blue-300 hover:border-blue-500 text-sm transition-colors"
        >
          <Pencil className="w-4 h-4" /> Edit & Recalculate
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {sections.map((s, i) => (
          <SectionBlock key={i} section={s} defaultOpen={i < 2 || s.title.includes("RESULT") || s.title.includes("SUMMARY")} />
        ))}
      </div>

      {/* Print-only content */}
      <div className="hidden">
        <div ref={printRef} className="p-8 font-mono text-xs leading-relaxed whitespace-pre">
          {form1040Text}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-700">
        <p className="text-xs text-slate-400">
          ⚠ <strong className="text-slate-300">AI-generated estimate — not a filed tax return.</strong>{" "}
          Always review with a licensed CPA or Enrolled Agent before filing.
          IRS Publication 17 and official Form 1040 instructions are the authoritative source.
        </p>
      </div>
    </div>
  );
}
