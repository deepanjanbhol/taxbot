/**
 * TaxBot — OpenClaw Plugin
 *
 * Registers six tools:
 *   tax_crawl_files        — scan local folder for tax documents
 *   tax_read_gmail         — pull tax emails from Gmail
 *   tax_gmail_authorize    — one-time Gmail OAuth setup
 *   tax_generate_1040      — compute and render Form 1040 estimate
 *   tax_find_cpa           — search for CPAs near user with pricing
 *   tax_send_report        — send full report + CPA list via SMS (Twilio)
 *
 * Usage flow:
 *   1. tax_crawl_files + tax_read_gmail  → gather documents
 *   2. LLM analyzes documents against knowledge base (SOUL.md)
 *   3. tax_generate_1040                 → build the form
 *   4. tax_find_cpa                      → find CPAs
 *   5. tax_send_report                   → deliver via SMS
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type }              from "@sinclair/typebox";

import { crawlTaxDocuments }                    from "./src/tools/file-crawler.js";
import { fetchTaxEmails, authorizeGmail }       from "./src/tools/gmail-reader.js";
import { generateForm1040, generateSmsSummary, type TaxInputData } from "./src/tools/form-generator.js";
import { findCPAs, formatCPAListForSms }        from "./src/tools/cpa-finder.js";
import { sendTaxReport, validateE164 }          from "./src/tools/sms-sender.js";
import { computeFullTax }                       from "./src/utils/tax-calculator.js";
import type { FilingStatus }                    from "./src/utils/tax-calculator.js";

// ─── Shared TypeBox schemas ────────────────────────────────────────────────────

const FilingStatusEnum = Type.Union([
  Type.Literal("single"),
  Type.Literal("mfj"),
  Type.Literal("mfs"),
  Type.Literal("hoh"),
], { description: "Filing status: single | mfj (married filing jointly) | mfs | hoh (head of household)" });

// ─── Plugin entry ──────────────────────────────────────────────────────────────

export default definePluginEntry({
  id:          "taxbot",
  name:        "TaxBot",
  description: "AI tax filing assistant — crawls files & Gmail, generates Form 1040, finds CPAs, sends SMS report.",

  register(api) {

    // ── 1. Crawl local folder ────────────────────────────────────────────────

    api.registerTool({
      name:        "tax_crawl_files",
      description:
        "Scan a local folder for tax documents (W-2, 1099s, 1098, K-1, PDFs, CSVs). " +
        "Returns extracted text content and document type classification for each file. " +
        "Use this as the first step before generating Form 1040.",
      parameters: Type.Object(
        {
          folder_path: Type.String({
            description: "Absolute path to the folder containing tax documents",
          }),
          max_files: Type.Optional(Type.Integer({
            description: "Maximum number of files to process (default: 50)",
            minimum: 1,
            maximum: 200,
            default: 50,
          })),
        },
        { additionalProperties: false }
      ),

      async execute(_id, params) {
        const result = await crawlTaxDocuments(params.folder_path, params.max_files ?? 50);

        const output: string[] = [result.summary, ""];

        for (const doc of result.documents) {
          output.push(`── ${doc.filename} [${doc.type}] (${(doc.sizeBytes / 1024).toFixed(1)} KB)`);
          // Include first 800 chars of content for LLM analysis
          const preview = doc.content.slice(0, 800).replace(/\n{3,}/g, "\n\n");
          output.push(preview);
          if (doc.content.length > 800) output.push("... [truncated — full content available]");
          output.push("");
        }

        if (result.errors.length) {
          output.push("ERRORS:");
          result.errors.forEach(e => output.push(`  ✗ ${e}`));
        }

        return { content: [{ type: "text" as const, text: output.join("\n") }] };
      },
    });

    // ── 2. Gmail OAuth setup (one-time) ─────────────────────────────────────

    api.registerTool(
      {
        name:        "tax_gmail_authorize",
        description:
          "One-time Gmail OAuth2 authorization. Call this if tax_read_gmail says Gmail is not authorized. " +
          "It will give you a URL to open in your browser. After approving, paste the code back here.",
        parameters: Type.Object(
          {
            auth_code: Type.Optional(Type.String({
              description: "The authorization code from the Google OAuth consent page. Omit on first call to get the auth URL.",
            })),
            credentials_path: Type.Optional(Type.String({
              description: "Path to credentials.json (default: ~/.config/taxbot/gmail_credentials.json)",
            })),
          },
          { additionalProperties: false }
        ),

        async execute(_id, params) {
          if (!params.auth_code) {
            return {
              content: [{
                type: "text" as const,
                text:
                  "To authorize Gmail:\n\n" +
                  "1. Go to console.cloud.google.com\n" +
                  "2. Create a project → Enable Gmail API\n" +
                  "3. Create OAuth2 credentials (Desktop app) → download credentials.json\n" +
                  "4. Place credentials.json at ~/.config/taxbot/gmail_credentials.json\n" +
                  "5. Call tax_gmail_authorize again — it will generate an auth URL\n" +
                  "6. Open the URL, authorize, copy the code, call tax_gmail_authorize with auth_code=<code>",
              }],
            };
          }

          try {
            const msg = await authorizeGmail(
              params.auth_code,
              params.credentials_path ?? undefined,
              undefined
            );
            return { content: [{ type: "text" as const, text: msg }] };
          } catch (err) {
            return {
              content: [{
                type: "text" as const,
                text: `Authorization failed: ${err instanceof Error ? err.message : String(err)}`,
              }],
            };
          }
        },
      },
      { optional: true }
    );

    // ── 3. Gmail tax email reader ────────────────────────────────────────────

    api.registerTool(
      {
        name:        "tax_read_gmail",
        description:
          "Fetch tax-related emails from Gmail (W-2 notifications, 1099s, 1098s, IRS correspondence). " +
          "Requires one-time Gmail authorization via tax_gmail_authorize. " +
          "Returns email subjects, senders, dates, and body text for LLM analysis.",
        parameters: Type.Object(
          {
            max_per_query: Type.Optional(Type.Integer({
              description: "Maximum emails to fetch per search query (default: 5)",
              minimum: 1,
              maximum: 20,
              default: 5,
            })),
            credentials_path: Type.Optional(Type.String({
              description: "Override path to Gmail credentials.json",
            })),
          },
          { additionalProperties: false }
        ),

        async execute(_id, params) {
          const result = await fetchTaxEmails(
            params.credentials_path ?? undefined,
            undefined,
            params.max_per_query ?? 5
          );

          const output: string[] = [result.summary, ""];

          for (const email of result.emails) {
            output.push(`── ${email.subject}`);
            output.push(`   From: ${email.from}  |  Date: ${email.date}`);
            if (email.attachmentNames.length) {
              output.push(`   Attachments: ${email.attachmentNames.join(", ")}`);
            }
            output.push(email.bodyText.slice(0, 600));
            output.push("");
          }

          if (result.errors.length) {
            output.push("ERRORS / NOTES:");
            result.errors.forEach(e => output.push(`  ✗ ${e}`));
          }

          return { content: [{ type: "text" as const, text: output.join("\n") }] };
        },
      },
      { optional: true }
    );

    // ── 4. Generate Form 1040 ────────────────────────────────────────────────

    api.registerTool({
      name:        "tax_generate_1040",
      description:
        "Generate a Form 1040 tax estimate from extracted tax data. " +
        "Call this AFTER analyzing documents from tax_crawl_files / tax_read_gmail. " +
        "All dollar amounts should be extracted from the documents. " +
        "Returns a formatted Form 1040 with refund/owed estimate and effective tax rate.",
      parameters: Type.Object(
        {
          // Taxpayer info
          taxpayer_name:  Type.String({ description: "Full legal name" }),
          ssn_last4:      Type.String({ description: "Last 4 digits of SSN only" }),
          filing_status:  FilingStatusEnum,
          spouse_name:    Type.Optional(Type.String({ description: "Spouse name if MFJ" })),
          tax_year:       Type.Optional(Type.Integer({ default: 2025 })),

          // Dependents
          dependents_under17: Type.Optional(Type.Integer({ default: 0, description: "Qualifying children under 17" })),
          other_dependents:   Type.Optional(Type.Integer({ default: 0, description: "Other dependents ($500 credit each)" })),

          // Income (set 0 if not applicable)
          wages:              Type.Number({ description: "W-2 box 1 total wages from all employers" }),
          tip_income:         Type.Optional(Type.Number({ default: 0, description: "Tip income (may be excludable)" })),
          overtime_pay:       Type.Optional(Type.Number({ default: 0, description: "Overtime wages (may be excludable)" })),
          interest:           Type.Optional(Type.Number({ default: 0 })),
          ordinary_dividends: Type.Optional(Type.Number({ default: 0 })),
          qualified_dividends:Type.Optional(Type.Number({ default: 0 })),
          ltcg:               Type.Optional(Type.Number({ default: 0, description: "Long-term capital gains" })),
          stcg:               Type.Optional(Type.Number({ default: 0, description: "Short-term capital gains (taxed as ordinary)" })),
          business_income:    Type.Optional(Type.Number({ default: 0, description: "Schedule C net profit/loss" })),
          rental_income:      Type.Optional(Type.Number({ default: 0, description: "Schedule E net rental income/loss" })),
          unemployment_comp:  Type.Optional(Type.Number({ default: 0 })),
          social_security:    Type.Optional(Type.Number({ default: 0, description: "Gross SS benefits from SSA-1099" })),
          retirement_dist:    Type.Optional(Type.Number({ default: 0, description: "Taxable pension/IRA distributions" })),
          other_income:       Type.Optional(Type.Number({ default: 0 })),

          // Adjustments
          student_loan_interest:         Type.Optional(Type.Number({ default: 0 })),
          educator_expenses:             Type.Optional(Type.Number({ default: 0 })),
          hsa_deduction:                 Type.Optional(Type.Number({ default: 0 })),
          self_employed_health_insurance:Type.Optional(Type.Number({ default: 0 })),
          ira_deduction:                 Type.Optional(Type.Number({ default: 0 })),
          other_adjustments:             Type.Optional(Type.Number({ default: 0 })),

          // Itemized deductions (0 if taking standard)
          mortgage_interest:   Type.Optional(Type.Number({ default: 0 })),
          salt_paid:           Type.Optional(Type.Number({ default: 0, description: "State + local taxes paid" })),
          charitable_cash:     Type.Optional(Type.Number({ default: 0 })),
          charitable_non_cash: Type.Optional(Type.Number({ default: 0 })),
          medical_expenses:    Type.Optional(Type.Number({ default: 0 })),

          // QBI
          qbi: Type.Optional(Type.Number({ default: 0, description: "Qualified Business Income from pass-throughs" })),

          // Credits
          child_care_credit:   Type.Optional(Type.Number({ default: 0 })),
          education_credit:    Type.Optional(Type.Number({ default: 0 })),
          eitc:                Type.Optional(Type.Number({ default: 0 })),
          retirement_credit:   Type.Optional(Type.Number({ default: 0 })),
          foreign_tax_credit:  Type.Optional(Type.Number({ default: 0 })),
          other_credits:       Type.Optional(Type.Number({ default: 0 })),

          // Payments
          federal_withholding:     Type.Number({ description: "Total federal taxes withheld from all W-2s and 1099s" }),
          estimated_tax_payments:  Type.Optional(Type.Number({ default: 0 })),

          // Flags
          age_65_or_older:           Type.Optional(Type.Boolean({ default: false })),
          big_beautiful_bill_enacted:Type.Optional(Type.Boolean({ default: true, description: "Apply Big Beautiful Bill provisions (default true — verify current law)" })),
          received_tips:             Type.Optional(Type.Boolean({ default: false })),
          received_overtime:         Type.Optional(Type.Boolean({ default: false })),
          has_car_loan:              Type.Optional(Type.Boolean({ default: false })),
          car_loan_interest:         Type.Optional(Type.Number({ default: 0 })),
          is_us_made_vehicle:        Type.Optional(Type.Boolean({ default: false })),
        },
        { additionalProperties: false }
      ),

      async execute(_id, p) {
        const input: TaxInputData = {
          taxpayerName:      p.taxpayer_name,
          ssn:               p.ssn_last4,
          filingStatus:      p.filing_status as FilingStatus,
          spouseName:        p.spouse_name,
          taxYear:           p.tax_year ?? 2025,
          dependentsUnder17: p.dependents_under17 ?? 0,
          otherDependents:   p.other_dependents ?? 0,
          wages:             p.wages,
          tipIncome:         p.tip_income ?? 0,
          overtimePay:       p.overtime_pay ?? 0,
          interest:          p.interest ?? 0,
          ordinaryDividends: p.ordinary_dividends ?? 0,
          qualifiedDividends:p.qualified_dividends ?? 0,
          ltcg:              p.ltcg ?? 0,
          stcg:              p.stcg ?? 0,
          businessIncome:    p.business_income ?? 0,
          rentalIncome:      p.rental_income ?? 0,
          unemploymentComp:  p.unemployment_comp ?? 0,
          socialSecurity:    p.social_security ?? 0,
          retirementDist:    p.retirement_dist ?? 0,
          otherIncome:       p.other_income ?? 0,
          studentLoanInterest:           p.student_loan_interest ?? 0,
          educatorExpenses:              p.educator_expenses ?? 0,
          hsaDeduction:                  p.hsa_deduction ?? 0,
          selfEmployedHealthInsurance:   p.self_employed_health_insurance ?? 0,
          iraDeduction:                  p.ira_deduction ?? 0,
          otherAdjustments:              p.other_adjustments ?? 0,
          mortgageInterest:              p.mortgage_interest ?? 0,
          saltPaid:                      p.salt_paid ?? 0,
          charitableCash:                p.charitable_cash ?? 0,
          charitableNonCash:             p.charitable_non_cash ?? 0,
          medicalExpenses:               p.medical_expenses ?? 0,
          otherItemized:                 0,
          qbi:                           p.qbi ?? (p.business_income ?? 0),
          childTaxCredit:                0, // computed inside generator
          childCareCredit:               p.child_care_credit ?? 0,
          educationCredit:               p.education_credit ?? 0,
          eitc:                          p.eitc ?? 0,
          retirementCredit:              p.retirement_credit ?? 0,
          foreignTaxCredit:              p.foreign_tax_credit ?? 0,
          otherCredits:                  p.other_credits ?? 0,
          federalWithholding:            p.federal_withholding,
          estimatedTaxPayments:          p.estimated_tax_payments ?? 0,
          age65OrOlder:                  p.age_65_or_older ?? false,
          bigBeautifulBillEnacted:       p.big_beautiful_bill_enacted ?? true,
          receivedTips:                  p.received_tips ?? false,
          receivedOvertime:              p.received_overtime ?? false,
          hasCarLoan:                    p.has_car_loan ?? false,
          carLoanInterest:               p.car_loan_interest ?? 0,
          isUsMadeVehicle:               p.is_us_made_vehicle ?? false,
        };

        const form = generateForm1040(input);
        return { content: [{ type: "text" as const, text: form }] };
      },
    });

    // ── 5. Find CPAs ─────────────────────────────────────────────────────────

    api.registerTool({
      name:        "tax_find_cpa",
      description:
        "Search for CPAs and Enrolled Agents near the user's location. " +
        "Returns a ranked list with ratings, pricing estimates, phone numbers, and specialties. " +
        "Call this after generating the Form 1040 so you know the return complexity.",
      parameters: Type.Object(
        {
          location: Type.String({
            description: "City and state (e.g. 'Seattle, WA' or 'Austin, TX')",
          }),
          return_details: Type.String({
            description: "Brief description of return complexity (e.g. 'W-2 plus Schedule C freelance income and rental property')",
          }),
          max_results: Type.Optional(Type.Integer({
            description: "Number of CPA results to return (default: 5)",
            minimum: 1,
            maximum: 10,
            default: 5,
          })),
          brave_api_key: Type.Optional(Type.String({
            description: "Brave Search API key for better results (optional — falls back to DuckDuckGo)",
          })),
        },
        { additionalProperties: false }
      ),

      async execute(_id, params) {
        const result = await findCPAs({
          location:     params.location,
          returnDetails: params.return_details,
          braveApiKey:  params.brave_api_key,
          maxResults:   params.max_results ?? 5,
        });

        const formatted = formatCPAListForSms(result);
        return { content: [{ type: "text" as const, text: formatted }] };
      },
    });

    // ── 6. Send SMS report ───────────────────────────────────────────────────

    api.registerTool(
      {
        name:        "tax_send_report",
        description:
          "Send the complete tax report (Form 1040 summary + CPA list) via SMS using Twilio. " +
          "Call this as the final step after generating the form and finding CPAs. " +
          "Long reports are automatically split into multiple messages.",
        parameters: Type.Object(
          {
            form_summary: Type.String({
              description: "The SMS-formatted tax summary (from tax_generate_1040 output — condense to key figures)",
            }),
            cpa_list: Type.String({
              description: "The formatted CPA list (from tax_find_cpa output)",
            }),
            twilio_account_sid: Type.String({
              description: "Twilio Account SID (from twilio.com console)",
            }),
            twilio_auth_token: Type.String({
              description: "Twilio Auth Token",
            }),
            from_number: Type.String({
              description: "Twilio phone number in E.164 format (e.g. +12025551234)",
            }),
            to_number: Type.String({
              description: "Recipient phone number in E.164 format",
            }),
          },
          { additionalProperties: false }
        ),

        async execute(_id, params) {
          // Validate phone numbers
          if (!validateE164(params.from_number)) {
            return { content: [{ type: "text" as const, text: `Invalid from_number format. Use E.164: +12025551234` }] };
          }
          if (!validateE164(params.to_number)) {
            return { content: [{ type: "text" as const, text: `Invalid to_number format. Use E.164: +12025551234` }] };
          }

          const fullReport = [
            params.form_summary,
            "",
            "─".repeat(40),
            "",
            params.cpa_list,
          ].join("\n");

          const result = await sendTaxReport(
            {
              accountSid:  params.twilio_account_sid,
              authToken:   params.twilio_auth_token,
              fromNumber:  params.from_number,
              toNumber:    params.to_number,
            },
            fullReport
          );

          if (result.success) {
            return {
              content: [{
                type: "text" as const,
                text: `✅ Report sent successfully!\n` +
                      `   Messages sent: ${result.segmentsSent}\n` +
                      `   Message IDs: ${result.messageIds.join(", ")}`,
              }],
            };
          } else {
            return {
              content: [{
                type: "text" as const,
                text: `❌ SMS delivery failed: ${result.error}\n` +
                      `   Messages sent before failure: ${result.segmentsSent}`,
              }],
            };
          }
        },
      },
      { optional: true }
    );
  },
});
