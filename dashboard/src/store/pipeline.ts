import { create } from "zustand";
import type {
  DynamicStep, PipelineStatus, RunHistory,
  ScannedDocument, CPACardData, TaxFormData, TaxBotConfig,
} from "../types/pipeline";

// Human-readable labels for known tool names
export const TOOL_LABELS: Record<string, string> = {
  scan_tax_documents:     "Scan Documents",
  extract_income_fields:  "Extract Income Fields",
  compute_form_1040:      "Compute Form 1040",
  find_tax_professionals: "Find CPAs",
  send_tax_report:        "Send SMS Report",
  save_report_snapshot:   "Save Report Snapshot",
};

interface HumanInputPending {
  runId: string;
  stepId: string;
  question: string;
  options?: string[];
  stepLabel: string;
}

interface PipelineStore {
  // Status
  status: PipelineStatus;
  runId: string | null;
  startedAt: number | null;
  steps: DynamicStep[];
  totalMs: number | null;

  // Human input
  humanInputPending: HumanInputPending | null;

  // Data
  documents: ScannedDocument[];
  formData: TaxFormData | null;
  form1040Text: string | null;
  cpas: CPACardData[];
  smsSent: boolean;
  smsMessageIds: string[];

  // History
  history: RunHistory[];

  // Config
  config: TaxBotConfig | null;
  configLoaded: boolean;

  // Active tab
  activeTab: "landing" | "pipeline" | "documents" | "editor" | "form1040" | "cpa" | "sms" | "history" | "setup";

  // Actions
  setActiveTab: (tab: PipelineStore["activeTab"]) => void;
  startPipeline: () => void;
  setRunId: (runId: string) => void;
  handleEvent: (event: Record<string, unknown>) => void;
  clearHumanInput: () => void;
  setDocuments: (docs: ScannedDocument[]) => void;
  setFormData: (data: TaxFormData) => void;
  updateFormField: (field: keyof TaxFormData, value: unknown) => void;
  setForm1040Text: (text: string) => void;
  setCPAs: (cpas: CPACardData[]) => void;
  setSMSSent: (ids: string[]) => void;
  setConfig: (config: TaxBotConfig) => void;
  loadHistory: (history: RunHistory[]) => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  status: "idle",
  runId: null,
  startedAt: null,
  steps: [],
  totalMs: null,
  humanInputPending: null,
  documents: [],
  formData: null,
  form1040Text: null,
  cpas: [],
  smsSent: false,
  smsMessageIds: [],
  history: [],
  config: null,
  configLoaded: false,
  activeTab: "landing",

  setActiveTab: (tab) => set({ activeTab: tab }),

  startPipeline: () => set({
    status: "running",
    startedAt: Date.now(),
    steps: [],
    humanInputPending: null,
    documents: [],
    formData: null,
    form1040Text: null,
    cpas: [],
    smsSent: false,
    smsMessageIds: [],
    totalMs: null,
  }),

  setRunId: (runId) => set({ runId }),

  handleEvent: (event) => {
    const { steps } = get();
    const type = event.type as string;
    const stepId = event.stepId as string | undefined;
    const stepLabel = (event.stepLabel as string | undefined) ?? (stepId ? (TOOL_LABELS[stepId] ?? stepId) : "");

    if (type === "step:start" && stepId) {
      // Capture runId from events
      if (event.runId && !get().runId) set({ runId: event.runId as string });

      // Add new step if not already present
      if (!steps.find(s => s.stepId === stepId)) {
        set({
          steps: [...steps, {
            stepId,
            label: stepLabel,
            status: "running",
            message: "Starting…",
            isHumanInput: stepId.startsWith("ask_human"),
          }],
        });
      } else {
        set({
          steps: steps.map(s =>
            s.stepId === stepId ? { ...s, status: "running", message: "Starting…" } : s
          ),
        });
      }

    } else if (type === "step:progress" && stepId) {
      set({
        steps: get().steps.map(s =>
          s.stepId === stepId ? { ...s, message: (event.message as string) ?? "" } : s
        ),
      });

    } else if (type === "step:complete" && stepId) {
      const result = event.result as Record<string, unknown> | undefined;

      // Side effects for known steps
      if (stepId === "scan_tax_documents" && result?.documents) {
        get().setDocuments(result.documents as ScannedDocument[]);
      }
      if (stepId === "compute_form_1040" && result?.form1040Text) {
        get().setForm1040Text(result.form1040Text as string);
        set({ activeTab: "form1040" });
      }
      if (stepId === "find_tax_professionals" && result?.cpas) {
        get().setCPAs(result.cpas as CPACardData[]);
      }
      if ((stepId === "send_tax_report" || stepId === "save_report_snapshot") && result?.messageIds) {
        get().setSMSSent(result.messageIds as string[]);
      }

      // Clear human input when the ask_human step completes
      if (stepId.startsWith("ask_human")) {
        set({ humanInputPending: null });
      }

      set({
        steps: get().steps.map(s =>
          s.stepId === stepId
            ? { ...s, status: "complete", durationMs: event.durationMs as number, message: "Done", result: event.result }
            : s
        ),
      });

    } else if (type === "step:error" && stepId) {
      set({
        status: "error",
        steps: get().steps.map(s =>
          s.stepId === stepId
            ? { ...s, status: "error", error: event.error as string, message: (event.error as string) ?? "Error" }
            : s
        ),
      });

    } else if (type === "pipeline:waiting") {
      if (event.runId && !get().runId) set({ runId: event.runId as string });
      set({
        humanInputPending: {
          runId:     event.runId as string,
          stepId:    event.stepId as string,
          question:  event.question as string,
          options:   event.options as string[] | undefined,
          stepLabel: event.stepLabel as string,
        },
      });

    } else if (type === "pipeline:done") {
      set({ status: "complete", totalMs: (event.totalMs as number) ?? null, humanInputPending: null });
    }
  },

  clearHumanInput: () => set({ humanInputPending: null }),

  setDocuments: (docs) => set({ documents: docs }),
  setFormData:  (data) => set({ formData: data }),
  updateFormField: (field, value) => {
    const { formData } = get();
    if (!formData) return;
    set({ formData: { ...formData, [field]: value } });
  },
  setForm1040Text: (text) => set({ form1040Text: text }),
  setCPAs:      (cpas) => set({ cpas }),
  setSMSSent:   (ids)  => set({ smsSent: true, smsMessageIds: ids }),
  setConfig:    (config) => set({ config, configLoaded: true }),
  loadHistory:  (history) => set({ history }),

  reset: () => set({
    status: "idle", runId: null, startedAt: null,
    steps: [], totalMs: null, humanInputPending: null,
    documents: [], formData: null, form1040Text: null,
    cpas: [], smsSent: false, smsMessageIds: [],
    activeTab: "pipeline",
  }),
}));
