# TaxBot — AI-Powered Tax Intelligence

> TaxBot is the first tax intelligence system built on the intersection of **OpenClaw's plugin runtime** and a **purpose-built multi-agent pipeline**. Rather than a single LLM guessing at tax law, TaxBot separates _reasoning_ from _computation_: Claude Sonnet orchestrates the workflow, Claude Haiku extracts numbers from messy PDFs, and a deterministic math engine — driven by a hot-swappable JSON knowledge base — produces the final Form 1040. No AI hallucinates a deduction; the rules are versioned data.

Self-hosted. Your documents never leave your machine. Works from localhost — no public server, no ngrok.

Built on [Claude](https://anthropic.com) and the [Model Context Protocol](https://modelcontextprotocol.io).

---

## How It Works

Claude Sonnet acts as the orchestrator, dynamically calling 5 MCP servers in sequence:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TaxBot Pipeline                                 │
│                                                                     │
│  ask_human ──▶ scan_docs ──▶ extract ──▶ compute_1040 ──▶ send     │
│  (filing         (pdf-       (Haiku     (pure math,      (SMS /    │
│   status +        parse)    tool-use    JSON rules)      Telegram/ │
│   dependents)               loop)                        snapshot) │
└─────────────────────────────────────────────────────────────────────┘
```

**Step 1 — Collect Personal Info**
Two `ask_human` calls collect filing status and dependents (children under 17, other dependents, age 65+) before any documents are scanned. These feed directly into the CTC and deduction calculations.

**Step 2 — Scan Documents**
Recursively scans your tax folder. Extracts text from PDFs with `pdf-parse`. Classifies each file (W-2, 1099-INT, 1099-B, K-1, 1098, etc.) by filename and content keywords.

**Step 3 — AI Field Extraction**
Claude Haiku reads every document and calls `record_tax_field` for each dollar value found. Handles tricky formats: concatenated W-2 boxes, dot-leader 1099-DIV tables, 1099-R rollover codes, K-1 box labels, and more. Runs an agentic tool-use loop (up to 25 iterations).

**Step 4 — Compute Form 1040**
Deterministic math — no AI involved. Applies 2025 IRS brackets, Schedule D ST/LT gain netting ($3K loss cap), NIIT (3.8%), SE tax, QBI deduction, SALT cap (BBB-adjusted), medical expense floor (7.5% AGI), and all credits. Outputs a formatted Form 1040 text document.

**Step 5 — Find CPAs**
Searches for verified tax professionals near your location using Tavily → Brave → DuckDuckGo Lite (fallback, no API key needed).

**Step 6 — Deliver Report**
SMS (Twilio), Telegram Bot (long-poll — no webhook or public server needed), or local file snapshot.

---

## Architecture Highlights

| Design Choice | Detail |
|---|---|
| Multi-agent | Sonnet orchestrates; Haiku extracts (10× cheaper, fast enough for the loop) |
| Deterministic math | All tax rules in `knowledge-base/rules/*.json` — edit JSON to update for a new year |
| Credential security | AES-256-GCM, machine-local key at `~/.config/taxbot/.key` — plaintext never on disk |
| No public server | Telegram uses long-poll (`getUpdates`) — works from 127.0.0.1 |
| OpenClaw plugin | Gateway spawns server automatically; tools surface in any OpenClaw client |

→ Full design doc: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Supported Document Types

| Form | Description | Key Fields |
|------|-------------|------------|
| W-2 | Wages | Box 1 wages, Box 2 withholding, Box 12 (401k, HSA) |
| 1099-NEC | Freelance / self-employment | Box 1 nonemployee comp |
| 1099-INT | Interest income | Box 1 interest |
| 1099-DIV | Dividends | Box 1a ordinary, 1b qualified, 2a LTCG |
| 1099-B | Brokerage sales | Short-term and long-term gains/losses (netted) |
| 1099-MISC | Miscellaneous income | Box 2 royalties, other income |
| 1099-R | Retirement distributions | Box 2a taxable; rollovers skipped |
| 1099-G | Government payments | Box 1 unemployment compensation |
| 1099-K | Payment network receipts | Gross receipts (pre-expense noted) |
| 1099-SA | HSA distributions | Box 1 gross distribution |
| SSA-1099 | Social Security | Box 5 net benefits |
| 1098 | Mortgage interest | Box 1 interest, property tax from escrow |
| 1098-T | Tuition | Box 1 tuition (AOTC/LLC credit estimate) |
| 1098-E | Student loan interest | Box 1 interest paid |
| K-1 | Partnership / S-Corp | Box 1/2/5/6a/9a/14 income and losses |

---

## Prerequisites

- **Node.js 20+**
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com) (required)
- A folder of tax PDFs on your local machine

Optional:
- Twilio account — SMS delivery
- Telegram Bot token — message @BotFather on Telegram (works from localhost via long-poll)
- Google OAuth2 credentials — Gmail inbox scan
- Tavily or Brave Search API key — higher-quality CPA search (DuckDuckGo fallback requires no key)

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/deepanjanbhol/taxbot.git
cd taxbot

# 2. Install
npm install
cd dashboard && npm install && cd ..

# 3. Configure
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY at minimum

# 4. Start (backend :7329 + Vite frontend :7330 with hot reload)
# In VS Code: Run → "TaxBot — Full Stack (Dev)"
# Or manually:
npm run server:dev    # terminal 1  →  API on :7329
npm run dashboard:dev # terminal 2  →  UI  on :7330
```

Open **[http://127.0.0.1:7330](http://127.0.0.1:7330)** and complete the Settings wizard to point TaxBot at your tax documents folder.

> **Ports:** The backend API runs on `:7329` (REST + WebSocket). The Vite dev server on `:7330` proxies all `/api` and `/ws` calls to it. For production, run `npm run build` then open `:7329` directly.

---

## Configuration

Settings can be entered in the dashboard Settings page or via `~/.openclaw/taxbot-config.json`. Sensitive fields (API keys, tokens) are encrypted at rest automatically with AES-256-GCM.

```env
# .env — minimum required
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional: SMS via Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=+12025551234
RECIPIENT_PHONE=+12025559876

# Optional: Telegram Bot (no webhook needed — long-poll works from localhost)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Optional: Gmail scan
GMAIL_CREDENTIALS_PATH=~/.config/taxbot/gmail_credentials.json

# Optional: CPA search (DuckDuckGo fallback requires no key)
TAVILY_API_KEY=
BRAVE_API_KEY=
```

---

## Gmail Setup (optional)

1. [console.cloud.google.com](https://console.cloud.google.com) → Create project → Enable **Gmail API**
2. Create **OAuth 2.0 credentials** (Desktop app) → download `credentials.json`
3. Set `GMAIL_CREDENTIALS_PATH` in `.env`
4. On first run, TaxBot opens a browser for one-time authorization

---

## Project Structure

```
taxbot/
├── mcp/                       MCP servers (one per pipeline step, stdio)
│   ├── scan-documents-server.ts
│   ├── extract-income-server.ts
│   ├── compute-tax-server.ts
│   ├── find-cpa-server.ts
│   └── send-report-server.ts
│
├── server/                    Express API + WebSocket bridge (:7329)
│   ├── index.ts
│   ├── orchestrator.ts        Claude Sonnet agentic loop
│   ├── keychain.ts            AES-256-GCM credential encryption
│   ├── telegram-poller.ts     Long-poll Telegram (no webhook needed)
│   └── tax-export.ts          CSV / JSON export of completed runs
│
├── src/
│   ├── tools/
│   │   ├── ai-extractor.ts    Claude Haiku extraction loop
│   │   ├── form-generator.ts  Form 1040 text renderer
│   │   ├── cpa-finder.ts      Web search → structured CPA cards
│   │   ├── sms-sender.ts      Twilio chunked delivery
│   │   ├── telegram-sender.ts Telegram Bot API
│   │   └── gmail-reader.ts    Gmail OAuth2 scan
│   └── utils/
│       ├── tax-calculator.ts  Pure math — no AI (brackets, NIIT, SE tax, QBI)
│       └── tax-rules-loader.ts Loads JSON knowledge base at startup
│
├── knowledge-base/rules/      Tax rules as versioned JSON (edit to update)
│   ├── tax-year-2025.json
│   ├── big-beautiful-bill.json
│   └── irs-limits-2025.json
│
├── dashboard/                 React 18 + Vite + Tailwind CSS (:7330)
│
└── ARCHITECTURE.md            Full design doc
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI orchestration | Claude Sonnet 4.6 + MCP (`@modelcontextprotocol/sdk`) |
| AI extraction | Claude Haiku 4.5 (agentic tool-use loop) |
| Backend | Node.js 20, Express 5, WebSocket (`ws`), tsx |
| Frontend | React 18, Vite, Tailwind CSS v4, Zustand |
| PDF parsing | `pdf-parse` |
| Crypto | Node.js built-in `crypto` (AES-256-GCM) |
| Messaging | Twilio SMS, Telegram Bot API |
| Email | Google APIs (Gmail) |
| CPA search | Tavily / Brave / DuckDuckGo Lite |

---

## Disclaimer

TaxBot produces **estimates for review purposes only**. It is not a substitute for professional tax advice and does not file returns with the IRS. Always review with a licensed CPA or EA before filing.

---

## License

MIT
