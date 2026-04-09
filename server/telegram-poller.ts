/**
 * telegram-poller.ts
 *
 * Telegram long-poll loop using the getUpdates API.
 * Works from ANY machine — no public server, no webhook registration, no ngrok.
 *
 * Usage: call startTelegramPoller(getConfig) on server boot.
 * The loop starts only when telegramBotToken is present in config.
 * Config is re-read on every poll cycle so token changes take effect immediately.
 */

import type { TaxBotConfig } from "../dashboard/src/types/pipeline.js";
import { handleBotMessage, type TelegramUpdate } from "./bot-handler.js";

let _running = false;
let _stop    = false;

export function isTelegramPolling(): boolean { return _running; }

export function stopTelegramPoller(): void { _stop = true; }

export async function startTelegramPoller(
  getConfig: () => Promise<TaxBotConfig | null>,
): Promise<void> {
  if (_running) return;
  _running = true;
  _stop    = false;
  console.log("[TaxBot Telegram] Long-poll started (no webhook required)");

  let offset           = 0;
  let consecutiveErrors = 0;

  while (!_stop) {
    const config   = await getConfig();
    const botToken = config?.telegramBotToken?.trim();

    if (!botToken) {
      // Not configured yet — check again in 30 s
      await sleep(30_000);
      continue;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates` +
        `?offset=${offset}&timeout=25&allowed_updates=["message"]`;

      const res = await fetch(url, { signal: AbortSignal.timeout(35_000) });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.warn(`[TaxBot Telegram] getUpdates HTTP ${res.status}: ${body.slice(0, 200)}`);
        consecutiveErrors++;
        await sleep(Math.min(consecutiveErrors * 3_000, 60_000));
        continue;
      }

      const data = await res.json() as { ok: boolean; result: TelegramUpdate[] };
      consecutiveErrors = 0;

      for (const update of data.result ?? []) {
        offset = update.update_id + 1;

        const msg    = update.message;
        const text   = msg?.text?.trim();
        const chatId = msg?.chat.id;
        if (!text || !chatId) continue;

        // Security: only respond to configured chat ID (if set)
        if (config?.telegramChatId && String(chatId) !== config.telegramChatId) {
          console.warn(`[TaxBot Telegram] Ignoring message from unknown chat ${chatId}`);
          continue;
        }

        // Handle each message in the background so polling continues
        void (async () => {
          try {
            await sendChatAction(botToken, chatId, "typing");
            const reply = await handleBotMessage(text, config);
            await sendMessage(botToken, chatId, reply);
          } catch (err) {
            console.error("[TaxBot Telegram] Error handling message:", err instanceof Error ? err.message : err);
          }
        })();
      }

    } catch (err) {
      if (_stop) break;
      consecutiveErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      // AbortError = timeout (expected for long-poll), not worth logging noisily
      if (!msg.includes("AbortError") && !msg.includes("abort")) {
        console.warn(`[TaxBot Telegram] Poll error (${consecutiveErrors}):`, msg);
      }
      await sleep(Math.min(consecutiveErrors * 2_000, 30_000));
    }
  }

  _running = false;
  console.log("[TaxBot Telegram] Long-poll stopped");
}

// ── Telegram API helpers ──────────────────────────────────────────────────────

async function sendMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      chat_id:                  chatId,
      text:                     escaped,
      parse_mode:               "HTML",
      disable_web_page_preview: true,
    }),
  });
}

async function sendChatAction(botToken: string, chatId: number, action: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => { /* best-effort */ });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
