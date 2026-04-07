/**
 * telegram-sender.ts
 * Sends the tax report via Telegram Bot API (no external package — pure fetch).
 *
 * Setup:
 *   1. Message @BotFather on Telegram → /newbot → copy the token
 *   2. Start a chat with your bot, then call:
 *      GET https://api.telegram.org/bot<TOKEN>/getUpdates
 *      to find your chat_id (look for "id" under "chat")
 *   3. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env (or set in Setup wizard)
 *
 * Long reports (> 4000 chars): first 1000 chars sent as a message,
 * full report attached as tax-report.txt document.
 */

export interface TelegramConfig {
  botToken: string;   // from @BotFather
  chatId: string;     // numeric chat ID or @channelusername
}

export interface TelegramResult {
  success: boolean;
  messagesSent: number;
  error?: string;
}

const TG_MAX = 4000; // Telegram hard limit is 4096; leave buffer

function apiBase(token: string) {
  return `https://api.telegram.org/bot${token}`;
}

async function sendTgMessage(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`${apiBase(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:               chatId,
      text,
      parse_mode:            "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(data.description ?? `Telegram sendMessage failed (${res.status})`);
}

async function sendTgDocument(
  token: string,
  chatId: string,
  filename: string,
  content: string,
  caption: string,
): Promise<void> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption.slice(0, 1024)); // caption max 1024 chars
  form.append("document", new Blob([content], { type: "text/plain" }), filename);

  const res = await fetch(`${apiBase(token)}/sendDocument`, { method: "POST", body: form });
  const data = await res.json() as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(data.description ?? `Telegram sendDocument failed (${res.status})`);
}

function splitIntoChunks(text: string, maxLen = TG_MAX): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen) {
      if (current) {
        chunks.push(current);
        current = line;
      } else {
        let rem = line;
        while (rem.length > maxLen) {
          chunks.push(rem.slice(0, maxLen));
          rem = rem.slice(maxLen);
        }
        current = rem;
      }
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Send a tax report via Telegram.
 * Reports <= 4000 chars → single message.
 * Reports <= 12000 chars → multiple messages.
 * Longer → short summary message + full report as .txt attachment.
 */
export async function sendTelegramReport(
  config: TelegramConfig,
  text: string,
): Promise<TelegramResult> {
  try {
    if (text.length > TG_MAX * 3) {
      // Long report → summary + file attachment
      const preview = text.slice(0, 900).trimEnd();
      await sendTgMessage(
        config.botToken, config.chatId,
        `📊 <b>TaxBot 2025 Report</b>\n\n${escapeHtml(preview)}\n\n<i>Full report attached below ↓</i>`,
      );
      await sendTgDocument(
        config.botToken, config.chatId,
        "tax-report-2025.txt", text,
        "📄 Full Form 1040 Report — TaxBot 2025",
      );
      return { success: true, messagesSent: 2 };
    }

    const chunks = splitIntoChunks(text);
    const total = chunks.length;
    for (let i = 0; i < total; i++) {
      const prefix = total > 1 ? `[${i + 1}/${total}]\n` : "";
      await sendTgMessage(config.botToken, config.chatId, prefix + escapeHtml(chunks[i]!));
      if (i < total - 1) await new Promise(r => setTimeout(r, 200));
    }
    return { success: true, messagesSent: total };
  } catch (err) {
    return {
      success:      false,
      messagesSent: 0,
      error:        err instanceof Error ? err.message : String(err),
    };
  }
}

/** Minimal HTML entity escaping for Telegram's HTML parse mode. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Validate a Telegram bot token format (basic sanity check). */
export function validateTelegramToken(token: string): boolean {
  return /^\d+:[A-Za-z0-9_-]{35,}$/.test(token.trim());
}
