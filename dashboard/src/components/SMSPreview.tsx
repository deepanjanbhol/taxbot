import { useState, useMemo } from "react";
import { Send, CheckCircle, AlertCircle, Loader2, MessageSquare } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";

const MAX_SEGMENT_CHARS = 1550;
const TWILIO_COST_PER_SEGMENT = 0.0079;

function PhoneFrame({ text }: { text: string }) {
  const segments = splitSegments(text);
  return (
    <div className="flex flex-col gap-3">
      {segments.map((seg, i) => (
        <div key={i} className="relative">
          {segments.length > 1 && (
            <div className="absolute -top-2 left-3 text-xs text-slate-500 bg-slate-900 px-1">
              Message {i + 1}/{segments.length}
            </div>
          )}
          <div className="bg-slate-800 border border-slate-600 rounded-2xl rounded-tl-sm px-4 py-3 max-w-xs">
            <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">{seg}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function splitSegments(text: string): string[] {
  if (text.length <= MAX_SEGMENT_CHARS) return [text];
  const segs: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_SEGMENT_CHARS) {
    segs.push(remaining.slice(0, MAX_SEGMENT_CHARS));
    remaining = remaining.slice(MAX_SEGMENT_CHARS);
  }
  if (remaining) segs.push(remaining);
  return segs;
}

export function SMSPreview() {
  const { form1040Text, cpas, config, smsSent, smsMessageIds, setSMSSent } = usePipelineStore();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string | null>(null);

  // Build default SMS text from form + CPA list
  const defaultText = useMemo(() => {
    const lines: string[] = [];

    // Compact 1040 summary
    if (form1040Text) {
      const refundMatch = form1040Text.match(/(REFUND|AMOUNT YOU OWE)[:\s]+(\$[\d,]+)/i);
      const agiMatch    = form1040Text.match(/AGI:\s+(\$[\d,]+)/i);
      const effMatch    = form1040Text.match(/Effective Tax Rate:\s+([\d.]+%)/i);

      lines.push("📊 TAXBOT 2025 TAX ESTIMATE");
      if (refundMatch) lines.push(`${refundMatch[1].toUpperCase()}: ${refundMatch[2]}`);
      if (agiMatch)    lines.push(`AGI: ${agiMatch[1]}`);
      if (effMatch)    lines.push(`Effective rate: ${effMatch[1]}`);
      lines.push("⚠ Estimate only — review with CPA before filing");
    }

    // CPA summary
    if (cpas.length > 0) {
      lines.push("", "─".repeat(30), "", "👔 TAX PROFESSIONALS");
      cpas.slice(0, 3).forEach((c, i) => {
        lines.push(`${i + 1}. ${c.name} (${c.type})`);
        if (c.rating)          lines.push(`   ⭐ ${c.rating}${c.reviewCount ? ` (${c.reviewCount} reviews)` : ""}`);
        if (c.estimatedPrice)  lines.push(`   💰 ${c.estimatedPrice}`);
        if (c.phone)           lines.push(`   📞 ${c.phone}`);
        if (c.specialties[0])  lines.push(`   🎯 ${c.specialties.slice(0, 2).join(", ")}`);
        lines.push("");
      });
      lines.push("Verify at irs.treasury.gov/rpo/rpo.jsf");
    }

    return lines.join("\n");
  }, [form1040Text, cpas]);

  const text = editedText ?? defaultText;
  const segments = splitSegments(text);
  const chars = text.length;
  const cost = (segments.length * TWILIO_COST_PER_SEGMENT).toFixed(4);
  const fillPct = Math.min(100, (chars % MAX_SEGMENT_CHARS) / MAX_SEGMENT_CHARS * 100);

  async function handleSend() {
    if (!config?.twilioAccountSid) {
      setError("Twilio not configured — go to Setup to add your credentials.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline/step/send_sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, text }),
      });
      const data = await res.json() as { success: boolean; messageIds?: string[]; error?: string };
      if (data.success) {
        setSMSSent(data.messageIds ?? []);
      } else {
        setError(data.error ?? "Unknown error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  if (!form1040Text && cpas.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        Complete the pipeline first to generate the SMS report.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Send SMS Report</h2>
        {config?.recipientPhone && (
          <span className="text-xs text-slate-400">To: {config.recipientPhone}</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Edit message</span>
            <button onClick={() => setEditedText(null)} className="underline hover:text-slate-200">
              Reset to generated
            </button>
          </div>
          <textarea
            value={text}
            onChange={e => setEditedText(e.target.value)}
            rows={18}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-600 text-xs text-slate-200 font-mono leading-relaxed outline-none focus:border-blue-500 resize-none"
          />

          {/* Character bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{chars} chars · {segments.length} message{segments.length !== 1 ? "s" : ""}</span>
              <span>~${cost} Twilio cost</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${fillPct > 90 ? "bg-amber-500" : "bg-blue-500"}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <div className="flex gap-4 text-xs text-slate-500">
              {Array.from({ length: segments.length }, (_, i) => (
                <span key={i}>Msg {i + 1}: {Math.min(MAX_SEGMENT_CHARS, chars - i * MAX_SEGMENT_CHARS)} chars</span>
              ))}
            </div>
          </div>
        </div>

        {/* Phone preview */}
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Preview</p>
          <div className="bg-slate-950 border border-slate-700 rounded-2xl p-4 min-h-64 flex flex-col">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-800">
              <MessageSquare className="w-4 h-4 text-green-400" />
              <span className="text-xs text-slate-300 font-medium">TaxBot</span>
              <span className="text-xs text-slate-500 ml-auto">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <PhoneFrame text={text} />
          </div>
        </div>
      </div>

      {/* Send button */}
      <div className="flex items-center gap-3 flex-wrap">
        {smsSent ? (
          <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
            <CheckCircle className="w-5 h-5" />
            Sent! Message IDs: {smsMessageIds.join(", ")}
          </div>
        ) : (
          <button
            onClick={handleSend}
            disabled={sending || !config?.twilioAccountSid}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors shadow-lg shadow-green-500/20"
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : <><Send className="w-4 h-4" /> Send {segments.length > 1 ? `${segments.length} Messages` : "Message"}</>
            }
          </button>
        )}
        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
      </div>
    </div>
  );
}
