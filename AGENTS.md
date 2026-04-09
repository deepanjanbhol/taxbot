# TaxBot Agent Configuration

## Available Tools

This agent has access to the following TaxBot plugin tools:

### Document Ingestion
- `tax_crawl_files` — scan local folder, extract text from PDFs and text files
- `tax_read_gmail` — fetch tax-related emails from Gmail
- `tax_gmail_authorize` — one-time Gmail OAuth setup (optional tool, requires user permission)

### Tax Processing
- `tax_generate_1040` — generate Form 1040 from extracted tax data

### CPA & Delivery
- `tax_find_cpa` — web search for CPAs and EAs near user's location
- `tax_send_report` — send SMS via Twilio (optional tool, requires user permission)

### Built-in OpenClaw Tools Used
- `web_search` — used for CPA research if needed beyond tax_find_cpa
- `read_file` — fallback file reading if tax_crawl_files needs supplementing
- `web_fetch` — verify IRS.gov information when needed

---

## Standard Workflow

```
START
  │
  ├─► tax_crawl_files(folder_path)          ← documents from local drive
  │       Extract: wages, withholding, interest, 1099 amounts, etc.
  │
  ├─► tax_read_gmail()                       ← tax emails (optional)
  │       Extract: any additional amounts from email bodies/attachments
  │
  ├─► [LLM: Analyze all extracted data]
  │       Map document data → Form 1040 lines
  │       Apply Big Beautiful Bill provisions
  │       Identify deductions/credits
  │       Note missing documents
  │
  ├─► tax_generate_1040(all_values)          ← compute the form
  │       Output: formatted Form 1040 + refund/owed
  │
  ├─► tax_find_cpa(location, complexity)     ← find professionals
  │       Output: ranked CPA list with pricing
  │
  └─► tax_send_report(summary, cpa_list)    ← SMS delivery
          Output: confirmation with message IDs
```

---

## Data Extraction Rules

When analyzing document content, extract these values:

### From W-2
- Box 1 → wages (Line 1z)
- Box 2 → federal_withholding
- Box 12 codes: D=401k, E=403b, W=HSA, C=group term life
- Box 14: check for state disability, union dues

### From 1099-NEC
- Box 1 → business_income (Schedule C)
- Box 4 → federal_withholding

### From 1099-INT
- Box 1 → interest
- Box 4 → federal_withholding

### From 1099-DIV
- Box 1a → ordinary_dividends
- Box 1b → qualified_dividends
- Box 2a → ltcg

### From 1099-B
- Net proceeds minus cost basis = capital gain/loss
- Short-term → stcg (taxed as ordinary)
- Long-term → ltcg

### From 1099-R
- Box 2a → retirement_dist (taxable amount)
- Box 4 → federal_withholding

### From SSA-1099
- Box 5 → social_security (net benefits)

### From 1098 (Mortgage)
- Box 1 → mortgage_interest

### From 1098-T (Tuition)
- Box 1 → education expenses (for education credit calculation)

### From 1098-E (Student Loan)
- Box 1 → student_loan_interest

---

## Missing Document Protocol

If key documents are missing, ask the user:
1. "I don't see a W-2 — did you have any employer wages in 2025?"
2. "I don't see any 1099s — did you do any freelance work or receive investment income?"
3. "Do you own a home? I'd need your Form 1098 for mortgage interest."
4. "Do you have any retirement account distributions (1099-R)?"

Do NOT proceed to generate the form with known gaps unless the user confirms the data is complete.

---

## Complexity Assessment

Use this to guide CPA recommendations:

| Situation | Complexity | CPA Price Range |
|-----------|-----------|-----------------|
| W-2 only, standard deduction | Simple | $150–$300 |
| W-2 + investments (1099-B) | Simple-Moderate | $250–$500 |
| Freelance (Schedule C) | Moderate | $400–$900 |
| Rental property (Schedule E) | Moderate-Complex | $600–$1,500 |
| S-corp / Partnership (K-1) | Complex | $800–$2,500+ |
| Multiple states | Complex | $1,000–$3,000+ |
| Foreign income / FBAR | Complex | $1,500–$5,000+ |
| Crypto + investments | Moderate-Complex | $700–$2,000 |

---

## Multi-Agent Notes

If coordination with another agent is needed (e.g., a dedicated document analysis agent):
- Use `sessions_send` to delegate document OCR to a vision-capable agent
- Use `sessions_spawn` for parallel CPA searching while generating the form
- All agents should reference the same knowledge base files in the `knowledge/` directory
