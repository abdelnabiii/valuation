import "server-only";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { runValuation, type EngineInput, type EngineResult } from "@valuation/engine";
import { buildWorkbook, renderDeck, renderReportDocx, renderReportPdf, type ExportContext } from "@valuation/exports";
import { auditLog, client, db, engagement, exportFile, source, valuationRun } from "./db";
import { buildEngineInput } from "./engine-input";
import { audit } from "./audit";
import { getBranding } from "./branding";
import { loadIntake } from "./intake/server";
import { PROFILE_KPIS } from "./intake/config";
import { getProfile } from "@valuation/engine";
import { readStoredFile, storeFile } from "./storage";

// Charts are rasterised server-side; point resvg at the bundled font.
process.env.VALUATION_CHART_FONT_DIRS ??= join(process.cwd(), "fonts");

const stableStringify = (v: unknown): string =>
  JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

/** Live (unsaved) calculation for previews. */
export async function preview(engagementId: string) {
  const { input, ttm } = await buildEngineInput(engagementId);
  return { input, result: runValuation(input), ttm };
}

/** Saved, immutable run. Every export is generated from one of these. */
export async function createRun(engagementId: string, actor: string) {
  const { input } = await buildEngineInput(engagementId);
  const result = runValuation(input);
  const { asOfToday: _t, ...metaNoDate } = input.meta;
  const inputHash = createHash("sha256").update(stableStringify({ ...input, meta: metaNoDate })).digest("hex");
  const [run] = await db()
    .insert(valuationRun)
    .values({
      engagementId,
      engineVersion: result.engineVersion,
      inputHash,
      inputsSnapshot: input as never,
      result: result as never,
      openItems: result.openItems as never,
      status: result.provisional ? "provisional" : "final",
      createdBy: actor,
    })
    .returning();
  await db()
    .update(engagement)
    .set({ status: result.provisional ? "provisional" : "final", updatedAt: new Date() })
    .where(eq(engagement.id, engagementId));
  await audit({ engagementId, actor, action: "run", entity: "valuation_run", entityId: run!.id, newValue: { status: run!.status, mid: result.reconciliation.roundedMid } });
  return run!;
}

export async function latestRun(engagementId: string) {
  const [r] = await db().select().from(valuationRun).where(eq(valuationRun.engagementId, engagementId)).orderBy(desc(valuationRun.createdAt)).limit(1);
  return r ?? null;
}

export async function exportContext(runId: string): Promise<ExportContext> {
  const d = db();
  const [row] = await d
    .select({ r: valuationRun, e: engagement, c: client })
    .from(valuationRun)
    .innerJoin(engagement, eq(engagement.id, valuationRun.engagementId))
    .innerJoin(client, eq(client.id, engagement.clientId))
    .where(eq(valuationRun.id, runId));
  if (!row) throw new Error("Run not found");
  const { r, e, c } = row;
  const input = r.inputsSnapshot as EngineInput;
  const result = r.result as EngineResult;
  const b = await getBranding();
  const state = await loadIntake(e.id);
  const ids = new Set<string>([
    ...result.assumptions.map((a) => a.sourceId).filter((x): x is string => !!x),
    ...input.comparables.map((x) => x.sourceId),
  ]);
  const srcs = ids.size
    ? await d.select().from(source).where(and(inArray(source.id, [...ids]), or(eq(source.engagementId, e.id), isNull(source.engagementId))))
    : [];
  const trail = await d
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.engagementId, e.id), eq(auditLog.entity, "assumption")))
    .orderBy(desc(auditLog.at))
    .limit(300);
  let logo: Uint8Array | null = null;
  if (b.logoUrl) {
    try {
      logo = new Uint8Array(await readStoredFile(b.logoUrl));
    } catch {
      logo = null;
    }
  }
  const biz = state.sections.business ?? {};
  const growth = state.sections.growth ?? {};
  const offers = state.sections.offers ?? {};
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    runId: r.id,
    generatedAt: new Date().toISOString(),
    branding: {
      advisorName: b.advisorName,
      firmName: b.firmName,
      logoPng: logo,
      primaryColor: b.primaryColor,
      accentColor: b.accentColor,
      neutralColor: b.neutralColor,
      typeface: b.typeface,
      footerText: b.footerText,
      disclaimerText: b.disclaimerText,
      contactEmail: b.contactEmail,
    },
    engagement: {
      clientName: input.meta.companyName || c.name,
      legalName: s(biz.legal_name) ?? c.legalName,
      title: e.title,
      purpose: e.purpose ?? s(state.sections.purpose?.purpose),
      scope: e.scope,
      valuationDate: input.meta.valuationDate,
      standardOfValue: e.standardOfValue,
      premise: e.premise,
      basis: e.basis,
      modelCurrency: e.modelCurrency,
      crossCheckCurrency: e.crossCheckCurrency,
      language: e.language,
      market: e.market,
    },
    profile: {
      description: s(biz.description),
      founded: biz.founded ? String(biz.founded) : null,
      concept: s(biz.concept),
      brandAssets: [s(state.sections.brand?.trademark_detail), s(state.sections.brand?.recipes_ip), s(state.sections.brand?.wholesale_contracts)].filter(Boolean).join(" ") || null,
      growthPlan: s(growth.plan),
      growthBudget: typeof growth.budget === "number" ? growth.budget : null,
      pendingOffers: offers.has_offers === "yes" ? s(offers.offers_detail) : null,
      kpis: (PROFILE_KPIS[getProfile(e.profileKey).key] ?? [])
        .map((f) => {
          const v = state.sections.operations?.[f.key];
          if (v === null || v === undefined || v === "") return null;
          const value =
            typeof v === "number"
              ? f.type === "pct"
                ? `${(v * 100).toFixed(1)}%`
                : f.type === "money"
                  ? `EGP ${Math.round(v).toLocaleString("en-US")}`
                  : v.toLocaleString("en-US")
              : String(v);
          return { label: f.label, value };
        })
        .filter((x): x is { label: string; value: string } => x !== null),
    },
    sources: srcs.map((x) => ({
      id: x.id,
      title: x.title,
      publisher: x.publisher,
      url: x.url,
      publishedDate: x.publishedDate,
      accessedAt: x.accessedAt.toISOString(),
      kind: x.kind,
    })),
    input,
    result,
    auditTrail: trail.map((t) => ({ at: t.at.toISOString().slice(0, 16).replace("T", " "), actor: t.actor, key: t.field ?? t.entityId ?? "", oldValue: t.oldValue, newValue: t.newValue, reason: t.reason })),
  };
}

export const EXPORT_TYPES = {
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel model" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word report" },
  pdf: { mime: "application/pdf", label: "PDF report" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "Investor deck" },
} as const;
export type ExportKind = keyof typeof EXPORT_TYPES;

export async function generateExport(runId: string, kind: ExportKind, actor: string) {
  const ctx = await exportContext(runId);
  let bytes: Uint8Array;
  if (kind === "xlsx") bytes = (await buildWorkbook(ctx)).buffer;
  else if (kind === "docx") bytes = await renderReportDocx(ctx);
  else if (kind === "pdf") bytes = await renderReportPdf(ctx);
  else bytes = await renderDeck(ctx);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const safe = ctx.engagement.clientName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "valuation";
  const status = ctx.result.provisional ? "PROVISIONAL" : "FINAL";
  const filename = `${safe}_${ctx.engagement.valuationDate}_${status}_${runId.slice(0, 8)}.${kind}`;
  let url = "";
  try {
    url = await storeFile(`exports/${runId}/${filename}`, bytes, EXPORT_TYPES[kind].mime);
  } catch (e) {
    console.error("export storage failed", e);
  }
  const [run] = await db().select({ engagementId: valuationRun.engagementId }).from(valuationRun).where(eq(valuationRun.id, runId));
  if (url) await db().insert(exportFile).values({ runId, kind, blobUrl: url, checksum });
  await audit({ engagementId: run?.engagementId, actor, action: "export", entity: "export_file", entityId: runId, newValue: { kind, checksum: checksum.slice(0, 16) } });
  void sql;
  return { bytes, filename, mime: EXPORT_TYPES[kind].mime };
}
