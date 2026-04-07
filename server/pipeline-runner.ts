/**
 * pipeline-runner.ts
 * Orchestrates the 5-step tax filing pipeline, emitting WebSocket events at each stage.
 *
 * Graceful degradation rules:
 *   Step 2 (Gmail)   — always runs; if auth fails or disabled, falls back to folder-only
 *                      and surfaces exactly what was missed + how to fix it.
 *   Step 4 (Find CPA) — always runs; if no location configured, searches generically
 *                       and surfaces IRS directory as fallback.
 *   Step 5 (Send SMS) — always generates the SMS snapshot text; if Twilio not
 *                       configured it stores the snapshot so the user can copy/send
 *                       manually. Never silently skips.
 */

import { WebSocket } from "ws";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { crawlTaxDocuments } from "../src/tools/file-crawler.js";
import { fetchTaxEmails } from "../src/tools/gmail-reader.js";
import { generateForm1040, generateSmsSummary, type TaxInputData } from "../src/tools/form-generator.js";
import { computeFullTax } from "../src/utils/tax-calculator.js";
import { findCPAs, formatCPAListForSms } from "../src/tools/cpa-finder.js";
import { sendTaxReport } from "../src/tools/sms-sender.js";
import { extractTaxDataWithAI } from "../src/tools/ai-extractor.js";
import type { TaxBotConfig } from "../dashboard/src/types/pipeline.js";

export type StepName = "scan_files" | "read_gmail" | "generate_1040" | "find_cpa" | "send_sms";

export interface PipelineRunResult {
  runId: string;
  startedAt: string;
  completedAt: string;
  steps: Record<StepName, { ok: boolean; durationMs: number; result?: unknown; error?: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emit(clients: Set<WebSocket>, event: Record<string, unknown>) {
  const msg = JSON.stringify(event);
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

async function runStep<T>(
  clients: Set<WebSocket>,
  name: StepName,
  runId: string,
  fn: (progress: (msg: string) => void) => Promise<T>
): Promise<{ ok: true; result: T; durationMs: number } | { ok: false; error: string; durationMs: number; result?: T }> {
  const start = Date.now();
  emit(clients, { type: "step:start", step: name, runId });
  const progress = (message: string) => emit(clients, { type: "step:progress", step: name, message });

  try {
    const result = await fn(progress);
    const durationMs = Date.now() - start;
    emit(clients, { type: "step:complete", step: name, durationMs, result });
    return { ok: true, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    emit(clients, { type: "step:error", step: name, error, retryable: true });
    return { ok: false, error, durationMs };
  }
}

/** Resolve the Anthropic API key from config or environment. */
function resolveApiKey(config: TaxBotConfig): string | null {
  return config.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null;
}

/** Build the full SMS text from form + CPA list. */
function buildSmsText(form1040Text: string, cpaList: unknown[]): string {
  const lines: string[] = [];

  // Compact 1040 summary
  const refundMatch = form1040Text.match(/(REFUND|AMOUNT YOU OWE)[:\s]+(\$[\d,]+)/i);
  const agiMatch    = form1040Text.match(/AGI:\s+(\$[\d,]+)/i);
  const effMatch    = form1040Text.match(/Effective Tax Rate:\s+([\d.]+%)/i);
  const margMatch   = form1040Text.match(/Marginal Tax Rate:\s+([\d.]+%)/i);
  const taxMatch    = form1040Text.match(/TOTAL TAX AFTER CREDITS\s+(\$[\d,]+)/i);

  lines.push("📊 TAXBOT 2025 TAX ESTIMATE");
  if (refundMatch) lines.push(`${refundMatch[1].toUpperCase()}: ${refundMatch[2]}`);
  if (agiMatch)    lines.push(`AGI: ${agiMatch[1]}`);
  if (taxMatch)    lines.push(`Total Tax: ${taxMatch[1]}`);
  if (effMatch)    lines.push(`Effective rate: ${effMatch[1]}`);
  if (margMatch)   lines.push(`Marginal rate: ${margMatch[1]}`);
  lines.push("⚠ Estimate only — review with CPA before filing");

  // CPA summary
  const cpas = cpaList as Array<{
    name: string; type: string; rating?: number; reviewCount?: number;
    estimatedPrice?: string; phone?: string; specialties: string[];
  }>;

  if (cpas.length > 0) {
    lines.push("", "─".repeat(28), "", "👔 TAX PROFESSIONALS");
    cpas.slice(0, 3).forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name} (${c.type})`);
      if (c.rating)         lines.push(`   ⭐ ${c.rating}${c.reviewCount ? ` (${c.reviewCount} reviews)` : ""}`);
      if (c.estimatedPrice) lines.push(`   💰 ${c.estimatedPrice}`);
      if (c.phone)          lines.push(`   📞 ${c.phone}`);
      if (c.specialties?.[0]) lines.push(`   🎯 ${c.specialties.slice(0, 2).join(", ")}`);
      lines.push("");
    });
    lines.push("Verify: irs.treasury.gov/rpo/rpo.jsf");
  }

  return lines.join("\n");
}

// ── Main pipeline orchestrator ────────────────────────────────────────────────

export async function runPipeline(
  clients: Set<WebSocket>,
  config: TaxBotConfig,
  runId: string,
  overrideFormData?: TaxInputData
): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();
  const stepResults: PipelineRunResult["steps"] = {} as PipelineRunResult["steps"];

  let scannedDocs: Array<{ content: string; type: string; filename: string; filePath: string; sizeBytes: number; mimeType: string }> = [];
  let form1040Text = "";
  let cpaList: unknown[] = [];

  // ── Step 1: Scan files (always required) ──────────────────────────────────
  const folder = (config.taxDocumentsFolder || "").replace("~", os.homedir());

  const s1 = await runStep(clients, "scan_files", runId, async (progress) => {
    if (!folder) throw new Error("No tax documents folder configured. Add one in Setup.");
    progress(`Scanning ${folder}…`);
    const result = await crawlTaxDocuments(folder);
    progress(`Found ${result.documents.length} documents`);
    scannedDocs = result.documents;
    return {
      documents: result.documents.map(d => ({
        filename:     d.filename,
        filePath:     d.filePath,
        type:         d.type,
        sizeBytes:    d.sizeBytes,
        mimeType:     d.mimeType,
        hasError:     d.content.includes("[PDF parse error"),
        isImageBased: d.content.includes("[PDF parse error"),
        preview:      d.content.slice(0, 600),
      })),
      summary: result.summary,
      errors:  result.errors,
      docCount: result.documents.length,
    };
  });
  stepResults.scan_files = { ok: s1.ok, durationMs: s1.durationMs, result: s1.ok ? s1.result : undefined, error: s1.ok ? undefined : s1.error };

  // Hard stop only if folder is completely inaccessible
  if (!s1.ok) {
    emit(clients, { type: "pipeline:done", runId, totalMs: Date.now() - new Date(startedAt).getTime() });
    return { runId, startedAt, completedAt: new Date().toISOString(), steps: stepResults };
  }

  // ── Step 2: Gmail — always attempt, degrade gracefully ────────────────────
  const s2 = await runStep(clients, "read_gmail", runId, async (progress) => {
    const credPath  = (config.gmailCredentialsPath || "~/.config/taxbot/gmail_credentials.json").replace("~", os.homedir());
    const tokenPath = path.join(os.homedir(), ".config", "taxbot", "gmail_token.json");

    // Check if credentials file exists before attempting
    let credsExist = false;
    let tokenExists = false;
    try { await fs.access(credPath);  credsExist = true; } catch { /* not found */ }
    try { await fs.access(tokenPath); tokenExists = true; } catch { /* not found */ }

    if (!config.gmailEnabled || !credsExist || !tokenExists) {
      // Graceful degradation: explain what's missing, list what we'd have looked for
      const reasons: string[] = [];
      if (!config.gmailEnabled) reasons.push("Gmail scan is disabled in Setup");
      if (!credsExist)  reasons.push(`credentials.json not found at ${credPath}`);
      if (!tokenExists) reasons.push("Gmail not authorized yet — run Setup → Authorize Gmail");

      progress("Gmail not available — using local documents only");

      return {
        attempted: true,
        succeeded: false,
        gmailUnavailableReasons: reasons,
        fallbackNote: "All income data sourced from local documents only. Enable Gmail to also scan for W-2 notifications, 1099 emails, 1098 statements, and IRS correspondence.",
        wouldHaveSearchedFor: [
          "W-2 and W2 delivery notifications",
          "1099-NEC, 1099-INT, 1099-DIV, 1099-B statements",
          "1098 mortgage interest statements",
          "IRS letters and notices (from irs.gov)",
          "K-1 partner/shareholder statements",
          "SSA-1099 Social Security benefit statements",
        ],
        emails: [],
        emailCount: 0,
        setupAction: "Go to Setup → Gmail tab → Authorize Gmail to enable this step",
      };
    }

    // Credentials exist — attempt real fetch
    try {
      progress("Connecting to Gmail…");
      const result = await fetchTaxEmails(credPath, tokenPath, 5);
      progress(`Found ${result.emails.length} tax-related emails`);

      // Merge any additional amounts found in emails back into scannedDocs context
      const emailDocs = result.emails
        .filter(e => e.bodyText && e.bodyText.length > 20)
        .map(e => ({
          content:  e.bodyText,
          type:     "OTHER" as const,
          filename: `Gmail: ${e.subject.slice(0, 50)}`,
          filePath: "",
          sizeBytes: e.bodyText.length,
          mimeType: "text/plain",
        }));

      if (emailDocs.length > 0) {
        scannedDocs = [...scannedDocs, ...emailDocs];
        progress(`Merged ${emailDocs.length} email(s) into document pool`);
      }

      return {
        attempted: true,
        succeeded: true,
        emails: result.emails,
        emailCount: result.emails.length,
        errors: result.errors,
        summary: result.summary,
        mergedEmailDocs: emailDocs.length,
      };
    } catch (err) {
      // Auth or network error — degrade, don't halt pipeline
      const errorMsg = err instanceof Error ? err.message : String(err);
      progress("Gmail error — continuing with local documents only");

      return {
        attempted: true,
        succeeded: false,
        gmailUnavailableReasons: [errorMsg],
        fallbackNote: "Gmail fetch failed. Proceeding with local folder documents only.",
        emails: [],
        emailCount: 0,
        error: errorMsg,
      };
    }
  });
  stepResults.read_gmail = { ok: s2.ok, durationMs: s2.durationMs, result: s2.ok ? s2.result : undefined, error: s2.ok ? undefined : s2.error };

  // ── Step 3: AI extraction + Generate Form 1040 ───────────────────────────
  const s3 = await runStep(clients, "generate_1040", runId, async (progress) => {
    // --- AI-powered extraction ---
    let taxInput = overrideFormData;
    let extractionLog: Array<{ field: string; amount: number; docName: string; boxLabel: string; note?: string }> = [];
    let aiWarnings: string[] = [];
    let tokensUsed = 0;
    let extractionMethod = "none";

    if (!taxInput) {
      const apiKey = resolveApiKey(config);
      if (apiKey) {
        extractionMethod = "ai";
        progress("AI extraction: sending documents to Claude…");
        const aiResult = await extractTaxDataWithAI(
          scannedDocs,
          config.taxYear || 2025,
          apiKey,
          progress
        );
        taxInput    = aiResult.taxInput;
        extractionLog = aiResult.extractionLog;
        aiWarnings  = aiResult.warnings;
        tokensUsed  = aiResult.tokensUsed;
        progress(`AI extracted ${extractionLog.length} fields (${tokensUsed} tokens) — computing 1040…`);
      } else {
        // No API key — surface a clear warning and use empty input
        aiWarnings.push("ANTHROPIC_API_KEY not set. Set it in Setup or as an environment variable to enable AI extraction.");
        progress("⚠ No API key — skipping AI extraction. Set ANTHROPIC_API_KEY to enable.");
        taxInput = {
          taxpayerName: "Taxpayer (update in editor)", ssn: "0000",
          filingStatus: "single", taxYear: config.taxYear || 2025,
          dependentsUnder17: 0, otherDependents: 0,
          wages: 0, tipIncome: 0, overtimePay: 0, interest: 0,
          ordinaryDividends: 0, qualifiedDividends: 0, ltcg: 0, stcg: 0,
          businessIncome: 0, rentalIncome: 0, unemploymentComp: 0,
          socialSecurity: 0, retirementDist: 0, otherIncome: 0,
          studentLoanInterest: 0, educatorExpenses: 0, hsaDeduction: 0,
          selfEmployedHealthInsurance: 0, iraDeduction: 0, otherAdjustments: 0,
          mortgageInterest: 0, saltPaid: 0, charitableCash: 0,
          charitableNonCash: 0, medicalExpenses: 0, otherItemized: 0,
          qbi: 0, childTaxCredit: 0, childCareCredit: 0, educationCredit: 0,
          eitc: 0, retirementCredit: 0, foreignTaxCredit: 0, otherCredits: 0,
          federalWithholding: 0, estimatedTaxPayments: 0,
          age65OrOlder: false, bigBeautifulBillEnacted: true,
          receivedTips: false, receivedOvertime: false,
          hasCarLoan: false, carLoanInterest: 0, isUsMadeVehicle: false,
        } as TaxInputData;
      }
    }

    const form1040 = generateForm1040(taxInput);
    form1040Text = form1040;

    // Compute summary metrics
    const tax = computeFullTax({
      filingStatus:      taxInput.filingStatus,
      wages:             taxInput.wages,
      interest:          taxInput.interest,
      dividends:         taxInput.ordinaryDividends,
      qualifiedDividends: taxInput.qualifiedDividends,
      ltcg:              taxInput.ltcg,
      businessIncome:    taxInput.businessIncome,
      rentalIncome:      taxInput.rentalIncome,
      otherIncome:       taxInput.retirementDist + taxInput.socialSecurity + taxInput.otherIncome,
      adjustments:       taxInput.studentLoanInterest + taxInput.educatorExpenses + taxInput.hsaDeduction +
                         taxInput.selfEmployedHealthInsurance + taxInput.iraDeduction + taxInput.otherAdjustments,
      itemizedDeductions: taxInput.mortgageInterest + taxInput.saltPaid + taxInput.charitableCash,
      qbi:               taxInput.qbi,
      credits:           0,
      withholding:       taxInput.federalWithholding,
      estimatedPayments: taxInput.estimatedTaxPayments,
      bigBeautifulBillEnacted: taxInput.bigBeautifulBillEnacted,
    });

    const refundMatch = form1040.match(/(REFUND|AMOUNT YOU OWE)[:\s]+\$?([\d,]+)/i);

    progress("Form 1040 generated");

    return {
      form1040Text: form1040,
      taxInput,
      extractionLog,
      extractionMethod,
      aiWarnings,
      tokensUsed,
      metrics: {
        grossIncome:   tax.grossIncome,
        agi:           tax.agi,
        taxableIncome: tax.taxableIncome,
        totalTax:      tax.totalTaxAfterCredits,
        effectiveRate: tax.effectiveRate,
        marginalRate:  Math.round(tax.marginalRate * 100),
        refundOrOwed:  tax.refundOrOwed,
        deductionUsed: tax.deductionUsed,
        deductionType: tax.deductionUsed === tax.standardDeduction ? "standard" : "itemized",
        seTax:         tax.seTax,
        niit:          tax.niit,
        qbiDeduction:  tax.qbiDeduction,
      },
      bbbProvisions: [
        taxInput.receivedTips   && taxInput.tipIncome   > 0 ? `Tip exclusion: $${Math.min(taxInput.tipIncome, 25000).toLocaleString()}` : null,
        taxInput.receivedOvertime && taxInput.overtimePay > 0 ? `Overtime exclusion: $${Math.min(taxInput.overtimePay, 12500).toLocaleString()}` : null,
        taxInput.age65OrOlder ? "Senior deduction: $4,000" : null,
        taxInput.saltPaid > 10000 ? `SALT cap raised to $30,000 (extra deduction: $${Math.min(taxInput.saltPaid, 30000) - Math.min(taxInput.saltPaid, 10000)})` : null,
        "QBI deduction at 23% (vs 20% without BBB)",
        "Child Tax Credit at $2,500/child (vs $2,000 without BBB)",
        taxInput.hasCarLoan && taxInput.isUsMadeVehicle && taxInput.carLoanInterest > 0
          ? `Car loan interest deduction: $${Math.min(taxInput.carLoanInterest, 10000).toLocaleString()}` : null,
      ].filter(Boolean) as string[],
      refundOrOwed: refundMatch
        ? (refundMatch[1]!.toLowerCase() === "refund" ? 1 : -1) * parseInt(refundMatch[2]!.replace(/,/g, ""))
        : null,
    };
  });
  stepResults.generate_1040 = { ok: s3.ok, durationMs: s3.durationMs, result: s3.ok ? s3.result : undefined, error: s3.ok ? undefined : s3.error };

  // ── Step 4: Find CPAs — always attempt, use generic search if no location ──
  const s4 = await runStep(clients, "find_cpa", runId, async (progress) => {
    const location = config.userLocation?.trim() || "";

    if (!location) {
      // No location — search generically and surface IRS directory prominently
      progress("No location configured — searching general tax professionals…");

      const result = await findCPAs({
        location: "United States",
        returnDetails: scannedDocs.map(d => d.type).join(", "),
        maxResults: 5,
      }).catch(() => ({ cpas: [], searchSummary: "Search unavailable", pricingGuidance: "", disclaimer: "" }));

      cpaList = result.cpas;

      return {
        cpas: result.cpas,
        formatted: formatCPAListForSms(result),
        locationUsed: "General (no location set)",
        noLocationNote: "Add your city and state in Setup for local CPA results.",
        irsDirectoryUrl: "https://irs.treasury.gov/rpo/rpo.jsf",
        irsDirectoryNote: "Find verified CPAs and EAs near any ZIP code at the IRS Tax Pro Directory.",
        pricingGuidance: result.pricingGuidance,
      };
    }

    progress(`Searching for CPAs and EAs near ${location}…`);
    const result = await findCPAs({
      location,
      returnDetails: scannedDocs.map(d => d.type).join(", "),
      maxResults: 5,
    });
    progress(`Found ${result.cpas.length} tax professionals`);
    cpaList = result.cpas;

    return {
      cpas: result.cpas,
      formatted: formatCPAListForSms(result),
      locationUsed: location,
      irsDirectoryUrl: "https://irs.treasury.gov/rpo/rpo.jsf",
      pricingGuidance: result.pricingGuidance,
      disclaimer: result.disclaimer,
    };
  });
  stepResults.find_cpa = { ok: s4.ok, durationMs: s4.durationMs, result: s4.ok ? s4.result : undefined, error: s4.ok ? undefined : s4.error };

  // ── Step 5: SMS — always generate snapshot; send if Twilio configured ──────
  const s5 = await runStep(clients, "send_sms", runId, async (progress) => {
    // Always build the SMS text — even if Twilio isn't configured
    progress("Building SMS snapshot…");
    const smsText = buildSmsText(form1040Text, cpaList);
    const segments = Math.ceil(smsText.length / 1550);

    const hasTwilio = !!(config.twilioAccountSid && config.twilioAuthToken &&
                         config.twilioFromNumber && config.recipientPhone);

    if (!hasTwilio) {
      // No Twilio: generate snapshot, save to disk, surface in dashboard
      const snapshotDir  = path.join(os.homedir(), ".config", "taxbot", "snapshots");
      const snapshotFile = path.join(snapshotDir, `sms-snapshot-${Date.now()}.txt`);
      await fs.mkdir(snapshotDir, { recursive: true });
      await fs.writeFile(snapshotFile, smsText, "utf-8");

      progress("Twilio not configured — snapshot saved for manual delivery");

      return {
        attempted:    true,
        sent:         false,
        twilioMissing: true,
        missingFields: [
          !config.twilioAccountSid ? "twilioAccountSid"  : null,
          !config.twilioAuthToken  ? "twilioAuthToken"   : null,
          !config.twilioFromNumber ? "twilioFromNumber"  : null,
          !config.recipientPhone   ? "recipientPhone"    : null,
        ].filter(Boolean),
        smsText,
        segments,
        charCount:    smsText.length,
        snapshotFile,
        setupAction:  "Go to Setup → Twilio SMS tab to add your credentials and send this automatically next time.",
        note:         "Your SMS report is ready above — copy it manually or configure Twilio to auto-send.",
      };
    }

    // Twilio configured — attempt send
    progress(`Sending ${segments} SMS message${segments > 1 ? "s" : ""} to ${config.recipientPhone}…`);
    const smsResult = await sendTaxReport(
      {
        accountSid:  config.twilioAccountSid,
        authToken:   config.twilioAuthToken,
        fromNumber:  config.twilioFromNumber,
        toNumber:    config.recipientPhone,
      },
      smsText
    );

    if (smsResult.success) {
      progress(`Delivered ${smsResult.segmentsSent} message${smsResult.segmentsSent > 1 ? "s" : ""}`);
    } else {
      progress(`Send failed: ${smsResult.error}`);
    }

    return {
      attempted:      true,
      sent:           smsResult.success,
      twilioMissing:  false,
      success:        smsResult.success,
      segmentsSent:   smsResult.segmentsSent,
      messageIds:     smsResult.messageIds,
      error:          smsResult.error,
      smsText,
      segments,
      charCount:      smsText.length,
      recipientPhone: config.recipientPhone,
    };
  });
  stepResults.send_sms = { ok: s5.ok, durationMs: s5.durationMs, result: s5.ok ? s5.result : undefined, error: s5.ok ? undefined : s5.error };

  const totalMs = Date.now() - new Date(startedAt).getTime();
  emit(clients, { type: "pipeline:done", runId, totalMs });

  return { runId, startedAt, completedAt: new Date().toISOString(), steps: stepResults };
}
