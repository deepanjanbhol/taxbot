# TaxBot — AI-Powered Tax Intelligence

TaxBot is an open-source, self-hosted AI assistant that reads your tax documents, estimates your Form 1040, finds local CPAs, and delivers the report to your phone. Your documents never leave your machine.

Built on [Claude](https://anthropic.com) (Anthropic) and the [Model Context Protocol](https://modelcontextprotocol.io).

---

## How It Works

TaxBot runs a 5-step agentic pipeline orchestrated by Claude Sonnet:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TaxBot Pipeline                              │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │  Scan    │───▶│ Extract  │───▶│ Compute  │───▶│ Find CPA │      │
│  │  Docs    │    │  Fields  │    │ Form1040 │    │  (web)   │      │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘      │
│       │               │               │               │             │
│  pdf-parse +     Claude Haiku     tax-calculator   DDG / Tavily /   │
│  type detect    (tool-use loop)   (2025 brackets)  Brave Search     │
│                                                         │            │
│                                               ┌──────────────────┐  │
│                                               │  Send Report     │  │
│                                               │  SMS / Telegram  │  │
│                                               │  / saved file    │  │
│                                               └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

**Step 1 — Scan Documents**
Recursively scans your tax folder. Extracts text from PDFs with `pdf-parse`. Classifies each file (W-2, 1099-INT, 1099-B, K-1, 1098, etc.) by filename and content keywords. Flags image-based PDFs that need OCR.

**Step 2 — AI Field Extraction**
Claude Haiku reads every document and calls the `record_tax_field` tool for each dollar value found. It handles tricky PDF formats: concatenated W-2 boxes, dot-leader 1099-DIV tables, Chase 1099-INT summaries, 1099-R rollover codes, K-1 box labels, and more. Runs an agentic tool-use loop (up to 25 iterations) until all fields are extracted.

**Step 3 — Compute Form 1040**
Deterministic 2025 tax calculation using official IRS brackets. Handles: SE tax (Schedule SE), LTCG and qualified dividends (preferential rates), NIIT (3.8%), QBI deduction (20% default), Social Security provisional income test, medical expense floor (7.5% AGI), SALT cap, itemized vs standard deduction comparison. Outputs a formatted Form 1040 text document.

**Step 4 — Find CPAs**
Searches for verified tax professionals near your location using Tavily → Brave → DuckDuckGo Lite (fallback, no API key needed). Claude synthesises raw results into structured CPA cards with name, type, rating, price range, and specialties.

**Step 5 — Deliver Report**
Sends your Form 1040 estimate via SMS (Twilio) or Telegram Bot. Long reports are chunked for SMS or sent as a `.txt` attachment on Telegram. Falls back to saving a local file if no delivery credentials are configured.

---

## Supported Document Types

| Form | Description | Fields Extracted |
|------|-------------|-----------------|
| W-2 | Wages | Box 1 wages, Box 2 withholding |
| 1099-NEC | Freelance / self-employment | Box 1 nonemployee comp |
| 1099-INT | Interest income | Box 1 interest |
| 1099-DIV | Dividends | Box 1a ordinary, 1b qualified, 2a LTCG |
| 1099-B | Brokerage sales | Short-term and long-term gains/losses |
| 1099-MISC | Miscellaneous income | Box 2 royalties, other income |
| 1099-R | Retirement distributions | Box 2a taxable amount (skips rollovers) |
| 1099-G | Government payments | Box 1 unemployment compensation |
| 1099-K | Payment network receipts | Gross receipts (noted as pre-expense) |
| SSA-1099 | Social Security | Box 5 net benefits |
| 1098 | Mortgage interest | Box 1 interest paid |
| 1098-T | Tuition | Box 1 tuition paid (education credit estimate) |
| 1098-E | Student loan interest | Box 1 interest paid |
| K-1 | Partnership / S-Corp | Box 1/2/5/6a/9a/14 income and losses |

---

## Two Modes

### Dashboard Mode (recommended)

A local web dashboard with a visual pipeline, Form 1040 viewer, document intelligence page, CPA finder with map, and settings wizard.

```bash
npm run dashboard:dev
```

Opens at `http://localhost:7329`

### OpenClaw Plugin Mode

Conversational interface via the OpenClaw AI gateway. Talk to TaxBot directly in chat: "Scan my documents", "Show me my 1040", "Find CPAs in Seattle".

The `openclaw.plugin.json` manifest is included. Install via the OpenClaw gateway settings.

---

## Prerequisites

- **Node.js 20+**
- **Anthropic API key** — [console.anthropic.com](https://console.anthropic.com) (required)
- A folder of tax PDFs on your local machine

Optional:
- Twilio account — SMS delivery ([twilio.com](https://twilio.com))
- Telegram Bot token — Telegram delivery (message @BotFather on Telegram)
- Google OAuth2 credentials — Gmail inbox scan ([Google Cloud Console](https://console.cloud.google.com))
- Tavily or Brave Search API key — higher-quality CPA search results (free tier available)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-username/taxbot.git
cd taxbot

# 2. Install dependencies
npm install
cd dashboard && npm install && cd ..

# 3. Configure
cp .env.example .env
# Edit .env — set your ANTHROPIC_API_KEY at minimum

# 4. Start in development mode (server + dashboard with hot reload)
npm run dashboard:dev
```

Open [http://localhost:7329](http://localhost:7329) and go through the Settings wizard to point TaxBot at your tax documents folder.

---

## Configuration

All settings can be configured in the dashboard Settings page or by editing `~/.openclaw/taxbot-config.json` directly.

```env
# .env — minimum required
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional: SMS via Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=+12025551234
RECIPIENT_PHONE=+12025559876

# Optional: Telegram Bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Optional: Gmail scan
GMAIL_CREDENTIALS_PATH=~/.config/taxbot/gmail_credentials.json

# Optional: CPA search (falls back to DuckDuckGo Lite — no signup required)
TAVILY_API_KEY=
BRAVE_API_KEY=
```

See [`.env.example`](.env.example) for the full annotated reference.

---

## Gmail Setup (optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → Create a project
2. Enable the **Gmail API**
3. Create **OAuth 2.0 credentials** (Desktop app type) → download `credentials.json`
4. Set `GMAIL_CREDENTIALS_PATH` in `.env` to the path of that file
5. On first run, TaxBot opens a browser for authorization. The token is saved to `~/.config/taxbot/gmail_token.json`

---

## Project Structure

```
taxbot/
├── index.ts                   # OpenClaw plugin entry (6 tools)
├── openclaw.plugin.json       # Plugin manifest for OpenClaw gateway
│
├── src/
│   ├── tools/
│   │   ├── file-crawler.ts    # PDF scan + document type detection
│   │   ├── ai-extractor.ts    # Claude Haiku agentic field extraction
│   │   ├── form-generator.ts  # Form 1040 renderer + SMS summary
│   │   ├── cpa-finder.ts      # Web search → structured CPA cards
│   │   ├── sms-sender.ts      # Twilio SMS chunked delivery
│   │   ├── telegram-sender.ts # Telegram Bot API delivery
│   │   └── gmail-reader.ts    # Gmail OAuth2 tax email scan
│   └── utils/
│       └── tax-calculator.ts  # 2025 IRS brackets, SE tax, NIIT, QBI
│
├── mcp/                       # MCP servers — one per pipeline step
│   ├── scan-documents-server.ts
│   ├── extract-income-server.ts
│   ├── compute-tax-server.ts
│   ├── find-cpa-server.ts
│   └── send-report-server.ts
│
├── server/
│   ├── index.ts               # Express + WebSocket server (port 7329)
│   └── orchestrator.ts        # Claude Sonnet directs the 5 MCP servers
│
└── dashboard/                 # React 18 + Vite + Tailwind CSS
    └── src/
        ├── components/        # Landing page, dashboard, Form 1040, CPAs, settings
        ├── store/             # Zustand pipeline state
        ├── hooks/             # WebSocket live event bridge
        └── types/             # Shared TypeScript types
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Orchestration | Claude Sonnet 4.6 via Anthropic SDK |
| Document Extraction | Claude Haiku 4.5 (agentic tool-use loop) |
| MCP Protocol | @modelcontextprotocol/sdk 1.28 |
| Backend | Node.js 20, Express 5, WebSocket |
| Frontend | React 18, Vite, Tailwind CSS, Zustand |
| PDF Parsing | pdf-parse |
| SMS | Twilio SDK |
| Email | Google APIs (Gmail) |
| CPA Search | Tavily / Brave / DuckDuckGo Lite |

---

## Disclaimer

TaxBot produces **estimates for review purposes only**. It is not a substitute for professional tax advice and does not file returns with the IRS. Always review the output with a licensed CPA or EA before filing. IRS Publication 17 and the official Form 1040 instructions are the authoritative source.

---

## License

MIT
