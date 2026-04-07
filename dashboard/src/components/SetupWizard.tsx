import { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Loader2, FolderOpen, Mail, Phone, MapPin, Eye, EyeOff, Send } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { TaxBotConfig } from "../types/pipeline";

const STEPS = ["documents", "gmail", "notifications", "preferences"] as const;
type WizardStep = typeof STEPS[number];

const STEP_LABELS: Record<WizardStep, string> = {
  documents:     "Tax Documents",
  gmail:         "Gmail",
  notifications: "Notifications",
  preferences:   "Preferences",
};

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((s, i) => {
        const idx = STEPS.indexOf(current);
        const done   = i < idx;
        const active = s === current;
        return (
          <div key={s} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-colors ${
              done   ? "bg-green-500 border-green-500 text-white" :
              active ? "bg-blue-600 border-blue-600 text-white" :
                       "bg-white border-gray-200 text-gray-400"
            }`}>
              {done ? <CheckCircle style={{ width: 14, height: 14 }} /> : i + 1}
            </div>
            <span className={`ml-2 text-xs font-medium hidden sm:block ${
              active ? "text-gray-900" : done ? "text-green-600" : "text-gray-400"
            }`}>
              {STEP_LABELS[s]}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-3 rounded-full ${done ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared field components ───────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-gray-700">{children}</span>;
}

function TextInput({ value, onChange, placeholder, mono, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-colors ${mono ? "font-mono" : ""}`}
    />
  );
}

function PasswordField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block space-y-1">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-9 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-800 font-mono outline-none focus:border-blue-500 focus:bg-white transition-colors"
        />
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {show
            ? <EyeOff style={{ width: 15, height: 15 }} />
            : <Eye    style={{ width: 15, height: 15 }} />}
        </button>
      </div>
    </label>
  );
}

function HintText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-gray-400 mt-0.5">{children}</p>;
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function SetupWizard() {
  const { config, setConfig } = usePipelineStore();
  const [step, setStep] = useState<WizardStep>("documents");
  const [form, setForm] = useState<TaxBotConfig>(() => config ?? {
    twilioAccountSid: "", twilioAuthToken: "", twilioFromNumber: "", recipientPhone: "",
    telegramBotToken: "", telegramChatId: "",
    gmailCredentialsPath: "~/.config/taxbot/gmail_credentials.json",
    taxDocumentsFolder: "", taxYear: 2025, userLocation: "", gmailEnabled: false,
  });
  const [notifTab, setNotifTab]           = useState<"sms" | "telegram">("sms");
  const [telegramTestResult, setTelegramTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving]               = useState(false);
  const [testResult, setTestResult]       = useState<{ ok: boolean; msg: string } | null>(null);
  const [gmailStatus, setGmailStatus]     = useState<"unknown" | "authorized" | "needs_auth">("unknown");

  useEffect(() => {
    fetch("/api/config/gmail-status")
      .then(r => r.json() as Promise<{ authorized: boolean }>)
      .then(d => setGmailStatus(d.authorized ? "authorized" : "needs_auth"))
      .catch(() => setGmailStatus("needs_auth"));
  }, []);

  function set<K extends keyof TaxBotConfig>(k: K, v: TaxBotConfig[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setConfig(form);
    } finally {
      setSaving(false);
    }
  }

  async function testTwilio() {
    setTestResult(null);
    setSaving(true);
    try {
      const res  = await fetch("/api/config/test-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountSid: form.twilioAccountSid, authToken: form.twilioAuthToken, from: form.twilioFromNumber, to: form.recipientPhone }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      setTestResult({ ok: data.success, msg: data.success ? "Test SMS sent! Check your phone." : (data.error ?? "Failed") });
    } finally {
      setSaving(false);
    }
  }

  async function testTelegram() {
    setTelegramTestResult(null);
    setSaving(true);
    try {
      const res  = await fetch("/api/config/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: form.telegramBotToken, chatId: form.telegramChatId }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      setTelegramTestResult({ ok: data.success, msg: data.success ? "Test message sent! Check your Telegram." : (data.error ?? "Failed") });
    } finally {
      setSaving(false);
    }
  }

  async function startGmailAuth() {
    const res  = await fetch("/api/config/gmail-auth-url");
    const data = await res.json() as { url: string };
    window.open(data.url, "_blank");
  }

  const next = () => { save(); const idx = STEPS.indexOf(step); if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]!); };
  const prev = () => {         const idx = STEPS.indexOf(step); if (idx > 0)                  setStep(STEPS[idx - 1]!); };

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-1">Configure your data sources and report delivery. Optional steps can be skipped.</p>
      </div>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

        {/* ── Documents ─────────────────────────────────────────────────── */}
        {step === "documents" && (
          <>
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <FolderOpen style={{ width: 16, height: 16 }} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Tax Documents Folder</h3>
                <p className="text-xs text-gray-400">Folder containing your W-2s, 1099s, and other PDFs</p>
              </div>
            </div>

            <label className="block space-y-1.5">
              <FieldLabel>Folder path</FieldLabel>
              <TextInput
                value={form.taxDocumentsFolder}
                onChange={v => set("taxDocumentsFolder", v)}
                placeholder="C:/Users/you/Documents/Taxes/2025"
                mono
              />
              <HintText>Place all your tax documents here before running the pipeline.</HintText>
            </label>

            <label className="block space-y-1.5">
              <FieldLabel>Tax year</FieldLabel>
              <input
                type="number"
                value={form.taxYear}
                onChange={e => set("taxYear", parseInt(e.target.value))}
                className="w-28 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-800 outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />
            </label>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-violet-600 uppercase tracking-wider">AI Engine</span>
              </div>
              <label className="block space-y-1.5">
                <FieldLabel>Anthropic API Key</FieldLabel>
                <input
                  type="password"
                  value={form.anthropicApiKey ?? ""}
                  onChange={e => set("anthropicApiKey", e.target.value)}
                  placeholder="sk-ant-api03-…"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-800 font-mono outline-none focus:border-violet-500 focus:bg-white transition-colors"
                />
                <HintText>
                  Required for AI document extraction. Falls back to{" "}
                  <code className="text-violet-600 bg-violet-50 px-1 rounded text-[11px]">ANTHROPIC_API_KEY</code>{" "}
                  env var or <code className="text-violet-600 bg-violet-50 px-1 rounded text-[11px]">.env</code> file.
                </HintText>
              </label>
            </div>
          </>
        )}

        {/* ── Gmail ─────────────────────────────────────────────────────── */}
        {step === "gmail" && (
          <>
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Mail style={{ width: 16, height: 16 }} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Gmail Integration <span className="text-gray-400 font-normal">(optional)</span></h3>
                <p className="text-xs text-gray-400">Scan Gmail for W-2 notices, 1099s, and IRS emails</p>
              </div>
            </div>

            {/* Auth status */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${
              gmailStatus === "authorized"
                ? "border-green-200 bg-green-50"
                : "border-gray-200 bg-gray-50"
            }`}>
              {gmailStatus === "authorized"
                ? <><CheckCircle style={{ width: 16, height: 16 }} className="text-green-600 shrink-0" /><span className="text-sm text-green-700 font-medium">Gmail authorized</span></>
                : <><AlertCircle style={{ width: 16, height: 16 }} className="text-amber-500 shrink-0" /><span className="text-sm text-gray-600">Not authorized yet</span></>
              }
            </div>

            {gmailStatus !== "authorized" && (
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <FieldLabel>credentials.json path</FieldLabel>
                  <TextInput
                    value={form.gmailCredentialsPath ?? ""}
                    onChange={v => set("gmailCredentialsPath", v)}
                    mono
                  />
                  <HintText>
                    Download from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client (Desktop app)
                  </HintText>
                </label>
                <button
                  onClick={startGmailAuth}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm"
                >
                  <Mail style={{ width: 15, height: 15 }} />
                  Authorize Gmail
                </button>
              </div>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.gmailEnabled}
                onChange={e => set("gmailEnabled", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600"
              />
              <span className="text-sm text-gray-700">Include Gmail scan in pipeline</span>
            </label>
          </>
        )}

        {/* ── Notifications ─────────────────────────────────────────────── */}
        {step === "notifications" && (
          <>
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Send style={{ width: 16, height: 16 }} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Report Delivery <span className="text-gray-400 font-normal">(optional)</span></h3>
                <p className="text-xs text-gray-400">Receive your completed tax report via SMS or Telegram</p>
              </div>
            </div>

            {/* Channel tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-gray-100 w-fit">
              {([
                { key: "sms",      label: "📱 SMS (Twilio)" },
                { key: "telegram", label: "✈️ Telegram" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setNotifTab(key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    notifTab === key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* SMS */}
            {notifTab === "sms" && (
              <div className="space-y-4">
                <HintText>
                  Get free trial credentials at{" "}
                  <a href="https://www.twilio.com" target="_blank" rel="noreferrer" className="text-blue-600 underline hover:text-blue-800">twilio.com</a>.
                </HintText>

                <label className="block space-y-1.5">
                  <FieldLabel>Account SID</FieldLabel>
                  <TextInput value={form.twilioAccountSid} onChange={v => set("twilioAccountSid", v)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" mono />
                </label>

                <PasswordField label="Auth Token" value={form.twilioAuthToken} onChange={v => set("twilioAuthToken", v)} />

                <label className="block space-y-1.5">
                  <FieldLabel>From number (Twilio)</FieldLabel>
                  <TextInput value={form.twilioFromNumber} onChange={v => set("twilioFromNumber", v)} placeholder="+12025551234" mono />
                </label>

                <label className="block space-y-1.5">
                  <FieldLabel>Your phone (recipient)</FieldLabel>
                  <TextInput value={form.recipientPhone} onChange={v => set("recipientPhone", v)} placeholder="+12025559876" mono />
                </label>

                <div className="pt-1 flex items-center gap-3">
                  <button
                    onClick={testTwilio}
                    disabled={saving || !form.twilioAccountSid || !form.twilioAuthToken}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {saving ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Phone style={{ width: 14, height: 14 }} />}
                    Send Test SMS
                  </button>
                  {testResult && (
                    <span className={`flex items-center gap-1.5 text-sm ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                      {testResult.ok
                        ? <CheckCircle style={{ width: 14, height: 14 }} />
                        : <AlertCircle style={{ width: 14, height: 14 }} />}
                      {testResult.msg}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Telegram */}
            {notifTab === "telegram" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-gray-600 space-y-1.5">
                  <p className="font-semibold text-blue-700 mb-1">Setup instructions</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-500">
                    <li>Message <span className="font-mono text-blue-600">@BotFather</span> on Telegram → <span className="font-mono">/newbot</span></li>
                    <li>Copy the bot token it gives you</li>
                    <li>Start a chat with your new bot, then visit:<br />
                      <span className="font-mono text-gray-700 break-all text-[11px]">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span>
                    </li>
                    <li>Copy the <span className="font-mono">"id"</span> from the chat object — that's your Chat ID</li>
                  </ol>
                </div>

                <PasswordField
                  label="Bot Token"
                  value={form.telegramBotToken ?? ""}
                  onChange={v => set("telegramBotToken", v)}
                  placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyz"
                />

                <label className="block space-y-1.5">
                  <FieldLabel>Chat ID</FieldLabel>
                  <TextInput value={form.telegramChatId ?? ""} onChange={v => set("telegramChatId", v)} placeholder="123456789" mono />
                </label>

                <div className="pt-1 flex items-center gap-3">
                  <button
                    onClick={testTelegram}
                    disabled={saving || !form.telegramBotToken || !form.telegramChatId}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {saving ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <Send style={{ width: 14, height: 14 }} />}
                    Send Test Message
                  </button>
                  {telegramTestResult && (
                    <span className={`flex items-center gap-1.5 text-sm ${telegramTestResult.ok ? "text-green-600" : "text-red-500"}`}>
                      {telegramTestResult.ok
                        ? <CheckCircle style={{ width: 14, height: 14 }} />
                        : <AlertCircle style={{ width: 14, height: 14 }} />}
                      {telegramTestResult.msg}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Preferences ───────────────────────────────────────────────── */}
        {step === "preferences" && (
          <>
            <div className="flex items-center gap-2 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <MapPin style={{ width: 16, height: 16 }} className="text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">Preferences</h3>
                <p className="text-xs text-gray-400">Location and other settings</p>
              </div>
            </div>

            <label className="block space-y-1.5">
              <FieldLabel>Your city & state (for CPA search)</FieldLabel>
              <TextInput value={form.userLocation} onChange={v => set("userLocation", v)} placeholder="Seattle, WA" />
            </label>

            {/* Summary card */}
            <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2.5 mt-2">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Configuration Summary</p>
              <div className="space-y-1.5 text-sm">
                {[
                  { icon: "📁", label: "Documents", value: form.taxDocumentsFolder || "not set",       mono: true },
                  { icon: "📧", label: "Gmail",     value: form.gmailEnabled ? "enabled" : "disabled", color: form.gmailEnabled ? "text-green-600" : "text-gray-400" },
                  { icon: "📱", label: "SMS to",    value: form.recipientPhone || "not set",            mono: true },
                  { icon: "✈️", label: "Telegram",  value: form.telegramBotToken ? `chat ${form.telegramChatId || "?"}` : "not configured", color: form.telegramBotToken ? "text-green-600" : "text-gray-400" },
                  { icon: "📍", label: "Location",  value: form.userLocation || "not set" },
                ].map(({ icon, label, value, mono, color }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <span>{icon}</span>{label}
                    </span>
                    <span className={`text-right truncate max-w-xs ${mono ? "font-mono text-xs text-gray-700" : color ?? "text-gray-700"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={prev}
          disabled={step === "documents"}
          className="px-4 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700 disabled:opacity-30 transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-2">
          {step !== "preferences" && (
            <button
              onClick={() => { save(); const idx = STEPS.indexOf(step); if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]!); }}
              className="px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={step === "preferences" ? save : next}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {saving && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
            {step === "preferences" ? "Save & Finish" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
