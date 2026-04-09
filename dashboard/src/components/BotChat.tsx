/**
 * BotChat.tsx
 *
 * In-dashboard chat interface for the TaxBot assistant.
 * Also shows Telegram and Twilio webhook setup instructions so users can
 * connect their own messaging apps.
 *
 * The same intelligence is available via Telegram and Twilio SMS —
 * this UI is for testing and for users who haven't set up messaging yet.
 */

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, MessageSquare, ExternalLink, Copy, CheckCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";

interface Message {
  role: "user" | "bot";
  text: string;
  ts: Date;
}

const SUGGESTIONS = [
  "Show my last tax estimate",
  "What did I owe vs refund last time?",
  "Find CPAs under $150 near me",
  "Any discounts for self-employed filers?",
  "Compare my last 3 runs",
  "Am I eligible for free filing?",
];

function ChatBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? "bg-blue-600" : "bg-gray-100 border border-gray-200"}`}>
        {isUser
          ? <User className="w-4 h-4 text-white" />
          : <Bot className="w-4 h-4 text-gray-500" />
        }
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
        isUser
          ? "bg-blue-600 text-white rounded-tr-sm"
          : "bg-gray-50 border border-gray-100 text-gray-800 rounded-tl-sm"
      }`}>
        {msg.text}
        <div className={`text-[10px] mt-1 ${isUser ? "text-blue-200" : "text-gray-400"}`}>
          {msg.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

function TelegramSetup({ config }: { config: { telegramBotToken?: string; telegramChatId?: string } | null }) {
  const [pollerActive, setPollerActive] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/telegram/status")
      .then(r => r.json())
      .then((d: { polling: boolean }) => setPollerActive(d.polling))
      .catch(() => setPollerActive(false));
  }, []);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const hasBotToken = !!config?.telegramBotToken;
  const hasChatId   = !!config?.telegramChatId;

  return (
    <div className="space-y-4">
      {/* Poller status banner */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
        pollerActive
          ? "bg-green-50 border-green-200 text-green-700"
          : "bg-amber-50 border-amber-200 text-amber-700"
      }`}>
        {pollerActive
          ? <Wifi className="w-4 h-4 shrink-0" />
          : <WifiOff className="w-4 h-4 shrink-0" />
        }
        {pollerActive
          ? "Telegram bot is active — send it a message from your phone"
          : "Telegram bot is not active. Configure a bot token in Settings to enable it."
        }
      </div>

      <p className="text-sm text-gray-500">
        TaxBot uses Telegram's polling API — it works directly from your laptop with no
        public server, webhook registration, or tunneling (ngrok) needed.
      </p>

      {/* Step-by-step */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-800">3-step Telegram setup</p>
        </div>

        <ol className="space-y-3 text-xs text-gray-600">
          <li className="flex gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
              hasBotToken ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
            }`}>{hasBotToken ? "✓" : "1"}</span>
            <span>
              Message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 underline">@BotFather</a> on Telegram
              → <code className="bg-gray-100 px-1 rounded">/newbot</code>
              → follow prompts → copy the token
              → paste it in <strong>Settings → Telegram Bot Token</strong>.
              {hasBotToken && <span className="ml-1 text-green-600 font-medium">Done ✓</span>}
            </span>
          </li>
          <li className="flex gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
              hasChatId ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
            }`}>{hasChatId ? "✓" : "2"}</span>
            <span>
              Start a chat with your bot and send <code className="bg-gray-100 px-1 rounded">/start</code>.
              Then find your Chat ID:
              <button
                onClick={() => copy("https://t.me/userinfobot")}
                className="ml-1 inline-flex items-center gap-1 text-blue-600 underline"
              >
                t.me/userinfobot {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </button>
              → paste the ID in <strong>Settings → Telegram Chat ID</strong>.
              {hasChatId && <span className="ml-1 text-green-600 font-medium">Done ✓</span>}
            </span>
          </li>
          <li className="flex gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
              pollerActive ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
            }`}>{pollerActive ? "✓" : "3"}</span>
            <span>
              That's it — TaxBot polls Telegram automatically in the background.
              No webhook, no public URL, no ngrok.
              {pollerActive && <span className="ml-1 text-green-600 font-medium">Active ✓</span>}
            </span>
          </li>
        </ol>
      </div>

      {/* Twilio note */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
        <p className="text-xs text-gray-500 font-medium mb-1">Twilio SMS</p>
        <p className="text-xs text-gray-500">
          Twilio SMS delivery (for pipeline reports) works from localhost. However, receiving
          inbound SMS via Twilio requires a public webhook URL — for that use case, deploy
          TaxBot to a VPS or use ngrok. Telegram long-poll is the recommended channel for
          local installations.
        </p>
        <a
          href="https://github.com/anthropics/claude-code"
          target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 underline"
        >
          Learn more <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

export function BotChat() {
  const { config } = usePipelineStore();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Hi! I'm TaxBot. I can answer questions about your past tax estimates, help you find tax professionals and discounts, or explain your numbers.\n\nTry: \"Show my last estimate\" or \"Find CPAs under $150\"",
      ts: new Date(),
    },
  ]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<"chat" | "setup">("chat");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", text: text.trim(), ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/bot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim() }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      const botMsg: Message = {
        role: "bot",
        text: data.reply ?? data.error ?? "Sorry, something went wrong.",
        ts: new Date(),
      };
      setMessages(prev => [...prev, botMsg]);
    } catch {
      setMessages(prev => [...prev, { role: "bot", text: "Network error — could not reach TaxBot.", ts: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setTab("chat")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "chat" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          💬 Chat
        </button>
        <button
          onClick={() => setTab("setup")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === "setup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          📱 Telegram Setup
        </button>
      </div>

      {tab === "setup" ? (
        <div className="flex-1 overflow-auto">
          <TelegramSetup config={config} />
        </div>
      ) : (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-auto space-y-4 pb-2">
            {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-gray-500" />
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 my-3">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 text-xs rounded-full border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Ask about your taxes, past estimates, or tax pros…"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
