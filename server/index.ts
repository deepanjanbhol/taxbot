/**
 * TaxBot Dashboard Server
 * Express 5 + WebSocket bridge on port 7329 ("TAXS")
 * Auto-serves the built React dashboard from ./public
 * Launched automatically when OpenClaw gateway starts (see openclaw.plugin.json)
 */

// Load .env from project root if ANTHROPIC_API_KEY not already set
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.trim().split("=");
    if (k && v.length && !process.env[k]) process.env[k] = v.join("=");
  }
} catch { /* .env optional */ }

import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import cors from "cors";
import path from "path";
import fs from "fs/promises";
import os from "os";
import open from "open";
import { randomUUID } from "crypto";

import { runOrchestrator } from "./orchestrator.js";
import type { TaxBotConfig } from "../dashboard/src/types/pipeline.js";
import { generateForm1040 } from "../src/tools/form-generator.js";
import { findCPAs, formatCPAListForSms } from "../src/tools/cpa-finder.js";
import { sendTaxReport } from "../src/tools/sms-sender.js";
import { sendTelegramReport } from "../src/tools/telegram-sender.js";
import { authorizeGmail } from "../src/tools/gmail-reader.js";

const PORT = 7329;
const CONFIG_PATH  = path.join(os.homedir(), ".openclaw", "taxbot-config.json");
const HISTORY_DIR  = path.join(os.homedir(), ".config", "taxbot", "runs");
const PUBLIC_DIR   = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), "public");
const GMAIL_TOKEN  = path.join(os.homedir(), ".config", "taxbot", "gmail_token.json");

// ── WebSocket clients + human-input promises ──────────────────────────────────

const wsClients = new Set<WebSocket>();
const pendingHumanInputs = new Map<string, (answer: string) => void>();

function waitForInput(runId: string): Promise<string> {
  return new Promise((resolve) => {
    pendingHumanInputs.set(runId, resolve);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadConfig(): Promise<TaxBotConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as TaxBotConfig;
  } catch { return null; }
}

async function saveConfig(config: TaxBotConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function listHistory() {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
    const files = await fs.readdir(HISTORY_DIR);
    const runs = await Promise.all(
      files
        .filter(f => f.endsWith(".json"))
        .map(f => fs.readFile(path.join(HISTORY_DIR, f), "utf-8").then(JSON.parse))
    );
    return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch { return []; }
}

async function saveRun(result: unknown) {
  const run = result as { runId: string };
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(path.join(HISTORY_DIR, `${run.runId}.json`), JSON.stringify(result, null, 2));
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: /^http:\/\/127\.0\.0\.1/, credentials: true }));
app.use(express.json({ limit: "5mb" }));

// Serve React SPA from built output
app.use(express.static(PUBLIC_DIR));

// ── Config routes ─────────────────────────────────────────────────────────────

app.get("/api/config", async (_req, res) => {
  const config = await loadConfig();
  if (!config) return res.status(404).json({ error: "No config found" });
  // Mask auth token in response
  return res.json({ ...config, twilioAuthToken: config.twilioAuthToken ? "••••••••" : "" });
});

app.put("/api/config", async (req, res) => {
  const incoming = req.body as Partial<TaxBotConfig>;
  const existing = (await loadConfig()) ?? {} as TaxBotConfig;
  // Don't overwrite masked auth token
  if (incoming.twilioAuthToken === "••••••••") delete incoming.twilioAuthToken;
  const merged = { ...existing, ...incoming } as TaxBotConfig;
  await saveConfig(merged);
  res.json({ ok: true });
});

app.post("/api/config/test-sms", async (req, res) => {
  const { accountSid, authToken, from, to } = req.body as Record<string, string>;
  try {
    const result = await sendTaxReport(
      { accountSid, authToken, fromNumber: from, toNumber: to },
      "✅ TaxBot test message — your SMS delivery is working!"
    );
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/config/test-telegram", async (req, res) => {
  const { botToken, chatId } = req.body as { botToken?: string; chatId?: string };
  if (!botToken || !chatId) return res.json({ success: false, error: "botToken and chatId required" });
  try {
    const result = await sendTelegramReport(
      { botToken, chatId },
      "✅ TaxBot test message — your Telegram delivery is working!",
    );
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/config/gmail-status", async (_req, res) => {
  try {
    await fs.access(GMAIL_TOKEN);
    res.json({ authorized: true });
  } catch {
    res.json({ authorized: false });
  }
});

app.get("/api/config/gmail-auth-url", async (req, res) => {
  const config = await loadConfig();
  const credPath = (config?.gmailCredentialsPath ?? "~/.config/taxbot/gmail_credentials.json").replace("~", os.homedir());
  try {
    const credsRaw = await fs.readFile(credPath, "utf-8");
    const creds = JSON.parse(credsRaw);
    const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const url = auth.generateAuthUrl({ access_type: "offline", scope: ["https://www.googleapis.com/auth/gmail.readonly"] });
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/config/gmail-callback", async (req, res) => {
  const { code, credentialsPath } = req.body as { code: string; credentialsPath?: string };
  try {
    const msg = await authorizeGmail(code, credentialsPath, GMAIL_TOKEN);
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── Pipeline routes ───────────────────────────────────────────────────────────

app.post("/api/pipeline/run", async (req, res) => {
  const config = ((req.body as { config?: TaxBotConfig }).config) ?? await loadConfig();
  if (!config) return res.status(400).json({ error: "No config found. Complete setup first." });

  const runId = randomUUID();
  res.json({ runId });   // respond immediately; pipeline runs async

  // Fire-and-forget — events delivered via WS
  runOrchestrator(wsClients, config, runId, waitForInput)
    .then(result => saveRun({ runId: result.runId, startedAt: result.startedAt, completedAt: result.completedAt, steps: {} as never }))
    .catch(err => {
      console.error("[orchestrator] FATAL:", err instanceof Error ? err.stack : String(err));
    });
});

app.post("/api/pipeline/step/:step", async (req, res) => {
  const { step } = req.params;
  const { config: bodyConfig, formData, text } = req.body as {
    config?: TaxBotConfig;
    formData?: Parameters<typeof generateForm1040>[0];
    text?: string;
  };
  const config = bodyConfig ?? await loadConfig();
  if (!config) return res.status(400).json({ error: "No config" });

  try {
    if (step === "generate_1040" && formData) {
      const form = generateForm1040(formData);
      wsClients.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(
        JSON.stringify({ type: "step:complete", step: "generate_1040", durationMs: 0, result: { form1040Text: form } })
      ));
      return res.json({ ok: true });
    }

    if (step === "find_cpa") {
      const result = await findCPAs({ location: config.userLocation, returnDetails: "tax return", maxResults: 5 });
      wsClients.forEach(ws => ws.readyState === WebSocket.OPEN && ws.send(
        JSON.stringify({ type: "step:complete", step: "find_cpa", durationMs: 0, result: { cpas: result.cpas, formatted: formatCPAListForSms(result) } })
      ));
      return res.json({ ok: true });
    }

    if (step === "send_sms" && text) {
      const smsResult = await sendTaxReport(
        { accountSid: config.twilioAccountSid, authToken: config.twilioAuthToken, fromNumber: config.twilioFromNumber, toNumber: config.recipientPhone },
        text
      );
      return res.json(smsResult);
    }

    return res.status(400).json({ error: `Unknown step or missing params: ${step}` });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/pipeline/retry/:step", async (req, res) => {
  // Delegate to the same step handler
  req.params["step"] = req.params["step"]!;
  res.redirect(307, `/api/pipeline/step/${req.params["step"]}`);
});

// ── History routes ────────────────────────────────────────────────────────────

app.get("/api/history", async (_req, res) => {
  res.json(await listHistory());
});

app.get("/api/history/:runId", async (req, res) => {
  try {
    const raw = await fs.readFile(path.join(HISTORY_DIR, `${req.params["runId"]}.json`), "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: "Run not found" });
  }
});

app.delete("/api/history/:runId", async (req, res) => {
  try {
    await fs.unlink(path.join(HISTORY_DIR, `${req.params["runId"]}.json`));
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Run not found" });
  }
});

// SPA fallback — serve index.html for any unmatched route
app.get("*path", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ── HTTP + WebSocket server ───────────────────────────────────────────────────

const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: "connected" }));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      if (msg.type === "human:response" && typeof msg.runId === "string" && typeof msg.answer === "string") {
        const resolve = pendingHumanInputs.get(msg.runId);
        if (resolve) {
          pendingHumanInputs.delete(msg.runId);
          resolve(msg.answer);
        }
      }
    } catch { /* ignore malformed */ }
  });

  ws.on("close", () => wsClients.delete(ws));
  ws.on("error", () => wsClients.delete(ws));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🧾 TaxBot Dashboard running at http://127.0.0.1:${PORT}\n`);

  // Auto-open browser on start (only if not already open)
  open(`http://127.0.0.1:${PORT}`).catch(() => {
    console.log(`   Open manually: http://127.0.0.1:${PORT}`);
  });
});

export { app, server, wss };
