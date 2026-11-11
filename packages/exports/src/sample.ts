import type { EngineInput } from "@valuation/engine";
import { runValuation } from "@valuation/engine";
import { handExample } from "../../engine/fixtures/hand-example";
import type { ExportContext } from "./context";

/** Fictional context used by tests and local previews. */
export function sampleContext(base: EngineInput = handExample): ExportContext {
  const input = structuredClone(base);
  return {
    runId: "00000000-0000-0000-0000-000000000000",
    generatedAt: "2026-01-05T10:00:00Z",
    branding: {
      advisorName: "Your Name",
      firmName: "Independent Valuation Advisor",
      logoPng: null,
      primaryColor: "#1F2A44",
      accentColor: "#8C6D3F",
      neutralColor: "#5B6472",
      typeface: "IBM Plex Sans",
      footerText: "Confidential. Prepared for the addressee only.",
      disclaimerText:
        "This is an advisory valuation prepared by an independent advisor. It is not a certified valuation by a licensed valuer and must not be relied on as such.",
      contactEmail: null,
    },
    engagement: {
      clientName: input.meta.companyName,
      legalName: null,
      title: "Advisory valuation",
      purpose: "Fundraising",
      scope: "100% of equity",
      valuationDate: input.meta.valuationDate,
      standardOfValue: "fair_market_value",
      premise: "going_concern",
      basis: "control",
      modelCurrency: "EGP",
      crossCheckCurrency: "USD",
      language: "en",
      market: "EG",
    },
    profile: {
      description: "Fictional two-unit specialty coffee operator used for testing.",
      founded: "2022",
      concept: "Specialty coffee bar with delivery and wholesale",
      brandAssets: "Registered trademark (fictional)",
      growthPlan: "Open two units over the next two years",
      growthBudget: 8_000_000,
      pendingOffers: null,
    },
    sources: [
      { id: "src-test", title: "Test source (fictional)", publisher: "Test", url: null, publishedDate: "2025-12-15", accessedAt: "2025-12-15T00:00:00Z", kind: "macro" },
    ],
    input,
    result: runValuation(input),
  };
}
