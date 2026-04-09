---
name: taxbot
description: >
  Tax filing assistant. Use when the user asks to prepare taxes, file Form 1040, analyze tax documents,
  find a CPA, estimate refund or amount owed, or send a tax report by text/SMS.
  Triggers on phrases like: "do my taxes", "prepare my 1040", "find me a CPA", "how much do I owe",
  "analyze my W-2", "tax documents", "send my tax report", "Big Beautiful Bill", "tips deduction".
user-invocable: true
metadata: {"openclaw": {"requires": {"env": ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]}, "primaryEnv": "TWILIO_ACCOUNT_SID", "emoji": "🧾", "os": ["darwin", "linux", "win32"]}}
---

# TaxBot — AI Tax Filing Assistant

Helps you prepare a Form 1040 estimate for tax year 2025, find a CPA, and receive the full report by SMS.

## What It Does

1. **Scans your documents** — reads PDFs, W-2s, 1099s, 1098s from a local folder
2. **Reads your Gmail** — finds tax-related emails (W-2 notices, 1099 PDFs, IRS correspondence)
3. **Generates Form 1040** — computes AGI, deductions, credits, tax owed or refund
4. **Applies Big Beautiful Bill** — tip exclusions, overtime exclusion, senior deduction, SALT cap increase
5. **Finds CPAs near you** — searches for licensed tax professionals with pricing estimates
6. **Texts you the report** — sends Form 1040 summary + CPA list via SMS

## Quick Start

Say any of the following:
- "Prepare my 2025 taxes — my documents are in ~/Documents/Taxes/2025"
- "Scan my Gmail for tax documents and estimate my refund"
- "Find me a good CPA in Seattle, WA under $500"
- "Send my tax report to my phone"

## Workflow

```
Step 1: tax_crawl_files (scan ~/Documents/Taxes/2025)
Step 2: tax_read_gmail  (fetch W-2/1099 emails)
Step 3: Analyze all documents → extract income, withholding, deductions
Step 4: tax_generate_1040 (build the form)
Step 5: tax_find_cpa (search for CPAs in your city)
Step 6: tax_send_report (SMS the full report)
```

## Knowledge Base

The agent has deep knowledge of:
- Form 1040 line-by-line instructions → see [knowledge/form_1040.md](knowledge/form_1040.md)
- 2025 tax law and brackets → see [knowledge/tax_law_2025_2026.md](knowledge/tax_law_2025_2026.md)
- Big Beautiful Bill provisions → see [knowledge/big_beautiful_bill.md](knowledge/big_beautiful_bill.md)
- CPA selection and pricing → see [knowledge/cpa_guide.md](knowledge/cpa_guide.md)

## Setup Required

See [README setup steps](#) for:
1. Installing the plugin: `openclaw plugins install path/to/taxfiling`
2. Twilio credentials (for SMS)
3. Gmail OAuth setup (one-time, for email scanning)
