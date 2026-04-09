# Product Requirements Document
## TaxBot — End-to-End Tax Filing Dashboard

**Document version:** 1.0  
**Date:** 2026-03-31  
**Status:** Draft — For Engineering Review  
**Owner:** Product  

---

## 1. Executive Summary

TaxBot's backend plugin is complete and installable. Today, triggering it requires OpenClaw
chat commands and monitoring requires reading raw terminal output. This PRD defines a
**professional web dashboard** that lets a user:

1. Configure their tax sources (local folder, Gmail)
2. Trigger the full pipeline with one click
3. Watch each stage complete in real time
4. Review the generated Form 1040 estimate inline
5. Browse and contact shortlisted CPAs
6. Confirm and send the SMS report

The dashboard is a **single-page React app** served by a lightweight local Express server
that bridges the browser to the OpenClaw plugin tools via a thin REST + WebSocket layer.

---

## 2. Problem Statement

| Pain Point | Current State | Target State |
|------------|--------------|--------------|
| Triggering the workflow | Type OpenClaw commands manually | One-click "Run Tax Filing" button |
| Monitoring progress | Raw terminal logs, no visibility | Live step-by-step progress bar with status |
| Reviewing the 1040 | Plain text dump in chat | Formatted, printable Form 1040 viewer |
| CPA shortlist | Text block in SMS | Interactive card grid with click-to-call/email |
| SMS confirmation | Blind fire — no preview | Preview message before sending; delivery receipt |
| Error recovery | Re-type commands | Per-step retry buttons with error details |
| Configuration | Edit `.env` files manually | Guided setup wizard with validation |

---

## 3. User Personas

### Primary: Self-filer who wants a CPA safety net
- Has W-2 + maybe some 1099s or investments
- Not a tax expert; wants to understand their numbers before handing off to a CPA
- Wants to find a reasonably priced CPA, not spend hours Googling
- Comfort level: non-technical; expects a consumer app experience

### Secondary: CPA-adjacent power user
- Has complex return (Schedule C, rental, crypto)
- Wants to pre-fill as much as possible before the CPA appointment
- Will edit extracted numbers manually before generating the form
- Comfort level: proficient; expects data density and editability

---

## 4. Goals & Non-Goals

### Goals
- G1: Full pipeline executable from browser with zero CLI interaction
- G2: Real-time step progress visible within 1 second of each event
- G3: Every extracted number is editable before form generation
- G4: CPA cards are actionable (click-to-call, directions link, copy phone)
- G5: SMS preview with character/segment count before send
- G6: Works on Windows, Mac, Linux (Electron wrapper optional later)
- G7: Zero data leaves the user's machine (all processing is local)

### Non-Goals
- Not a filed tax return (always labeled "estimate")
- Not a mobile app (responsive web, but not native)
- Not multi-user / cloud-hosted
- Not a general OpenClaw dashboard (TaxBot-specific)

---

## 5. User Stories

### Epic 1 — Setup & Configuration

**US-01** As a first-time user, I want a setup wizard that walks me through connecting my tax
folder, Gmail, and Twilio so I don't have to edit config files.

**Acceptance Criteria:**
- Step 1: Folder picker → validates path exists, shows file count preview
- Step 2: Gmail OAuth flow → opens browser tab, captures token, shows success
- Step 3: Twilio credentials → validates SID/token format, sends a test SMS
- Step 4: Tax year + location → pre-filled to current year and system locale
- Each step has a "Skip" option (tools still work without optional integrations)
- Config persisted to `~/.openclaw/openclaw.json` under `plugins.entries.taxbot.config`

---

### Epic 2 — Pipeline Execution

**US-02** As a user, I want to start the full pipeline with a single "Prepare My Taxes" button
so I don't have to remember command sequences.

**Acceptance Criteria:**
- Big green CTA button on the home screen
- Shows a confirmation dialog: "I'll scan [folder], read Gmail, generate your 1040, find CPAs in [city], and send a report to [phone]. Proceed?"
- Pipeline starts immediately on confirm

**US-03** As a user, I want to see each pipeline stage update in real time so I know what's
happening and whether it's stuck.

**Acceptance Criteria:**
- Five stage indicators: Scan Files → Read Gmail → Generate 1040 → Find CPAs → Send SMS
- Each transitions through: Waiting → Running (spinner) → Complete (green check) → Error (red ✗)
- Running stage shows a live sub-status line (e.g. "Reading file: 1099-NEC_Stripe.pdf")
- Elapsed time shown per stage
- Full pipeline elapsed time in footer
- On error: stage turns red, error message shown inline, Retry button appears

---

### Epic 3 — Document Review

**US-04** As a user, I want to see every document that was scanned with its detected type
so I can verify nothing was missed.

**Acceptance Criteria:**
- Document list panel: filename, detected type badge (W-2, 1099-NEC, etc.), size
- Color-coded badges by category: income (blue), deductions (green), payments (purple)
- Warning icon on documents with parse errors
- "Unknown" type documents flagged with "Review needed" tooltip
- Clicking a document shows its extracted text in a side drawer
- Manual type override dropdown if detection was wrong

**US-05** As a user, I want to edit any extracted dollar amount before the form is generated
so I can correct OCR errors or add missing values.

**Acceptance Criteria:**
- After scan completes, show a pre-fill form: all 1040 input fields grouped by section
- Fields auto-populated from extracted documents; source shown as tooltip on hover
- Fields with no source are blank with placeholder text
- "Confidence" indicator: green (extracted from document), yellow (inferred), red (missing/conflicting)
- "Clear All" and "Reset to Extracted" buttons per section
- Inline validation: amounts must be non-negative; withholding can't exceed wages

---

### Epic 4 — Form 1040 Viewer

**US-06** As a user, I want to see my Form 1040 estimate displayed as a readable, structured
form so I can review it line by line before sharing with a CPA.

**Acceptance Criteria:**
- Renders the 1040 output in a structured, section-collapsed layout (not a wall of text)
- Sections: Personal Info, Income, Adjustments, Deductions, Tax, Credits, Payments, Result
- Each section expandable/collapsible
- Result banner at top: large green "REFUND: $X,XXX" or red "YOU OWE: $X,XXX"
- Big Beautiful Bill provisions highlighted in gold with ⚡ icon and tooltip explaining each
- Print button → generates clean PDF-style printout
- "Share with CPA" button → copies a formatted text summary to clipboard
- Disclaimer banner pinned at bottom: "AI estimate — not a filed return. Review with a CPA."

---

### Epic 5 — CPA Finder

**US-07** As a user, I want to browse recommended CPAs as cards so I can compare and
choose the right professional for my needs.

**Acceptance Criteria:**
- Grid of CPA cards (3 columns desktop, 1 column mobile)
- Each card shows: name, type badge (CPA/EA/Tax Firm), star rating, review count, price
  range, top 2 specialties, phone, website link
- "Best Deal" badge on lowest-priced verified EA
- "Top Rated" badge on highest-rated result
- Sort: by rating (default), by price, by proximity
- Filter: type (CPA only, EA only, any), specialty (self-employed, real estate, etc.)
- Click "Call" → tel: link; "Directions" → Google Maps link; "Website" → opens in new tab
- "Refresh Search" button to re-run the web search
- Link to IRS.gov/taxpros with "Verify credentials before hiring" prompt

---

### Epic 6 — SMS Delivery

**US-08** As a user, I want to preview my SMS report before sending so I can verify the
content and know how many messages it will use.

**Acceptance Criteria:**
- SMS preview panel: shows the exact text as it will appear on a phone
- Character counter: "X / 1,550 chars per segment — Y segments total"
- Cost estimate: "~$Y.YY at standard Twilio rates" (based on segment count × $0.0079)
- Editable: user can trim CPA list or shorten the 1040 summary
- "Send Now" button → triggers delivery with loading state
- On success: green confirmation with Twilio message SIDs
- On failure: red alert with error message + "Retry" button
- Delivery receipt polling: shows "Delivered" / "Failed" status per segment within 30s

---

### Epic 7 — History & Re-runs

**US-09** As a user, I want to see a history of past runs so I can compare estimates or
re-send a report.

**Acceptance Criteria:**
- Sidebar list of past runs: date, status (Complete/Error), refund/owed amount
- Click a run → loads the full result view (read-only)
- "Re-run" button → starts a new pipeline with the same config
- "Export JSON" → downloads all extracted data as structured JSON
- Runs stored in `~/.config/taxbot/runs/` as JSON files (never sent to cloud)

---

## 6. UX Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  TAXBOT DASHBOARD                                               │
│  ┌──────────────┐  ┌────────────────────────────────────────┐   │
│  │   SIDEBAR    │  │  MAIN CONTENT AREA                     │   │
│  │              │  │                                        │   │
│  │  [Home]      │  │  ┌──────────────────────────────────┐  │   │
│  │  [Setup]     │  │  │  PIPELINE STATUS                  │  │   │
│  │  [History]   │  │  │  ● Scan Files    ✓ 12 docs / 3s  │  │   │
│  │              │  │  │  ● Read Gmail    ✓ 7 emails / 2s  │  │   │
│  │  Past runs:  │  │  │  ⟳ Generate 1040  running...      │  │   │
│  │  2026-03-31  │  │  │  ○ Find CPAs      waiting          │  │   │
│  │  2026-03-15  │  │  │  ○ Send SMS       waiting          │  │   │
│  │              │  │  └──────────────────────────────────┘  │   │
│  │              │  │                                        │   │
│  │              │  │  ┌──────────────────────────────────┐  │   │
│  │              │  │  │  DOCUMENTS (12)                   │  │   │
│  │              │  │  │  [W-2] employer_w2.pdf    ✓       │  │   │
│  │              │  │  │  [1099-NEC] stripe_2025.pdf ✓     │  │   │
│  │              │  │  │  [1099-INT] bank_interest.pdf ✓   │  │   │
│  │              │  │  │  [UNKNOWN] misc_doc.pdf    ⚠ Review│  │   │
│  │              │  │  └──────────────────────────────────┘  │   │
│  └──────────────┘  └────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

After pipeline → tabs appear:

  [Pipeline] [Documents] [Edit Numbers] [Form 1040] [Find CPA] [Send SMS]

Form 1040 tab:
┌──────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────┐  │
│  │  ✅  ESTIMATED REFUND: $3,240                       │  │
│  │      Effective Rate: 14.2%  |  Marginal Rate: 22%  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ▶ Personal Info          ▶ Income ($87,500)             │
│  ▶ Adjustments (-$4,200)  ▶ Deductions (-$15,000)       │
│  ▶ Tax ($12,460)          ▶ Credits (-$2,500)            │
│  ▶ Payments ($15,700)     ▶ Result                       │
│                                                          │
│  ⚡ Big Beautiful Bill provisions applied (3)            │
│     • Tip income excluded: $8,000                       │
│     • Child Tax Credit increased to $2,500              │
│     • QBI deduction at 23%                              │
│                                                          │
│  [🖨 Print]  [📋 Copy for CPA]  [✏️ Edit & Recalculate]  │
└──────────────────────────────────────────────────────────┘

CPA Finder tab:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ⭐ 4.9 (127)    │  │ ⭐ 4.7 (89)     │  │ ⭐ 4.8 (203)    │
│ Smith CPA       │  │ Green Tax EA    │  │ ProTax Group    │
│ [CPA]           │  │ [EA] 💰 DEAL    │  │ [Tax Firm]      │
│ $400–$800       │  │ $250–$500       │  │ $350–$700       │
│ 🎯 Self-Employ  │  │ 🎯 Freelance    │  │ 🎯 Investments  │
│    Real Estate  │  │    W-2          │  │    Crypto       │
│ 📞 (206)555-0101│  │ 📞 (206)555-0202│  │ 📞 (206)555-0303│
│ [Call] [Map]    │  │ [Call] [Map]    │  │ [Call] [Map]    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 7. Technical Architecture

### Overview

```
Browser (React SPA)
        │  HTTP REST + WebSocket
        ▼
Local Express Server  (port 7329 — "TAXS")
        │  Node.js function calls
        ▼
TaxBot Plugin Tools   (file-crawler, gmail-reader, form-generator, cpa-finder, sms-sender)
        │
        ├── Local filesystem
        ├── Gmail API
        ├── Brave/DuckDuckGo (web)
        └── Twilio (SMS)
```

### Components

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 19 + TypeScript | Component model fits the multi-step pipeline UI |
| Styling | Tailwind CSS v4 | Zero-config, utility-first, dark mode built-in |
| State | Zustand | Lightweight; pipeline state machine maps cleanly |
| Real-time | WebSocket (ws library) | Push pipeline events from server to browser |
| Backend | Express 5 + Node.js | Thin bridge; reuses existing plugin tool functions |
| Build | Vite 6 | Fast HMR for local dev; bundles to `dist/` |
| PDF export | react-to-print | Print the Form 1040 view directly |

### New files to create

```
taxfiling/
├── dashboard/                      ← NEW: entire dashboard app
│   ├── package.json                ← React/Vite/Tailwind deps
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── store/
│       │   └── pipeline.ts         ← Zustand state machine
│       ├── components/
│       │   ├── SetupWizard.tsx
│       │   ├── PipelineStatus.tsx  ← Live step tracker
│       │   ├── DocumentList.tsx
│       │   ├── NumberEditor.tsx    ← Pre-fill form editor
│       │   ├── Form1040Viewer.tsx  ← Structured 1040 display
│       │   ├── CPAGrid.tsx         ← CPA cards
│       │   └── SMSPreview.tsx      ← Preview + send
│       ├── hooks/
│       │   └── useWebSocket.ts     ← Live event stream
│       └── types/
│           └── pipeline.ts
├── server/                         ← NEW: Express bridge
│   ├── index.ts                    ← Express app + WS server
│   ├── routes/
│   │   ├── pipeline.ts             ← POST /api/pipeline/run
│   │   ├── config.ts               ← GET/PUT /api/config
│   │   └── history.ts              ← GET /api/history
│   └── pipeline-runner.ts          ← Orchestrates tool calls, emits WS events
└── package.json                    ← Add "dashboard" and "server" workspaces
```

### API Design

**REST Endpoints**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Read current plugin config |
| PUT | `/api/config` | Save plugin config |
| POST | `/api/pipeline/run` | Start full pipeline; returns `runId` |
| POST | `/api/pipeline/step/:step` | Run a single step |
| POST | `/api/pipeline/retry/:step` | Retry a failed step |
| GET | `/api/history` | List past runs |
| GET | `/api/history/:runId` | Get full result for a run |
| DELETE | `/api/history/:runId` | Delete a run |

**WebSocket Events** (server → browser)

```typescript
type PipelineEvent =
  | { type: "step:start";    step: StepName; runId: string }
  | { type: "step:progress"; step: StepName; message: string }
  | { type: "step:complete"; step: StepName; durationMs: number; result: unknown }
  | { type: "step:error";    step: StepName; error: string; retryable: boolean }
  | { type: "pipeline:done"; runId: string; totalMs: number }
```

**Pipeline Steps (StepName enum)**
```typescript
type StepName = "scan_files" | "read_gmail" | "generate_1040" | "find_cpa" | "send_sms"
```

### State Machine

```
IDLE
  │ user clicks "Run"
  ▼
RUNNING
  │ per step: WAITING → RUNNING → COMPLETE | ERROR
  │ on all complete:
  ▼
COMPLETE
  │ user clicks "Re-run" or changes config
  ▼
IDLE

Any step ERROR → pipeline pauses at that step
  User can: Retry step | Skip step | Abort
```

---

## 8. Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--tax-green` | `#22c55e` | Success, refund, complete |
| `--tax-red` | `#ef4444` | Error, amount owed |
| `--tax-gold` | `#f59e0b` | Big Beautiful Bill highlights |
| `--tax-blue` | `#3b82f6` | Primary actions, income |
| `--tax-purple` | `#8b5cf6` | Credits, secondary actions |
| `--tax-bg` | `#0f172a` | Dark background (dark mode default) |
| `--tax-surface` | `#1e293b` | Card surface |
| `--tax-border` | `#334155` | Borders, dividers |

### Typography
- Headings: `Inter` (system font fallback)
- Numbers/amounts: `JetBrains Mono` (monospace for alignment)
- Body: system-ui

### Component Patterns
- **Step indicator:** Circle icon (waiting/spinner/check/x) + label + sub-status + elapsed
- **Document badge:** Pill with colored dot; type label; hover shows confidence tooltip
- **Amount field:** Monospace input, right-aligned, `$` prefix, red border if conflict
- **CPA card:** White card, drop shadow, rating stars in gold, type badge top-right
- **SMS preview:** Phone frame mockup, character counter bar, cost estimate

---

## 9. Accessibility

- WCAG 2.1 AA compliance required
- All pipeline status changes announced via `aria-live="polite"`
- Keyboard navigable: Tab order follows reading order
- Color is never the sole indicator of state (icons + text always accompany color)
- Form fields have visible labels (not just placeholders)
- Error messages linked to their field via `aria-describedby`

---

## 10. Privacy & Security

- **Zero network egress for tax data** — all Form 1040 data stays on localhost
- CPA search via Brave/DDG sends only the location + query string (no PII)
- Twilio sends only the formatted report text (no SSN, no raw document content)
- Gmail OAuth token stored only in `~/.config/taxbot/` (user-controlled)
- Config UI masks Twilio Auth Token after first save (write-only display)
- Run history stored only in `~/.config/taxbot/runs/` (local JSON files)
- Dashboard server binds only to `127.0.0.1` — not accessible from other machines

---

## 11. Performance Requirements

| Metric | Target |
|--------|--------|
| Dashboard load time (cold) | < 2s |
| Pipeline step status update latency | < 500ms |
| File scan (50 PDFs) | < 30s |
| Form 1040 generation | < 2s |
| CPA search (web) | < 10s |
| SMS send (per segment) | < 5s |

---

## 12. Out-of-Scope (v1) — Future Backlog

| Feature | Notes |
|---------|-------|
| Electron wrapper | Makes it a desktop app — no browser needed |
| WhatsApp / Telegram delivery | OpenClaw has native support; add as alternative to SMS |
| State tax computation | Complex — each state differs; recommend CPA for multi-state |
| Actual IRS e-file submission | Requires IRS MeF integration + ERO credentials |
| Crypto/NFT tax calculation | High complexity; integrate with Koinly/CoinTracker export |
| Multi-user / household | Separate profiles per user; shared config |
| Audit support mode | Document package assembly for IRS correspondence |
| OCR for scanned PDFs | Integrate Tesseract.js for image-based PDFs |

---

## 13. Milestones

| Milestone | Deliverable | Est. Scope |
|-----------|-------------|-----------|
| M1 — Server foundation | Express + WebSocket bridge, pipeline runner, `/api/*` routes | ~1 day |
| M2 — Pipeline status UI | React app shell, live step tracker, document list | ~1 day |
| M3 — Number editor | Pre-fill form with extracted values, validation, confidence indicators | ~1 day |
| M4 — Form 1040 viewer | Structured 1040 display, BBB highlights, print, copy | ~1 day |
| M5 — CPA grid | Card UI, sort/filter, click-to-call, IRS verify link | ~0.5 day |
| M6 — SMS preview & send | Preview panel, segment counter, delivery receipt polling | ~0.5 day |
| M7 — Setup wizard | Guided config, Gmail OAuth flow in browser, Twilio test | ~1 day |
| M8 — History & re-runs | Sidebar history, export JSON, re-run from past config | ~0.5 day |
| **Total** | | **~6.5 days** |

---

## 14. Open Questions — RESOLVED

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| OQ-1 | Dashboard auto-start vs `npm run dashboard`? | **Auto-start with OpenClaw gateway** | Zero-friction; user shouldn't need a second command |
| OQ-2 | Electron wrapper in v1? | **Web browser only (no Electron)** | Faster to ship; browser is universal; Electron deferred to post-v1 |
| OQ-3 | CPA search — web results only or also IRS directory? | **Both** | IRS directory is the authoritative trust signal; web results provide ratings/pricing |
| OQ-4 | SMS only or also email/PDF? | **SMS only in v1** | Keeps scope tight; email/PDF export deferred to v2 |
| OQ-5 | Scanned PDFs — flag & skip or prompt user? | **Prompt user to photograph with phone** | Better recovery UX; user can re-scan and drop the image into the folder |
