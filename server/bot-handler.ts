/**
 * bot-handler.ts
 *
 * Conversational assistant accessible via Telegram and Twilio SMS.
 * Users can ask natural language questions and get personalized answers based
 * on their own tax profile from the most recent pipeline run.
 *
 * Capabilities:
 *   - Past history: "show my last estimate", "what did I owe?", "compare my last 3 runs"
 *   - Tax pros: "find CPAs under $150", "any discounts for self-employed?", "best deal?"
 *   - Profile-aware: knows your AGI, filing status, income type from last run
 *   - Trigger a new pipeline run: "re-run my taxes", "update my estimate"
 *
 * Both channels share the same intent handler — channel differences are only in
 * send/receive formatting.
 */

import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { findCPAs, formatCPAListForSms } from "../src/tools/cpa-finder.js";
import type { TaxBotConfig } from "../dashboard/src/types/pipeline.js";
import type { RunHistory } from "../dashboard/src/types/pipeline.js";

const HISTORY_DIR = path.join(os.homedir(), ".config", "taxbot", "runs");

// ── Load helpers ──────────────────────────────────────────────────────────────

async function loadHistory(): Promise<RunHistory[]> {
  try {
    const files = await fs.readdir(HISTORY_DIR);
    const runs = await Promise.all(
      files
        .filter(f => f.endsWith(".json"))
        .map(f => fs.readFile(path.join(HISTORY_DIR, f), "utf-8").then(JSON.parse))
    );
    return (runs as RunHistory[]).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  } catch { return []; }
}

async function loadConfig(): Promise<TaxBotConfig | null> {
  const CONFIG_PATH = path.join(os.homedir(), ".openclaw", "taxbot-config.json");
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8")) as TaxBotConfig;
  } catch { return null; }
}

// ── Build system context from user's tax profile ──────────────────────────────

function buildUserContext(history: RunHistory[]): string {
  if (history.length === 0) {
    return "No tax runs found yet — the user has not run the pipeline.";
  }

  const latest = history[0]!;
  const lines: string[] = [
    `Today's date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `Most recent run: ${new Date(latest.startedAt).toLocaleDateString()} — status: ${latest.status}`,
  ];

  if (latest.refundOrOwed !== undefined) {
    lines.push(
      latest.refundOrOwed >= 0
        ? `Estimated refund: $${latest.refundOrOwed.toLocaleString()}`
        : `Estimated amount owed: $${Math.abs(latest.refundOrOwed).toLocaleString()}`
    );
  }

  // Pull key metrics from form1040 text
  if (latest.form1040) {
    const t = latest.form1040;
    const pick = (pattern: RegExp) => t.match(pattern)?.[1] ?? null;
    const agi      = pick(/ADJUSTED GROSS INCOME.*?(\$[\d,]+)/i);
    const taxable  = pick(/TAXABLE INCOME.*?(\$[\d,]+)/i);
    const effRate  = pick(/Effective Tax Rate:\s+([\d.]+%)/i);
    const margRate = pick(/Marginal Tax Rate:\s+([\d.]+%)/i);
    const filingStatus = pick(/Filing Status:\s+(\w[\w\s]+)/i);
    if (agi)         lines.push(`AGI: ${agi}`);
    if (taxable)     lines.push(`Taxable income: ${taxable}`);
    if (effRate)     lines.push(`Effective tax rate: ${effRate}`);
    if (margRate)    lines.push(`Marginal tax rate: ${margRate}`);
    if (filingStatus) lines.push(`Filing status: ${filingStatus}`);
  }

  // Extracted form data
  if (latest.extractedData) {
    const d = latest.extractedData;
    lines.push(`Filing status: ${d.filingStatus}`);
    const wages = (d.wages as { value?: number })?.value;
    const biz   = (d.businessIncome as { value?: number })?.value;
    const rental = (d.rentalIncome as { value?: number })?.value;
    if (wages  && wages  > 0) lines.push(`W-2 wages: $${wages.toLocaleString()}`);
    if (biz    && biz    > 0) lines.push(`Business income: $${biz.toLocaleString()} (self-employed)`);
    if (rental && rental > 0) lines.push(`Rental income: $${rental.toLocaleString()}`);
    if (d.age65OrOlder)       lines.push("Age 65 or older: yes");
    if (d.receivedTips)       lines.push("Has tip income: yes");
    if (d.receivedOvertime)   lines.push("Has overtime pay: yes");
    if (d.hasCarLoan && d.isUsMadeVehicle) lines.push("Has US-made vehicle car loan: yes");
  }

  // Past runs summary
  if (history.length > 1) {
    lines.push(`\nPast runs (${history.length} total):`);
    history.slice(0, 5).forEach((r, i) => {
      const date  = new Date(r.startedAt).toLocaleDateString();
      const money = r.refundOrOwed !== undefined
        ? (r.refundOrOwed >= 0 ? `refund $${r.refundOrOwed.toLocaleString()}` : `owed $${Math.abs(r.refundOrOwed).toLocaleString()}`)
        : r.status;
      lines.push(`  ${i + 1}. ${date} — ${money}`);
    });
  }

  return lines.join("\n");
}

// ── Intent: CPA search with personalization ───────────────────────────────────

async function handleCPASearch(
  userMessage: string,
  config: TaxBotConfig | null,
  latestRun: RunHistory | undefined,
): Promise<string> {
  // Determine complexity from user's tax profile
  let complexity = "moderate";
  if (latestRun?.extractedData) {
    const d = latestRun.extractedData;
    const hasBiz    = ((d.businessIncome as { value?: number })?.value ?? 0) > 0;
    const hasRental = ((d.rentalIncome   as { value?: number })?.value ?? 0) > 0;
    const hasLtcg   = ((d.ltcg          as { value?: number })?.value ?? 0) > 0;
    if (hasBiz || hasRental || hasLtcg) complexity = "complex";
    const wages = ((d.wages as { value?: number })?.value ?? 0);
    const agi   = latestRun.form1040?.match(/ADJUSTED GROSS INCOME.*?(\$[\d,]+)/i)?.[1]?.replace(/[$,]/g, "");
    if (!hasBiz && !hasRental && !hasLtcg && Number(agi) < 75000) complexity = "simple";
  }

  const location = config?.userLocation || "United States";

  // Extract any price filter from user message
  const budgetMatch = userMessage.match(/under\s+\$?(\d+)|less\s+than\s+\$?(\d+)|\$?(\d+)\s+or\s+less/i);
  const maxBudget   = budgetMatch ? parseInt(budgetMatch[1] ?? budgetMatch[2] ?? budgetMatch[3] ?? "9999") : null;

  const result = await findCPAs({
    location,
    returnDetails: userMessage,
    maxResults: 6,
    complexity: complexity as "simple" | "moderate" | "complex",
  });

  // Filter by budget if requested
  let cpas = result.cpas;
  if (maxBudget) {
    cpas = cpas.filter(c => c.priceMin === undefined || c.priceMin <= maxBudget);
  }

  if (cpas.length === 0) {
    return `No tax professionals found matching your request${maxBudget ? ` under $${maxBudget}` : ""}. Try broadening your search or removing the budget filter.`;
  }

  const lines: string[] = [
    `📋 Tax professionals for your ${complexity} return (${location}):`,
    "",
  ];

  const tiers = [1, 2, 3] as const;
  const tierLabel = { 1: "💻 Online Services", 2: "🌐 Freelancers & Remote", 3: "🏢 Local CPAs & Firms" };

  for (const tier of tiers) {
    const tierCPAs = cpas.filter(c => c.tier === tier);
    if (tierCPAs.length === 0) continue;
    lines.push(tierLabel[tier]);
    for (const c of tierCPAs.slice(0, 3)) {
      lines.push(`• ${c.name}${c.recommended ? " ⭐ Best Value" : ""}`);
      if (c.estimatedPrice)   lines.push(`  💰 ${c.estimatedPrice}`);
      if (c.bestFor)          lines.push(`  👤 Best for: ${c.bestFor}`);
      if (c.rating)           lines.push(`  ⭐ ${c.rating}${c.reviewCount ? ` (${c.reviewCount.toLocaleString()} reviews)` : ""}`);
      if (c.quoteUrl)         lines.push(`  🔗 ${c.quoteUrl}`);
      lines.push("");
    }
  }

  // Personalized discount note
  if (latestRun?.extractedData) {
    const d = latestRun.extractedData;
    const notes: string[] = [];
    const biz = ((d.businessIncome as { value?: number })?.value ?? 0) > 0;
    if (biz)     notes.push("💡 Self-employed? Ask about Schedule C bundles — many firms offer 15–25% off if you bring bookkeeping records.");
    if (d.age65OrOlder)  notes.push("💡 As a senior (65+), AARP Foundation Tax-Aide offers FREE filing through IRS VITA sites.");
    const wages = (d.wages as { value?: number })?.value ?? 0;
    if (wages < 67000 && !biz) notes.push("💡 Income under $67K? IRS Free File at irs.gov/freefile lets you file completely free.");
    if (notes.length > 0) {
      lines.push("─".repeat(30));
      lines.push(...notes);
    }
  }

  return lines.join("\n");
}

// ── Core AI handler ───────────────────────────────────────────────────────────

export async function handleBotMessage(
  userMessage: string,
  config: TaxBotConfig | null,
): Promise<string> {
  const apiKey = config?.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "⚠ TaxBot is not configured yet. Please complete setup at your TaxBot dashboard first.";
  }

  const history = await loadHistory();
  const latest  = history[0];
  const userCtx = buildUserContext(history);

  const lc = userMessage.toLowerCase();

  // Fast-path: CPA / tax pro search
  const isCPAQuery = /cpa|tax pro|accountant|preparer|discount|deal|price|cost|cheap|afford|find.*tax|tax.*find/i.test(lc);
  if (isCPAQuery) {
    return await handleCPASearch(userMessage, config, latest);
  }

  // Fast-path: history summary
  const isHistoryQuery = /history|past|last|previous|estimate|refund|owed|ran|result|compare/i.test(lc);

  // Use Claude to answer conversationally with the user's tax context
  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are TaxBot, a personal tax assistant. You have access to the user's tax information from their most recent pipeline run. Answer concisely — this is a chat/SMS conversation, so keep responses under 300 words. Use plain text (no markdown headers, no bold). Use emoji sparingly.

USER'S TAX PROFILE:
${userCtx}

Guidelines:
- For history questions: summarize their results clearly (refund vs owed, key amounts)
- For comparison questions: compare their runs by date and outcome
- For tax questions: give practical, accurate guidance referencing their specific situation
- Always remind them this is an estimate and they should verify with a professional
- If they ask to re-run taxes, tell them to open the TaxBot dashboard and click "Prepare My Taxes"
- Never make up numbers — only reference what's in their profile above
- If no runs exist yet, tell them to run the pipeline first`;

  const response = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userMessage }],
  });

  const text = response.content[0];
  return text?.type === "text" ? text.text : "Sorry, I could not generate a response.";
}

// ── Telegram webhook handler ──────────────────────────────────────────────────

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat:  { id: number; type: string };
    text?: string;
    date:  number;
  };
}

export async function handleTelegramWebhook(
  update: TelegramUpdate,
  config: TaxBotConfig | null,
): Promise<void> {
  const msg  = update.message;
  const text = msg?.text?.trim();
  const chatId = String(msg?.chat.id ?? "");

  if (!text || !chatId) return;

  // Security: only respond to configured chat ID
  if (config?.telegramChatId && chatId !== config.telegramChatId) {
    console.warn(`[TaxBot Bot] Telegram message from unknown chat ${chatId} — ignored`);
    return;
  }

  const botToken = config?.telegramBotToken;
  if (!botToken) {
    console.warn("[TaxBot Bot] Telegram bot token not configured");
    return;
  }

  // Typing indicator
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});

  const reply = await handleBotMessage(text, config);

  // Telegram: escape for HTML parse mode
  const escaped = reply.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:    chatId,
      text:       escaped,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

// ── Twilio SMS webhook handler ────────────────────────────────────────────────

export interface TwilioWebhookBody {
  From:     string;   // E.164 sender number
  To:       string;   // your Twilio number
  Body:     string;   // SMS text
  MessageSid: string;
}

export async function handleTwilioWebhook(
  body: TwilioWebhookBody,
  config: TaxBotConfig | null,
): Promise<string> {
  // Security: only respond to the configured recipient phone
  if (config?.recipientPhone && body.From !== config.recipientPhone) {
    console.warn(`[TaxBot Bot] SMS from unknown number ${body.From} — ignored`);
    return twimlResponse("This number is not authorized to use TaxBot.");
  }

  const reply = await handleBotMessage(body.Body.trim(), config);

  // Twilio SMS has a 1600 char limit — truncate if needed
  const truncated = reply.length > 1550 ? reply.slice(0, 1520) + "\n…(reply 'more' for full details)" : reply;
  return twimlResponse(truncated);
}

/** Wrap a plain text reply in TwiML for Twilio. */
function twimlResponse(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
