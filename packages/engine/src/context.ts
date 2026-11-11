import { CATALOGUE, CATALOGUE_BY_KEY, STALE_DAYS, isRelevant } from "./catalogue";
import { getProfile, type ProfileDef } from "./profiles";
import { daysBetween } from "./math";
import type { EngineInput, ResolvedAssumption, ValueOrigin } from "./types";

/**
 * Resolves assumptions in priority order:
 *   1. advisor/client input (non-null value)
 *   2. value derived from client data (supplied by the step that needs it)
 *   3. judgement default from the catalogue
 *   4. missing
 * Every resolution is recorded so the UI, Excel and report show the same
 * value with the same provenance.
 */
export class Ctx {
  readonly resolved = new Map<string, ResolvedAssumption>();
  readonly profile: ProfileDef;

  constructor(readonly input: EngineInput) {
    this.profile = getProfile(input.meta.profileKey);
  }

  /** Default for a judgement assumption: admin/profile default, else catalogue default. */
  defaultFor(key: string): number | undefined {
    const pd = this.input.profileDefaults?.[key] ?? this.profile.defaults[key];
    return pd ?? CATALOGUE_BY_KEY[key]?.default;
  }

  a(key: string, derived?: number | null, note?: string): number | null {
    const cached = this.resolved.get(key);
    if (cached) return cached.value;
    const entry = CATALOGUE_BY_KEY[key];
    if (!entry) throw new Error(`Unknown assumption key: ${key}`);
    const inp = this.input.assumptions[key];

    let value: number | null = null;
    let origin: ValueOrigin = "missing";
    let confirmed = false;

    if (inp && inp.value !== null && inp.value !== undefined && Number.isFinite(inp.value)) {
      value = inp.value;
      origin = "input";
      confirmed = inp.confirmed;
    } else if (derived !== undefined && derived !== null && Number.isFinite(derived)) {
      value = derived;
      origin = "derived";
      confirmed = false;
    } else if (this.defaultFor(key) !== undefined) {
      value = this.defaultFor(key)!;
      origin = "default";
      confirmed = false;
    }

    const asOf = inp?.asOf ?? null;
    const requiresSource = entry.kind === "market";
    const stale =
      requiresSource && value !== null && origin === "input"
        ? !asOf || daysBetween(asOf, this.input.meta.asOfToday) > STALE_DAYS
        : false;

    this.resolved.set(key, {
      key,
      label: entry.label,
      unit: entry.unit,
      category: entry.kind,
      section: entry.section,
      value,
      origin,
      confirmed,
      sourceId: inp?.sourceId ?? null,
      asOf,
      stale,
      requiresSource,
      relevant: isRelevant(key, this.profile.model, this.profile.methods),
      note,
    });
    return value;
  }

  /** Same as a() but returns 0 for missing values (caller records the gap). */
  n(key: string, derived?: number | null, note?: string): number {
    return this.a(key, derived, note) ?? 0;
  }

  has(key: string): boolean {
    return this.a(key) !== null;
  }

  /** Resolve every catalogue key not yet touched, so the log is complete. */
  finalize(): ResolvedAssumption[] {
    for (const e of CATALOGUE) if (!this.resolved.has(e.key)) this.a(e.key);
    return CATALOGUE.map((e) => this.resolved.get(e.key)!);
  }
}
