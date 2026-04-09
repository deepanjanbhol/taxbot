# TaxBot Architecture

> **TaxBot is the first tax intelligence system built on the intersection of OpenClaw's plugin runtime and a purpose-built multi-agent pipeline.** Rather than a single LLM guessing at tax law, TaxBot separates _reasoning_ from _computation_: Claude Sonnet orchestrates the workflow while Claude Haiku extracts raw numbers from messy PDFs, and a deterministic math engine — driven entirely by a hot-swappable JSON knowledge base — produces the final Form 1040. No prompt engineering changes a tax bracket; you edit a JSON file. No AI hallucinates a deduction; the rules are versioned data.

---

## System Map

```
User (Browser / Telegram / SMS)
        │
        ▼
┌─────────────────────────────────┐
│  React Dashboard  :7330 (Vite)  │  WebSocket live step updates
│  Express API      :7329         │  REST + WebSocket bridge
└───────────┬─────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────┐
│  Orchestrator  (Claude Sonnet 4.6)                  │
│                                                     │
│  Manages the pipeline via MCP tool calls:           │
│  1. ask_human        — filing status + dependents   │
│  2. scan_documents   → MCP server                   │
│  3. extract_income   → MCP server (Haiku sub-agent) │
│  4. compute_1040     → MCP server (pure math)       │
│  5. find_cpa         → MCP server (web search)      │
│  6. send_report      → MCP server (SMS / Telegram)  │
└──────┬──────────┬──────────┬──────────┬─────────────┘
       │          │          │          │
  MCP stdio  MCP stdio  MCP stdio  MCP stdio
       │          │          │          │
  scan-docs  extract-   compute-   find-cpa /
  server     income     tax        send-report
             server     server     servers
                │          │
           Claude Haiku  JSON rules
           (extractor)   knowledge-base/
```

---

## Key Design Decisions

### 1 · Multi-Agent Split: Sonnet + Haiku

| Agent | Model | Role |
|---|---|---|
| Orchestrator | Claude Sonnet 4.6 | Workflow director — decides what to do next, handles user Q&A, assembles final output |
| Extractor | Claude Haiku 4.5 | Reads raw PDF text, calls `record_tax_field` for every dollar value found |

Haiku is ~10× cheaper and fast enough for the extraction loop (up to 25 tool-call iterations). Sonnet handles judgment calls.

### 2 · Deterministic Tax Math (No AI Guessing)

All tax rules live in `knowledge-base/rules/` as JSON — never hardcoded in TypeScript:

```
knowledge-base/rules/
  tax-year-2025.json        ← brackets, standard deductions, LTCG, SE tax, NIIT
  big-beautiful-bill.json   ← BBB provisions (tip exclusion, CTC $2,500, SALT cap, etc.)
  irs-limits-2025.json      ← IRA/HSA/EITC contribution limits
```

To update for a new tax year: edit JSON, restart. No code changes.

`computeFullTax()` applies correct Schedule D netting (ST/LT gains, $3K loss cap), NIIT at 3.8%, SE tax, QBI deduction, and all credits. The refund/owed figure is pure arithmetic.

### 3 · OpenClaw Plugin Runtime

TaxBot is packaged as an OpenClaw plugin. The gateway spawns the Express server automatically; tools are declared in `openclaw.plugin.json` and surface inside any OpenClaw-compatible client. This means TaxBot works as:
- A standalone web dashboard
- A Telegram bot (long-poll — no public server required)
- An SMS bot via Twilio
- A tool callable from any OpenClaw agent session

### 4 · Credential Security

Sensitive config fields (`anthropicApiKey`, `twilioAuthToken`, `telegramBotToken`) are encrypted at rest with AES-256-GCM using a machine-local key at `~/.config/taxbot/.key`. Stored as `enc:v1:<iv>:<tag>:<ciphertext>`. Plaintext never written to disk.

### 5 · No Public Server Needed

Telegram operates via long-poll (`getUpdates`, 25 s timeout) — no webhook, no ngrok, no port forwarding. Works from localhost day one.

---

## Data Flow: Single Pipeline Run

```
User answers filing status + dependents
        ↓
PDFs scanned → text extracted (pdf-parse)
        ↓
Claude Haiku reads all docs, calls record_tax_field ~30–60 times
        ↓
TaxInputData assembled (wages, dividends, LTCG, STCG, mortgage interest, etc.)
        ↓
Orchestrator merges personal info (dependents, filing status) into TaxInputData
        ↓
computeFullTax() → refund/owed, effective rate, capital loss carryforward
        ↓
Form 1040 text generated
        ↓
CPA search + report delivered (SMS / Telegram / snapshot)
        ↓
Run saved to ~/.config/taxbot/runs/<runId>.json  (exportable as CSV/JSON)
```

---

## File Layout

```
/
├── mcp/                     MCP servers (each is a standalone stdio process)
│   ├── compute-tax-server.ts
│   ├── extract-income-server.ts
│   ├── scan-documents-server.ts
│   ├── find-cpa-server.ts
│   └── send-report-server.ts
├── server/                  Express API + WebSocket bridge
│   ├── index.ts
│   ├── orchestrator.ts      Claude Sonnet agentic loop
│   ├── keychain.ts          AES-256-GCM credential encryption
│   ├── telegram-poller.ts   Long-poll Telegram (no webhook)
│   └── tax-export.ts        CSV/JSON export
├── src/
│   ├── tools/               Shared tool implementations
│   │   ├── ai-extractor.ts  Claude Haiku extraction loop
│   │   └── form-generator.ts Form 1040 text renderer
│   └── utils/
│       ├── tax-calculator.ts Pure math (no AI)
│       └── tax-rules-loader.ts Loads JSON knowledge base
├── dashboard/               React + Vite + Tailwind UI (:7330)
└── knowledge-base/rules/    Tax rules as versioned JSON
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| AI orchestration | Anthropic Claude SDK + MCP (`@modelcontextprotocol/sdk`) |
| Backend | Node.js, Express 5, tsx (TypeScript runtime) |
| Frontend | React 18, Vite, Tailwind CSS v4, Zustand |
| Real-time | WebSockets (`ws`) |
| PDF extraction | `pdf-parse` |
| Crypto | Node.js built-in `crypto` (AES-256-GCM) |
| Messaging | Twilio SMS, Telegram Bot API |
