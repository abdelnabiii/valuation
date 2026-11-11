import type { EngineInput } from "../src/types";
import { handExample } from "./hand-example";

/** Fictional example companies for each non-F&B forecast model (tests only). */
const A = (value: number, sourced = false) => ({ value, confirmed: true, sourceId: sourced ? "src-test" : null, asOf: sourced ? "2025-12-15" : null });

function base(profileKey: string): EngineInput {
  const i = structuredClone(handExample);
  i.meta.profileKey = profileKey;
  for (const s of ["base", "upside", "downside"]) for (let y = 1; y <= 5; y++) delete i.assumptions[`dcf.${s}.new_units_y${y}`];
  i.growthPlan = { newUnitsByYear: [0, 0, 0, 0, 0] };
  for (const k of ["rec.w_dcf", "rec.w_multiples", "rec.w_asset"]) delete i.assumptions[k];
  return i;
}

export function operatingExample(): EngineInput {
  const i = base("manufacturing");
  i.meta.companyName = "Reference Manufacturing (fictional)";
  i.growthPlan.revenueGrowthNominal = [0.2, 0.15, 0.12, 0.1, 0.08];
  i.operations.topCustomerShare = 0.35;
  delete i.assumptions["dcf.nwc_pct"];
  for (const s of ["base", "upside", "downside"]) delete i.assumptions[`dcf.${s}.sss_real`];
  return i;
}

export function realEstateExample(): EngineInput {
  const i = base("real_estate");
  i.meta.companyName = "Reference Properties (fictional)";
  i.navAssets = [
    { name: "Office building", kind: "building", marketValue: 30_000_000, bookValue: 18_000_000, sourceNote: "Appraisal (fictional)" },
    { name: "Retail units", kind: "investment_property", marketValue: 20_000_000, bookValue: 12_000_000, sourceNote: "Appraisal (fictional)" },
  ];
  i.assumptions["nav.cap_rate"] = A(0.1, true);
  i.assumptions["nav.cap_rate_spread"] = A(0.01);
  return i;
}

export function startupExample(): EngineInput {
  const i = base("startup");
  i.meta.companyName = "Reference Startup (fictional)";
  i.meta.monthsOfHistory = 14;
  i.earlyStage = { exitRevenue: 100_000_000, exitYears: 5, lastRoundPostMoney: 12_000_000, lastRoundDate: "2025-06-30" };
  i.assumptions["sc.base_premoney"] = A(10_000_000, true);
  i.assumptions["sc.s_team"] = A(1.25);
  i.assumptions["round.adjustment"] = A(-0.1);
  return i;
}
