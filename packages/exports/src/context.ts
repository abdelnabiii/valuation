import type { EngineInput, EngineResult } from "@valuation/engine";

/** Everything an export needs. Built by the web app from one valuation_run. */
export interface ExportContext {
  runId: string;
  generatedAt: string; // ISO timestamp
  branding: {
    advisorName: string;
    firmName: string;
    logoPng?: Uint8Array | null; // PNG bytes
    primaryColor: string; // "#1F2A44"
    accentColor: string;
    neutralColor: string;
    typeface: string;
    footerText: string;
    disclaimerText: string;
    contactEmail?: string | null;
  };
  engagement: {
    clientName: string;
    legalName?: string | null;
    title: string;
    purpose?: string | null;
    scope?: string | null;
    valuationDate: string;
    standardOfValue: string;
    premise: string;
    basis: string;
    modelCurrency: string; // EGP
    crossCheckCurrency: string; // USD
    language: string;
    market: string;
  };
  /** Free-text business facts from intake, used in narrative sections. Never invented. */
  profile: {
    description?: string | null;
    founded?: string | null;
    concept?: string | null;
    brandAssets?: string | null;
    growthPlan?: string | null;
    growthBudget?: number | null;
    pendingOffers?: string | null;
  };
  sources: {
    id: string;
    title: string;
    publisher?: string | null;
    url?: string | null;
    publishedDate?: string | null;
    accessedAt: string;
    kind: string;
  }[];
  input: EngineInput;
  result: EngineResult;
  /** Assumption change history (optional; shown in the Assumption Log). */
  auditTrail?: { at: string; actor: string; key: string; oldValue: unknown; newValue: unknown; reason?: string | null }[];
}

export const SECTION_LABELS: Record<string, string> = {
  macro: "Macro",
  discount_rate: "Discount rate",
  normalization: "Normalization",
  unit_economics: "Unit economics",
  forecast: "Forecast",
  scenarios: "Scenarios",
  multiples: "Multiples",
  asset_floor: "Asset floor",
  adjustments: "Adjustments",
  reconciliation: "Reconciliation",
};
