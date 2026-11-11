/**
 * Engine input/output types. The engine is pure: it receives a fully
 * assembled EngineInput and returns an EngineResult. No I/O.
 *
 * All monetary amounts are nominal EGP unless the field name says otherwise.
 * Percentages are decimals (0.25 = 25%).
 */

export type Channel = "dine_in" | "delivery" | "wholesale" | "online";
export const CHANNELS: Channel[] = ["dine_in", "delivery", "wholesale", "online"];

export type CostLine =
  | "cogs"
  | "labour"
  | "rent"
  | "delivery_commission"
  | "marketing"
  | "utilities"
  | "maintenance"
  | "other_opex";
export const UNIT_COST_LINES: CostLine[] = [
  "cogs",
  "labour",
  "rent",
  "delivery_commission",
  "marketing",
  "utilities",
  "maintenance",
  "other_opex",
];

export type Scenario = "base" | "upside" | "downside";
export const SCENARIOS: Scenario[] = ["base", "upside", "downside"];

export interface AssumptionInput {
  value: number | null;
  /** ISO date the value refers to (publication / observation date). */
  asOf?: string | null;
  sourceId?: string | null;
  /** True once the advisor has accepted the value (anything not system-defaulted). */
  confirmed: boolean;
  isPlaceholder?: boolean;
}

export interface CapexItem {
  category: "fit_out" | "equipment" | "furniture" | "other";
  description?: string;
  cost: number;
  imported?: boolean;
}

export interface LeaseInput {
  yearsRemaining: number | null;
  monthlyRent: number | null;
  escalationPct: number | null;
  renewalRight: boolean | null;
  deposit: number | null;
}

export interface UnitInput {
  id: string;
  name: string;
  openedOn: string | null; // ISO date
  /** Trailing-twelve-month revenue by channel. */
  ttmRevenue: Record<Channel, number>;
  /** Trailing-twelve-month unit-level costs. */
  ttmCosts: Record<CostLine, number>;
  /** Months of data available for this unit inside the TTM window (0-12). */
  ttmMonths: number;
  /** Monthly total revenue, oldest first, with months-since-opening index. */
  monthlyRevenue: { monthIndex: number; amount: number }[];
  lease: LeaseInput | null;
  capex: CapexItem[];
}

export type AddbackKind = "owner_pay" | "one_off" | "related_party" | "non_operating";

export interface AddbackInput {
  kind: AddbackKind;
  description: string;
  /** Positive = increases EBITDA (cost added back). */
  amount: number;
}

export type BridgeKind =
  | "bank_loan"
  | "shareholder_loan"
  | "overdraft"
  | "lease_liability"
  | "deposit_paid"
  | "deposit_held"
  | "cash"
  | "other";

export interface BridgeItem {
  kind: BridgeKind;
  description: string;
  balance: number;
  currency: string; // EGP or USD
}

export interface ComparableInput {
  id: string;
  name: string;
  kind: "transaction" | "listed";
  country: string | null;
  date: string | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  priceToSde: number | null;
  sourceId: string;
  included: boolean;
}

export interface OperationsInput {
  dailyOrders: number | null;
  averageTicket: number | null;
  repeatRatePct: number | null;
  /** 1 (none) .. 5 (business cannot run without owner). */
  ownerDependencyScore: number | null;
  /** Share of COGS that is imported (beans, milk alternatives, etc). */
  importedCogsShare: number | null;
  inventoryValue: number | null;
  /** Share of revenue from the largest customer. */
  topCustomerShare?: number | null;
}

export interface NavAssetInput {
  name: string;
  kind: string;
  marketValue: number | null;
  bookValue: number | null;
  /** Who valued it and when (appraisal report, broker opinion). */
  sourceNote: string | null;
}

export interface EngineInput {
  meta: {
    companyName: string;
    valuationDate: string; // ISO
    /** Reference date for staleness checks (normally "today"). */
    asOfToday: string;
    modelCurrency: string; // "EGP"
    crossCheckCurrency: string; // "USD"
    monthsOfHistory: number;
    discountRateMethod: "usd_buildup" | "egp_tbill";
    /** Open-item keys the advisor has waived (with a recorded reason). */
    waivedOpenItems: string[];
    /** Industry profile key (see profiles.ts). Defaults to "fnb". */
    profileKey?: string;
  };
  /** Profile default values for judgement assumptions (built-in merged with admin edits). */
  profileDefaults?: Record<string, number>;
  /** Asset-heavy profiles: assets at market value (from appraisals). */
  navAssets?: NavAssetInput[];
  /** Early-stage profiles: client plan and funding history. */
  earlyStage?: {
    exitRevenue: number | null;
    exitYears: number | null;
    lastRoundPostMoney: number | null;
    lastRoundDate: string | null;
  };
  /** Client growth plan: planned new units per year, and planned nominal revenue growth per year (length 5). */
  growthPlan: { newUnitsByYear: number[]; revenueGrowthNominal?: (number | null)[] };
  units: UnitInput[];
  /** TTM head-office / central costs not allocated to units. */
  headOfficeCosts: number;
  addbacks: AddbackInput[];
  bridge: BridgeItem[];
  comparables: ComparableInput[];
  operations: OperationsInput;
  assumptions: Record<string, AssumptionInput>;
  /** Data-quality issues detected upstream (intake validation). */
  dataIssues: { key: string; message: string; severity: "blocking" | "warning" }[];
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

export type ValueOrigin = "input" | "derived" | "default" | "missing";

export interface ResolvedAssumption {
  key: string;
  label: string;
  unit: string;
  category: string;
  section: string;
  value: number | null;
  origin: ValueOrigin;
  confirmed: boolean;
  sourceId: string | null;
  asOf: string | null;
  stale: boolean;
  requiresSource: boolean;
  /** False when the assumption does not apply to this profile (hidden, no open items). */
  relevant: boolean;
  note?: string;
}

export interface NormalizationResult {
  revenue: number;
  revenueByChannel: Record<Channel, number>;
  costs: Record<CostLine | "head_office", number>;
  totalCosts: number;
  reportedEbitda: number;
  reportedMargin: number;
  addbacks: { kind: AddbackKind; description: string; amount: number }[];
  totalAddbacks: number;
  ownerPayAddback: number;
  marketManagerSalary: number;
  sde: number;
  normalizedEbitda: number;
  normalizedMargin: number;
}

export interface UnitEconomicsRow {
  id: string;
  name: string;
  monthsOpen: number | null;
  sales: number;
  annualisedSales: number;
  cogs: number;
  labour: number;
  primeCost: number;
  primeCostPct: number;
  rent: number;
  rentPct: number;
  otherCosts: number;
  fourWallEbitda: number;
  fourWallMargin: number;
  investment: number;
  paybackYears: number | null;
  mature: boolean;
  /** Avg revenue in months 1-12 / avg revenue of last 3 months (if >= 15 months). */
  observedRampY1: number | null;
}

export interface UnitEconomicsResult {
  rows: UnitEconomicsRow[];
  totals: { sales: number; fourWallEbitda: number; fourWallMargin: number; investment: number };
  newUnitMatureSales: number;
  newUnitCapex: number;
  newUnitFourWallMargin: number;
  newUnitPaybackYears: number | null;
  rampY1: number;
  rampY2: number;
  observedRampY1: number | null;
}

export interface DiscountRateResult {
  method: "usd_buildup" | "egp_tbill";
  components: { key: string; label: string; value: number }[];
  costOfEquityUsd: number;
  /** Nominal EGP rate per forecast year (1..5). */
  waccEgp: number[];
  waccEgpTerminal: number;
  waccUsd: number;
  warnings: string[];
}

export interface ForecastYear {
  year: number;
  egpInflation: number;
  priceIndex: number;
  existingRevenue: number;
  newUnitsOpened: number;
  cumulativeNewUnits: number;
  newUnitRevenue: number;
  revenue: number;
  ebitdaMargin: number;
  ebitda: number;
  da: number;
  ebit: number;
  tax: number;
  expansionCapex: number;
  maintenanceCapex: number;
  capex: number;
  deltaNwc: number;
  fcff: number;
  discountRate: number;
  cumulativeFactor: number;
  discountFactor: number;
  pv: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  years: ForecastYear[];
  sumPv: number;
  terminalFcff: number;
  terminalGrowth: number;
  tvGordon: number;
  tvExit: number;
  discountFactorEnd: number;
  pvTvGordon: number;
  pvTvExit: number;
  evGordon: number;
  evExit: number;
  ev: number;
  tvShareOfEv: number;
}

export interface DcfResult {
  available: boolean;
  reason?: string;
  scenarios: Record<Scenario, ScenarioResult> | null;
  weights: Record<Scenario, number>;
  weightedEv: number;
  usdCrossCheck: {
    fx: number[];
    fcffUsd: number[];
    evUsd: number;
    evUsdInEgp: number;
    differencePct: number;
    fxBasis: "forecast" | "ppp";
  } | null;
}

export interface MultipleStats {
  metric: "ev_ebitda" | "ev_revenue" | "price_sde";
  count: number;
  q1: number | null;
  median: number | null;
  q3: number | null;
  selected: number | null;
  base: number;
  low: number | null;
  mid: number | null;
  high: number | null;
  weight: number;
}

export interface MultiplesResult {
  available: boolean;
  reason?: string;
  stats: MultipleStats[];
  low: number;
  mid: number;
  high: number;
}

export interface AssetFloorResult {
  rows: { category: string; cost: number; resalePct: number; value: number }[];
  inventory: number;
  inventoryRecoveryPct: number;
  inventoryValue: number;
  gross: number;
  liquidationCostPct: number;
  liquidationCost: number;
  floor: number;
}

export interface AdjustmentRow {
  key: string;
  label: string;
  pct: number;
  suggestedPct: number;
  rationale: string;
}

export interface AdjustmentsResult {
  rows: AdjustmentRow[];
  combinedFactor: number;
  combinedDiscount: number;
}

export interface BridgeResult {
  rows: { kind: BridgeKind; description: string; balance: number; currency: string; balanceEgp: number; sign: 1 | -1 | 0; note?: string }[];
  netAdjustment: number;
}

export interface MethodRange {
  method: "dcf" | "multiples" | "asset" | "nav" | "income_cap" | "vc" | "scorecard" | "round";
  label: string;
  available: boolean;
  /** "ev" = enterprise value; "equity" = equity value (venture-style methods). */
  basis: "ev" | "equity";
  /** Enterprise-value equivalent (equity methods: equity less the net-debt bridge). */
  low: number;
  mid: number;
  high: number;
  /** The method's own result in its own basis. */
  nativeLow: number;
  nativeMid: number;
  nativeHigh: number;
  weight: number;
}

export interface NavResult {
  available: boolean;
  rows: { name: string; kind: string; marketValue: number | null; bookValue: number | null; sourceNote: string | null }[];
  totalMarketValue: number;
  missing: string[];
  incomeCap: { available: boolean; noi: number; capRate: number | null; spread: number; low: number; mid: number; high: number };
}

export interface EarlyStageResult {
  vc: {
    available: boolean;
    exitRevenue: number;
    exitYears: number;
    exitMultipleLow: number | null;
    exitMultiple: number | null;
    exitMultipleHigh: number | null;
    targetReturn: number;
    retention: number;
    exitValue: number;
    discountFactor: number;
    low: number;
    mid: number;
    high: number;
  };
  scorecard: { available: boolean; base: number | null; factors: { key: string; label: string; weight: number; score: number; product: number }[]; multiplier: number; value: number };
  round: { available: boolean; postMoney: number | null; date: string | null; adjustment: number; value: number };
}

export interface ReconciliationResult {
  methods: MethodRange[];
  youngCompany: boolean;
  weightsRationale: string;
  evLow: number;
  evMid: number;
  evHigh: number;
  floorApplied: boolean;
  equityLow: number;
  equityMid: number;
  equityHigh: number;
  adjustedLow: number;
  adjustedMid: number;
  adjustedHigh: number;
  roundedLow: number;
  roundedMid: number;
  roundedHigh: number;
  rounding: number;
  usdLow: number | null;
  usdMid: number | null;
  usdHigh: number | null;
}

export interface SensitivityGrid {
  key: string;
  title: string;
  rowLabel: string;
  colLabel: string;
  rows: number[];
  cols: number[];
  /** values[r][c] = base-scenario EV */
  values: number[][];
}

export interface OpenItem {
  key: string;
  category: "missing_input" | "unconfirmed_assumption" | "stale" | "missing_source" | "data_quality" | "method";
  severity: "blocking" | "warning";
  message: string;
  waived?: boolean;
}

export interface EngineResult {
  engineVersion: string;
  profile: { key: string; label: string; family: string; model: "units" | "operating" | "early_stage" | "asset_heavy"; methods: string[] };
  nav: NavResult;
  earlyStage: EarlyStageResult;
  assumptions: ResolvedAssumption[];
  normalization: NormalizationResult;
  unitEconomics: UnitEconomicsResult;
  discountRate: DiscountRateResult | null;
  dcf: DcfResult;
  multiples: MultiplesResult;
  assetFloor: AssetFloorResult;
  adjustments: AdjustmentsResult;
  bridge: BridgeResult;
  reconciliation: ReconciliationResult;
  sensitivities: SensitivityGrid[];
  openItems: OpenItem[];
  provisional: boolean;
}
