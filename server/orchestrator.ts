/**
 * orchestrator.ts
 *
 * Claude sonnet acts as the top-level director for the tax filing pipeline.
 * It connects to each MCP server as a client, gathers their tools, and
 * decides dynamically which tools to call and in what order.
 *
 * Architecture:
 *   Orchestrator (Claude sonnet-4-6)
 *     ├── scan-documents MCP server    (file crawling + PDF extraction)
 *     ├── extract-income MCP server    (Claude haiku sub-agent)
 *     ├── compute-tax MCP server       (deterministic 1040 math)
 *     ├── find-cpa MCP server          (web search)
 *     └── send-report MCP server       (Twilio SMS or snapshot)
 *
 * The orchestrator emits WebSocket step events so the existing dashboard
 * stays in sync without any changes.
 */

import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import { fileURLToPath } from "url";
import type { TaxBotConfig } from "../dashboard/src/types/pipeline.js";
import type { TaxInputData } from "../src/tools/form-generator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_DIR   = path.join(__dirname, "..", "mcp");
// tsx lives in server/node_modules (the server has its own package.json)
const TSX       = path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");
const NODE      = process.execPath;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OrchestratorRunResult {
  runId:        string;
  startedAt:    string;
  completedAt:  string;
  form1040Text?: string;
  refundOrOwed?: number;
  extractedData?: unknown;
  cpaList?:      unknown[];
  bbbProvisions?: Record<string, number>;
}

/** Human-readable label for each MCP tool */
const TOOL_LABELS: Record<string, string> = {
  scan_tax_documents:     "Scan Documents",
  extract_income_fields:  "Extract Income Fields",
  compute_form_1040:      "Compute Form 1040",
  find_tax_professionals: "Find CPAs",
  send_tax_report:        "Send SMS Report",
  save_report_snapshot:   "Save Report Snapshot",
};

/** ask_human — handled locally (not routed to MCP) */
const ASK_HUMAN_TOOL: Anthropic.Tool = {
  name: "ask_human",
  description: "Pause the pipeline and ask the user a clarifying question. " +
    "Use it TWICE at the start (filing status, then personal details). " +
    "Use it ONCE more after scanning only if a critical document type is clearly missing. " +
    "Do NOT use it more than three times per run.",
  input_schema: {
    type: "object" as const,
    properties: {
      question:   { type: "string",                    description: "The question to display to the user" },
      step_label: { type: "string",                    description: "Short label for this step, e.g. 'Filing Status'" },
      options:    { type: "array", items: { type: "string" }, description: "If the user should pick from a fixed list, provide the choices here" },
    },
    required: ["question", "step_label"],
  },
};

// ── WebSocket helpers ──────────────────────────────────────────────────────────

function emit(clients: Set<WebSocket>, event: Record<string, unknown>) {
  const msg = JSON.stringify(event);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ── MCP client factory ────────────────────────────────────────────────────────

interface MCPClientHandle {
  name:   string;
  client: Client;
  tools:  Anthropic.Tool[];
}

async function spawnMCPClient(serverFile: string, name: string): Promise<MCPClientHandle> {
  const transport = new StdioClientTransport({
    command: NODE,
    args:    [TSX, path.join(MCP_DIR, serverFile)],
    env:     { ...process.env } as Record<string, string>,
  });

  const client = new Client({ name: `orchestrator→${name}`, version: "1.0.0" });
  await client.connect(transport);

  const { tools: rawTools } = await client.listTools();

  // Convert MCP tool definitions to Anthropic tool format
  const tools: Anthropic.Tool[] = rawTools.map((t) => ({
    name:        t.name,
    description: t.description ?? "",
    input_schema: (t.inputSchema ?? { type: "object", properties: {} }) as Anthropic.Tool["input_schema"],
  }));

  return { name, client, tools };
}

// ── SMS text builder ──────────────────────────────────────────────────────────

function buildSmsText(form1040Text: string, cpas: unknown[]): string {
  const lines: string[] = [];
  const refundMatch = form1040Text.match(/(REFUND|AMOUNT YOU OWE)[:\s]+(\$[\d,]+)/i);
  const agiMatch    = form1040Text.match(/AGI:\s+(\$[\d,]+)/i);
  const effMatch    = form1040Text.match(/Effective Tax Rate:\s+([\d.]+%)/i);
  const taxMatch    = form1040Text.match(/TOTAL TAX AFTER CREDITS\s+(\$[\d,]+)/i);

  lines.push("📊 TAXBOT 2025 TAX ESTIMATE");
  if (refundMatch) lines.push(`${refundMatch[1].toUpperCase()}: ${refundMatch[2]}`);
  if (agiMatch)    lines.push(`AGI: ${agiMatch[1]}`);
  if (taxMatch)    lines.push(`Total Tax: ${taxMatch[1]}`);
  if (effMatch)    lines.push(`Effective rate: ${effMatch[1]}`);
  lines.push("⚠ Estimate only — review with CPA before filing");

  const cpaList = cpas as Array<{
    name: string; type: string; rating?: number;
    estimatedPrice?: string; phone?: string; specialties: string[];
  }>;

  if (cpaList.length > 0) {
    lines.push("", "─".repeat(28), "", "👔 TAX PROFESSIONALS");
    cpaList.slice(0, 3).forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name} (${c.type})`);
      if (c.rating)         lines.push(`   ⭐ ${c.rating}`);
      if (c.estimatedPrice) lines.push(`   💰 ${c.estimatedPrice}`);
      if (c.phone)          lines.push(`   📞 ${c.phone}`);
    });
    lines.push("Verify: irs.treasury.gov/rpo/rpo.jsf");
  }

  return lines.join("\n");
}

// ── Orchestrator system prompt ────────────────────────────────────────────────

function buildSystemPrompt(config: TaxBotConfig): string {
  const hasTwilio   = !!(config.twilioAccountSid && config.twilioAuthToken &&
                         config.twilioFromNumber && config.recipientPhone);
  const hasTelegram = !!(config.telegramBotToken && config.telegramChatId);
  const hasLocation = !!(config.userLocation?.trim());
  const deliveryTool = hasTwilio ? "send_tax_report"
    : hasTelegram                ? "send_telegram_report"
    : "save_report_snapshot";

  return `You are TaxBot, an AI tax filing assistant for tax year ${config.taxYear || 2025}.

Your job is to orchestrate a complete US federal tax analysis by calling the available tools in order.

WORKFLOW:
1. ask_human — Ask for filing status only.
   - step_label: "Filing Status"
   - question: "What is your filing status for ${config.taxYear || 2025}?"
   - options: ["Single", "Married Filing Jointly (MFJ)", "Married Filing Separately (MFS)", "Head of Household (HOH)"]

2. ask_human — Ask for personal details needed for accurate tax computation.
   - step_label: "Personal Details"
   - question: "Please answer the following:\\n1. How many qualifying children under age 17 do you have? (This determines your Child Tax Credit — $2,500/child under the Big Beautiful Bill)\\n2. How many other dependents (any age)? Enter 0 if none.\\n3. Are you (or your spouse if MFJ) age 65 or older? (yes/no)\\n4. If filing Married Filing Jointly, what is your spouse's name?"
   - (no options — user types a free-form answer)

3. scan_tax_documents — Scan the folder for all tax documents.

4. ask_human (OPTIONAL) — ONLY if an obviously critical document type is clearly absent after scanning
   (e.g. no W-2 found for a wage earner). Skip entirely if documents look complete.
   - step_label: "Missing Documents?"

5. extract_income_fields — Extract all dollar values from the scanned documents.

6. compute_form_1040 — Compute the full 1040.
   CRITICAL: Before calling this tool, UPDATE the tax_input object from extract_income_fields with ALL
   personal info from the ask_human answers:
   - filingStatus: short code from answer 1 (single | mfj | mfs | hoh)
   - dependentsUnder17: integer from answer 2 question 1 (e.g. 2)
   - otherDependents: integer from answer 2 question 2
   - age65OrOlder: boolean from answer 2 question 3
   - spouseName: from answer 2 question 4 (if MFJ)
   Do NOT leave dependentsUnder17 as 0 if the user said they have children.

7. find_tax_professionals — Find CPAs near the user.

8. ${deliveryTool} — Deliver the report.

USER CONFIGURATION:
- Tax documents folder: ${config.taxDocumentsFolder || "(not set)"}
- Tax year: ${config.taxYear || 2025}
- Location: ${hasLocation ? config.userLocation : "(not set — use 'United States' for CPA search)"}
- Report delivery: ${hasTwilio ? "Twilio SMS configured" : hasTelegram ? "Telegram configured" : "not configured — use save_report_snapshot"}
- Telegram bot token: ${hasTelegram ? config.telegramBotToken : "not set"}
- Telegram chat ID: ${hasTelegram ? config.telegramChatId : "not set"}

RULES:
- Complete all steps even if one has partial results
- ALWAYS update dependentsUnder17 and other personal fields in tax_input before calling compute_form_1040
- For find_tax_professionals, use location="${hasLocation ? config.userLocation : "United States"}"
- For send/save report, build a compact SMS from the form1040Text and CPA list
- If a step errors, continue to the next step with what you have
- Be concise — do not add commentary between tool calls`;
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function runOrchestrator(
  clients: Set<WebSocket>,
  config: TaxBotConfig,
  runId: string,
  waitForInput: (runId: string) => Promise<string>,
  _overrideFormData?: TaxInputData
): Promise<OrchestratorRunResult> {

  const startedAt = new Date().toISOString();
  const apiKey    = config.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY || "";

  if (!apiKey) {
    emit(clients, {
      type: "step:error", stepId: "scan_tax_documents", runId,
      error: "ANTHROPIC_API_KEY not set. Add it in Setup or set the environment variable.",
      retryable: false,
    });
    emit(clients, { type: "pipeline:done", runId, totalMs: 0 });
    return { runId, startedAt, completedAt: new Date().toISOString() };
  }

  // ── Spawn all MCP servers ────────────────────────────────────────────────────
  emit(clients, { type: "step:progress", stepId: "scan_tax_documents", message: "Starting MCP servers…" });

  let mcpClients: MCPClientHandle[] = [];
  try {
    mcpClients = await Promise.all([
      spawnMCPClient("scan-documents-server.ts",  "scan-documents"),
      spawnMCPClient("extract-income-server.ts",  "extract-income"),
      spawnMCPClient("compute-tax-server.ts",     "compute-tax"),
      spawnMCPClient("find-cpa-server.ts",        "find-cpa"),
      spawnMCPClient("send-report-server.ts",     "send-report"),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(clients, { type: "step:error", stepId: "scan_tax_documents", stepLabel: "Scan Documents", runId, error: `Failed to start MCP servers: ${msg}`, retryable: true });
    emit(clients, { type: "pipeline:done", runId, totalMs: 0 });
    return { runId, startedAt, completedAt: new Date().toISOString() };
  }

  // Flatten all tools for Claude — include local ask_human tool
  const allTools = [ASK_HUMAN_TOOL, ...mcpClients.flatMap((h) => h.tools)];
  const toolClientMap = new Map<string, Client>(
    mcpClients.flatMap((h) => h.tools.map((t) => [t.name, h.client]))
  );

  // ── Run orchestrator agentic loop ────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Run the complete tax analysis pipeline. Tax documents folder: "${config.taxDocumentsFolder}". Start now.`,
    },
  ];

  // Track step start times for duration calculation
  const stepStartTime = new Map<string, number>();

  // Collect data across steps for building the final SMS and history
  let form1040Text  = "";
  let cpaList:       unknown[] = [];
  let extractedData: unknown   = null;
  let refundOrOwed:  number | undefined;
  let bbbProvisions: Record<string, number> | undefined;

  for (let iteration = 0; iteration < 25; iteration++) {
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 8096,
      system:     buildSystemPrompt(config),
      tools:      allTools,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUseBlocks) {
      const input = tu.input as Record<string, unknown>;

      // ── ask_human: handled locally — no MCP server involved ──────────────────
      if (tu.name === "ask_human") {
        const question  = input.question  as string;
        const stepLabel = input.step_label as string ?? "Input Required";
        const options   = input.options   as string[] | undefined;
        const askStepId = `ask_human_${tu.id}`;

        emit(clients, { type: "step:start",    stepId: askStepId, stepLabel, runId });
        emit(clients, { type: "pipeline:waiting", runId, stepId: askStepId, stepLabel, question, options });

        let answer: string;
        try {
          answer = await waitForInput(runId);
        } catch {
          answer = "(no response)";
        }

        const durationMs = Date.now() - (stepStartTime.get(askStepId) ?? Date.now());
        emit(clients, {
          type: "step:complete", stepId: askStepId, stepLabel, runId, durationMs,
          result: { question, answer },
        });

        toolResults.push({
          type: "tool_result", tool_use_id: tu.id,
          content: answer,
          is_error: false,
        });
        continue;
      }

      // ── MCP tools ─────────────────────────────────────────────────────────────
      const stepId    = tu.name;
      const stepLabel = TOOL_LABELS[tu.name] ?? tu.name;

      if (!stepStartTime.has(stepId)) {
        stepStartTime.set(stepId, Date.now());
        emit(clients, { type: "step:start", stepId, stepLabel, runId });
      }

      emit(clients, {
        type: "step:progress", stepId, runId,
        message: toolProgressMsg(tu.name, input),
      });

      const mcpClient = toolClientMap.get(tu.name);
      let resultText = "";
      let isError = false;

      if (!mcpClient) {
        resultText = JSON.stringify({ error: `No MCP server for tool: ${tu.name}` });
        isError = true;
      } else {
        try {
          console.log(`[orchestrator] → ${tu.name}`, JSON.stringify(input).slice(0, 200));
          const mcpResult = await mcpClient.callTool({ name: tu.name, arguments: input });
          const firstContent = mcpResult.content[0];
          resultText = firstContent && "text" in firstContent ? firstContent.text : JSON.stringify(mcpResult.content);
          isError    = mcpResult.isError === true;
          if (isError) {
            console.error(`[orchestrator] ✗ ${tu.name} returned isError=true:`, resultText.slice(0, 500));
          } else {
            console.log(`[orchestrator] ✓ ${tu.name} (${resultText.length} bytes)`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[orchestrator] ✗ ${tu.name} threw:`, msg);
          resultText = JSON.stringify({ error: msg });
          isError    = true;
        }
      }

      let parsedResult: Record<string, unknown> = {};
      try { parsedResult = JSON.parse(resultText); } catch { /* leave empty */ }

      // Stash data for SMS building and history persistence
      if (tu.name === "extract_income_fields" && parsedResult.taxInput) {
        extractedData = parsedResult.taxInput;
      }
      if (tu.name === "compute_form_1040") {
        if (parsedResult.form1040Text) form1040Text = parsedResult.form1040Text as string;
        const metrics = parsedResult.metrics as Record<string, unknown> | undefined;
        if (metrics?.refundOrOwed !== undefined) refundOrOwed = metrics.refundOrOwed as number;
        if (Array.isArray(parsedResult.bbbProvisions)) {
          // Convert array of provision strings to a keyed object for export
          bbbProvisions = {};
        } else if (parsedResult.bbbProvisions && typeof parsedResult.bbbProvisions === "object") {
          bbbProvisions = parsedResult.bbbProvisions as Record<string, number>;
        }
      }
      if (tu.name === "find_tax_professionals" && Array.isArray(parsedResult.cpas)) {
        cpaList = parsedResult.cpas;
      }

      // Auto-build SMS text if orchestrator passes incomplete content
      if ((tu.name === "send_tax_report" || tu.name === "save_report_snapshot") && form1040Text) {
        if (!input.sms_text || (input.sms_text as string).length < 20) {
          const smsText = buildSmsText(form1040Text, cpaList);
          if (tu.name === "send_tax_report") input.sms_text = smsText;
          else input.content = smsText;
          try {
            const retry = await mcpClient!.callTool({ name: tu.name, arguments: input });
            const fc = retry.content[0];
            resultText = fc && "text" in fc ? fc.text : resultText;
            try { parsedResult = JSON.parse(resultText); } catch { /* keep previous */ }
          } catch { /* use original */ }
        }
      }

      const durationMs = Date.now() - (stepStartTime.get(stepId) ?? Date.now());

      if (!isError) {
        emit(clients, { type: "step:complete", stepId, stepLabel, runId, durationMs, result: parsedResult });
      } else {
        const errorMsg = (parsedResult.error as string) ?? resultText.slice(0, 300) ?? "Unknown error";
        console.error(`[orchestrator] step:error ${stepId}:`, errorMsg);
        emit(clients, {
          type: "step:error", stepId, runId,
          error: errorMsg,
          retryable: true,
        });
      }

      toolResults.push({
        type:        "tool_result",
        tool_use_id: tu.id,
        content:     resultText,
        is_error:    isError,
      });
    }

    if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user",      content: toolResults });
  }

  // Shut down MCP servers cleanly
  await Promise.allSettled(mcpClients.map((h) => h.client.close()));

  const totalMs = Date.now() - new Date(startedAt).getTime();
  emit(clients, { type: "pipeline:done", runId, totalMs });

  return {
    runId, startedAt, completedAt: new Date().toISOString(),
    form1040Text:  form1040Text  || undefined,
    refundOrOwed,
    extractedData: extractedData ?? undefined,
    cpaList:       cpaList.length > 0 ? cpaList : undefined,
    bbbProvisions,
  };
}

// ── Progress message helper ───────────────────────────────────────────────────

function toolProgressMsg(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "scan_tax_documents":
      return `Scanning ${input.folder_path ?? "folder"} for tax documents…`;
    case "extract_income_fields":
      return `AI extracting fields from ${(input.documents as unknown[])?.length ?? "?"} documents…`;
    case "compute_form_1040":
      return "Computing Form 1040 with 2025 tax brackets…";
    case "find_tax_professionals":
      return `Searching for CPAs near ${input.location ?? "your location"}…`;
    case "send_tax_report":
      return `Sending SMS to ${input.to_number ?? "recipient"}…`;
    case "save_report_snapshot":
      return "Twilio not configured — saving report snapshot to disk…";
    default:
      return `Running ${toolName}…`;
  }
}
