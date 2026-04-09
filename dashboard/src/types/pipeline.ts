// ── Pipeline types shared between store, components, and server ───────────────

export type StepStatus = "waiting" | "running" | "complete" | "error" | "skipped";

/** Dynamic step — created at runtime as the orchestrator calls tools */
export interface DynamicStep {
  stepId: string;          // unique ID (tool name or "ask_human_<id>")
  label: string;           // human-readable label from orchestrator
  status: StepStatus;
  message: string;         // live sub-status line
  durationMs?: number;
  error?: string;
  result?: unknown;
  isHumanInput?: boolean;  // true for ask_human steps
}

export type PipelineStatus = "idle" | "running" | "complete" | "error";

export interface RunHistory {
  runId: string;
  startedAt: string;    // ISO
  completedAt?: string;
  status: PipelineStatus;
  refundOrOwed?: number; // positive=refund, negative=owed
  steps: DynamicStep[];
  form1040?: string;
  cpaList?: CPACardData[];
  extractedData?: TaxFormData;
  bbbProvisions?: Record<string, number>;
}

// ── Document types ─────────────────────────────────────────────────────────────

export type DocType =
  | "W2" | "1099-NEC" | "1099-INT" | "1099-DIV" | "1099-B"
  | "1099-MISC" | "1099-R" | "1099-G" | "1099-K" | "SSA-1099"
  | "1098" | "1098-T" | "1098-E" | "K1" | "RECEIPT" | "OTHER";

export type DocConfidence = "extracted" | "inferred" | "missing" | "conflict";

export interface ScannedDocument {
  filename: string;
  filePath: string;
  type: DocType;
  sizeBytes: number;
  hasError: boolean;
  errorMessage?: string;
  isImageBased?: boolean;   // scanned PDF — OCR needed
  preview: string;          // first 600 chars
}

// ── CPA types ──────────────────────────────────────────────────────────────────

export interface CPACardData {
  name: string;
  type: "CPA" | "EA" | "Tax Firm" | "Online Service" | "Freelancer" | "Unknown";
  location: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  estimatedPrice?: string;
  priceMin?: number;
  specialties: string[];
  source: string;
  irsVerifyUrl?: string;
  tier?: 1 | 2 | 3;
  bestFor?: string;
  quoteUrl?: string;
  recommended?: boolean;
}

// ── 1040 input form ────────────────────────────────────────────────────────────

export interface FieldMeta {
  value: number;
  confidence: DocConfidence;
  sourceDoc?: string;   // filename that provided this value
}

export interface TaxFormData {
  // Taxpayer
  taxpayerName: string;
  ssnLast4: string;
  filingStatus: "single" | "mfj" | "mfs" | "hoh";
  spouseName: string;
  taxYear: number;
  dependentsUnder17: number;
  otherDependents: number;

  // Income
  wages: FieldMeta;
  tipIncome: FieldMeta;
  overtimePay: FieldMeta;
  interest: FieldMeta;
  ordinaryDividends: FieldMeta;
  qualifiedDividends: FieldMeta;
  ltcg: FieldMeta;
  stcg: FieldMeta;
  businessIncome: FieldMeta;
  rentalIncome: FieldMeta;
  unemploymentComp: FieldMeta;
  socialSecurity: FieldMeta;
  retirementDist: FieldMeta;
  otherIncome: FieldMeta;

  // Adjustments
  studentLoanInterest: FieldMeta;
  educatorExpenses: FieldMeta;
  hsaDeduction: FieldMeta;
  selfEmployedHealthInsurance: FieldMeta;
  iraDeduction: FieldMeta;
  otherAdjustments: FieldMeta;

  // Itemized deductions
  mortgageInterest: FieldMeta;
  saltPaid: FieldMeta;
  charitableCash: FieldMeta;
  charitableNonCash: FieldMeta;
  medicalExpenses: FieldMeta;

  // Credits & payments
  childCareCredit: FieldMeta;
  educationCredit: FieldMeta;
  eitc: FieldMeta;
  federalWithholding: FieldMeta;
  estimatedTaxPayments: FieldMeta;

  // Flags
  age65OrOlder: boolean;
  bigBeautifulBillEnacted: boolean;
  receivedTips: boolean;
  receivedOvertime: boolean;
  hasCarLoan: boolean;
  carLoanInterest: FieldMeta;
  isUsMadeVehicle: boolean;
}

// ── WebSocket event types ──────────────────────────────────────────────────────

export type PipelineEvent =
  | { type: "step:start";       stepId: string; stepLabel: string; runId: string }
  | { type: "step:progress";    stepId: string; message: string; runId?: string }
  | { type: "step:complete";    stepId: string; stepLabel?: string; durationMs: number; result: unknown; runId?: string }
  | { type: "step:error";       stepId: string; error: string; retryable: boolean; runId?: string }
  | { type: "pipeline:waiting"; runId: string; stepId: string; stepLabel: string; question: string; options?: string[] }
  | { type: "pipeline:done";    runId: string; totalMs: number }
  | { type: "connected" }

// ── Config ─────────────────────────────────────────────────────────────────────

export interface TaxBotConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  recipientPhone: string;
  /** Telegram Bot token from @BotFather */
  telegramBotToken?: string;
  /** Telegram chat ID (numeric) to send reports to */
  telegramChatId?: string;
  gmailCredentialsPath: string;
  taxDocumentsFolder: string;
  taxYear: number;
  userLocation: string;
  gmailEnabled: boolean;
  /** Anthropic API key for AI-powered document extraction. Falls back to ANTHROPIC_API_KEY env var. */
  anthropicApiKey?: string;
}
