"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { CATALOGUE_BY_KEY, getProfile } from "@valuation/engine";
import { requireAdmin, changePassword } from "@/lib/auth";
import {
  assumption,
  branding,
  client,
  comparable,
  db,
  engagement,
  extractionRow,
  intakeLink,
  monthlyFinancial,
  openItemResolution,
  researchProposal,
  source,
  upload,
  profileDefault,
} from "@/lib/db";
import { audit, diffEntries } from "@/lib/audit";
import { createIntakeLink } from "@/lib/links";
import { createRun } from "@/lib/runs";
import { researchComparables, researchMacro } from "@/lib/research";
import { extractUpload } from "@/lib/extraction";
import { storeFile } from "@/lib/storage";

const path = (id: string, tab = "") => `/admin/engagements/${id}${tab ? `/${tab}` : ""}`;
const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

/* ---------------- Engagements ---------------- */

export async function createEngagement(fd: FormData) {
  const me = await requireAdmin();
  const name = strOrNull(fd.get("client"));
  if (!name) redirect("/admin?e=Client%20name%20is%20required");
  const [c] = await db().insert(client).values({ name: name!, segment: strOrNull(fd.get("segment")) }).returning();
  const [e] = await db()
    .insert(engagement)
    .values({
      clientId: c!.id,
      title: strOrNull(fd.get("title")) ?? "Advisory valuation",
      profileKey: getProfile(strOrNull(fd.get("profile_key"))).key,
      purpose: strOrNull(fd.get("purpose")),
      valuationDate: strOrNull(fd.get("valuation_date")),
      feeAmount: strOrNull(fd.get("fee")),
    })
    .returning();
  await audit({ engagementId: e!.id, actor: me.email, action: "create", entity: "engagement", entityId: e!.id, newValue: { client: name } });
  redirect(path(e!.id));
}

export async function updateEngagement(id: string, fd: FormData) {
  const me = await requireAdmin();
  const [prev] = await db().select().from(engagement).where(eq(engagement.id, id));
  if (!prev) return;
  const next = {
    title: strOrNull(fd.get("title")) ?? prev.title,
    profileKey: getProfile(strOrNull(fd.get("profile_key")) ?? prev.profileKey).key,
    purpose: strOrNull(fd.get("purpose")),
    scope: strOrNull(fd.get("scope")),
    valuationDate: strOrNull(fd.get("valuation_date")),
    standardOfValue: ["fair_market_value", "investment_value", "fair_value"].includes(String(fd.get("standard_of_value"))) ? String(fd.get("standard_of_value")) : prev.standardOfValue,
    premise: ["going_concern", "orderly_liquidation", "forced_liquidation"].includes(String(fd.get("premise"))) ? String(fd.get("premise")) : prev.premise,
    basis: fd.get("basis") === "minority" ? "minority" : "control",
    discountRateMethod: fd.get("discount_rate_method") === "egp_tbill" ? "egp_tbill" : "usd_buildup",
    feeAmount: strOrNull(fd.get("fee")),
    feeCurrency: String(fd.get("fee_currency") ?? "USD"),
    presentationCurrency: String(fd.get("presentation_currency") ?? prev.presentationCurrency),
    crossCheckCurrency: String(fd.get("cross_check_currency") ?? prev.crossCheckCurrency),
    language: String(fd.get("language") ?? prev.language),
    market: String(fd.get("market") ?? prev.market),
  };
  await db().update(engagement).set({ ...next, updatedAt: new Date() }).where(eq(engagement.id, id));
  await audit(diffEntries({ engagementId: id, actor: me.email, action: "update", entity: "engagement", entityId: id }, prev as never, next));
  revalidatePath(path(id));
}

/* ---------------- Intake links ---------------- */

export async function generateLink(id: string): Promise<{ url: string }> {
  const me = await requireAdmin();
  const { token } = await createIntakeLink(id);
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  await audit({ engagementId: id, actor: me.email, action: "create", entity: "intake_link" });
  revalidatePath(path(id));
  return { url: `${proto}://${host}/intake/${token}` };
}

export async function revokeLinks(id: string) {
  const me = await requireAdmin();
  await db().update(intakeLink).set({ revokedAt: new Date() }).where(and(eq(intakeLink.engagementId, id), isNull(intakeLink.revokedAt)));
  await audit({ engagementId: id, actor: me.email, action: "revoke", entity: "intake_link" });
  revalidatePath(path(id));
}

export async function reopenIntake(id: string) {
  const me = await requireAdmin();
  await db().update(intakeLink).set({ locked: false }).where(and(eq(intakeLink.engagementId, id), isNull(intakeLink.revokedAt)));
  await db().update(engagement).set({ status: "intake_open" }).where(eq(engagement.id, id));
  await audit({ engagementId: id, actor: me.email, action: "reopen", entity: "intake_link" });
  revalidatePath(path(id));
}

/* ---------------- Assumptions & sources ---------------- */

export async function saveAssumption(
  engagementId: string,
  key: string,
  p: { value: number | null; sourceId: string | null; asOf: string | null; confirmed: boolean; rationale?: string | null; reason?: string | null },
) {
  const me = await requireAdmin();
  const entry = CATALOGUE_BY_KEY[key];
  if (!entry) throw new Error("Unknown assumption");
  if (entry.kind === "market" && p.confirmed && p.value !== null && !p.sourceId)
    return { ok: false, error: "Market data needs a cited source before it can be confirmed." };
  const [prev] = await db().select().from(assumption).where(and(eq(assumption.engagementId, engagementId), eq(assumption.key, key)));
  const v = {
    engagementId,
    key,
    label: entry.label,
    unit: entry.unit,
    category: (entry.section === "macro" ? "macro" : entry.section === "scenarios" ? "scenario" : entry.section === "adjustments" ? "adjustment" : entry.kind === "market" ? "market" : "model") as "macro",
    value: p.value === null ? null : String(p.value),
    sourceId: p.sourceId,
    asOfDate: p.asOf,
    confirmed: p.confirmed,
    isPlaceholder: false,
    rationale: p.rationale ?? prev?.rationale ?? null,
    updatedBy: me.email,
    updatedAt: new Date(),
  };
  await db().insert(assumption).values(v).onConflictDoUpdate({ target: [assumption.engagementId, assumption.key], set: v });
  await audit({
    engagementId,
    actor: me.email,
    action: "update",
    entity: "assumption",
    entityId: key,
    field: key,
    oldValue: prev ? { value: prev.value, source: prev.sourceId, asOf: prev.asOfDate, confirmed: prev.confirmed } : null,
    newValue: { value: v.value, source: v.sourceId, asOf: v.asOfDate, confirmed: v.confirmed },
    reason: p.reason ?? null,
  });
  revalidatePath(path(engagementId), "layout");
  return { ok: true };
}

export async function clearAssumption(engagementId: string, key: string) {
  const me = await requireAdmin();
  const [prev] = await db().select().from(assumption).where(and(eq(assumption.engagementId, engagementId), eq(assumption.key, key)));
  await db().delete(assumption).where(and(eq(assumption.engagementId, engagementId), eq(assumption.key, key)));
  await audit({ engagementId, actor: me.email, action: "delete", entity: "assumption", entityId: key, field: key, oldValue: prev ? { value: prev.value } : null });
  revalidatePath(path(engagementId), "layout");
}

export async function addSource(
  engagementId: string,
  p: { title: string; publisher: string | null; url: string | null; publishedDate: string | null; excerpt: string | null; kind: "macro" | "transaction" | "listed" | "method" | "client_document" },
) {
  const me = await requireAdmin();
  if (!p.title.trim()) return { ok: false as const, error: "Title is required." };
  if (!p.publishedDate) return { ok: false as const, error: "Publication or as-of date is required." };
  if (p.url && !/^https?:\/\//i.test(p.url)) return { ok: false as const, error: "URL must start with http(s)://" };
  const [s] = await db()
    .insert(source)
    .values({ engagementId, kind: p.kind, title: p.title.trim(), publisher: p.publisher, url: p.url, publishedDate: p.publishedDate, excerpt: p.excerpt, retrievedBy: "admin", accepted: true })
    .returning();
  await audit({ engagementId, actor: me.email, action: "create", entity: "source", entityId: s!.id, newValue: p });
  revalidatePath(path(engagementId), "layout");
  return { ok: true as const, id: s!.id };
}

export async function acceptProposal(id: string, override?: { value?: number | null; asOf?: string | null }) {
  const me = await requireAdmin();
  const [p] = await db().select().from(researchProposal).where(eq(researchProposal.id, id));
  if (!p || p.status !== "pending") return;
  const payload = p.payload as Record<string, unknown>;
  if (p.sourceId) await db().update(source).set({ accepted: true }).where(eq(source.id, p.sourceId));
  if (p.kind === "macro" && p.targetKey) {
    await saveAssumption(p.engagementId, p.targetKey, {
      value: override?.value ?? (payload.value as number),
      sourceId: p.sourceId,
      asOf: override?.asOf ?? (payload.asOf as string | null) ?? null,
      confirmed: true,
      reason: "Accepted from live research",
    });
  } else if (p.kind === "comparable" && p.sourceId) {
    const c = payload as Record<string, never>;
    const [row] = await db()
      .insert(comparable)
      .values({
        engagementId: p.engagementId,
        kind: c.kind === "listed" ? "listed" : "transaction",
        name: String(c.name),
        country: c.country ?? null,
        dealDate: typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null,
        description: c.description ?? null,
        evUsdM: c.ev_usd_m === null || c.ev_usd_m === undefined ? null : String(c.ev_usd_m),
        evToEbitda: c.ev_to_ebitda === null || c.ev_to_ebitda === undefined ? null : String(c.ev_to_ebitda),
        evToRevenue: c.ev_to_revenue === null || c.ev_to_revenue === undefined ? null : String(c.ev_to_revenue),
        priceToSde: c.price_to_sde === null || c.price_to_sde === undefined ? null : String(c.price_to_sde),
        sourceId: p.sourceId,
      })
      .returning();
    await audit({ engagementId: p.engagementId, actor: me.email, action: "create", entity: "comparable", entityId: row!.id, newValue: { name: c.name } });
  }
  await db().update(researchProposal).set({ status: "accepted" }).where(eq(researchProposal.id, id));
  revalidatePath(path(p.engagementId), "layout");
}

export async function rejectProposal(id: string) {
  const me = await requireAdmin();
  const [p] = await db().update(researchProposal).set({ status: "rejected" }).where(eq(researchProposal.id, id)).returning();
  if (p) {
    await audit({ engagementId: p.engagementId, actor: me.email, action: "reject", entity: "research_proposal", entityId: id });
    revalidatePath(path(p.engagementId), "layout");
  }
}

export async function runResearch(engagementId: string, kind: "macro" | "comparables") {
  const me = await requireAdmin();
  const entity = kind === "macro" ? "macro" : "comparables";
  await audit({ engagementId, actor: me.email, action: "research_started", entity });
  // Web research takes several minutes: run it after the response is sent.
  after(async () => {
    try {
      if (kind === "macro") await researchMacro(engagementId, me.email);
      else await researchComparables(engagementId, me.email);
    } catch (e) {
      await audit({ engagementId, actor: me.email, action: "research", entity, newValue: { error: (e as Error).message } });
    }
  });
  revalidatePath(path(engagementId), "layout");
  return { ok: true as const };
}

/* ---------------- Comparables ---------------- */

export async function addComparable(engagementId: string, fd: FormData) {
  const me = await requireAdmin();
  const sourceId = strOrNull(fd.get("source_id"));
  if (!sourceId) return { ok: false, error: "Every comparable needs a cited source." };
  const [s] = await db().select().from(source).where(eq(source.id, sourceId));
  if (!s || (s.engagementId && s.engagementId !== engagementId)) return { ok: false, error: "Unknown source." };
  const e = numOrNull(fd.get("ev_ebitda"));
  const r = numOrNull(fd.get("ev_revenue"));
  const sde = numOrNull(fd.get("price_sde"));
  if (e === null && r === null && sde === null) return { ok: false, error: "Enter at least one multiple." };
  const [row] = await db()
    .insert(comparable)
    .values({
      engagementId,
      kind: fd.get("kind") === "listed" ? "listed" : "transaction",
      name: String(fd.get("name") ?? "").trim() || "Unnamed",
      country: strOrNull(fd.get("country")),
      dealDate: strOrNull(fd.get("date")),
      description: strOrNull(fd.get("description")),
      evToEbitda: e === null ? null : String(e),
      evToRevenue: r === null ? null : String(r),
      priceToSde: sde === null ? null : String(sde),
      sourceId,
    })
    .returning();
  await audit({ engagementId, actor: me.email, action: "create", entity: "comparable", entityId: row!.id, newValue: { name: row!.name, e, r, sde } });
  revalidatePath(path(engagementId, "comparables"));
  return { ok: true };
}

export async function setComparableIncluded(engagementId: string, id: string, included: boolean, reason: string | null) {
  const me = await requireAdmin();
  await db()
    .update(comparable)
    .set({ included, exclusionReason: included ? null : reason })
    .where(and(eq(comparable.id, id), eq(comparable.engagementId, engagementId)));
  await audit({ engagementId, actor: me.email, action: "update", entity: "comparable", entityId: id, field: "included", newValue: included, reason });
  revalidatePath(path(engagementId, "comparables"));
}

export async function deleteComparable(engagementId: string, id: string) {
  const me = await requireAdmin();
  await db().delete(comparable).where(and(eq(comparable.id, id), eq(comparable.engagementId, engagementId)));
  await audit({ engagementId, actor: me.email, action: "delete", entity: "comparable", entityId: id });
  revalidatePath(path(engagementId, "comparables"));
}

/* ---------------- Valuation runs & open items ---------------- */

export async function runValuationAction(engagementId: string) {
  const me = await requireAdmin();
  await createRun(engagementId, me.email);
  revalidatePath(path(engagementId), "layout");
}

export async function waiveOpenItem(engagementId: string, itemKey: string, reason: string) {
  const me = await requireAdmin();
  if (reason.trim().length < 10) return { ok: false, error: "Give a reason of at least 10 characters." };
  await db()
    .insert(openItemResolution)
    .values({ engagementId, itemKey, resolution: "waived", reason: reason.trim(), resolvedBy: me.email })
    .onConflictDoUpdate({ target: [openItemResolution.engagementId, openItemResolution.itemKey], set: { reason: reason.trim(), resolvedBy: me.email, resolvedAt: new Date() } });
  await audit({ engagementId, actor: me.email, action: "waive", entity: "open_item", entityId: itemKey, reason });
  revalidatePath(path(engagementId), "layout");
  return { ok: true };
}

export async function unwaiveOpenItem(engagementId: string, itemKey: string) {
  const me = await requireAdmin();
  await db().delete(openItemResolution).where(and(eq(openItemResolution.engagementId, engagementId), eq(openItemResolution.itemKey, itemKey)));
  await audit({ engagementId, actor: me.email, action: "unwaive", entity: "open_item", entityId: itemKey });
  revalidatePath(path(engagementId), "layout");
}

/* ---------------- Uploads & extraction ---------------- */

export async function reextract(engagementId: string, uploadId: string) {
  await requireAdmin();
  await extractUpload(uploadId);
  revalidatePath(path(engagementId, "uploads"));
}

export async function confirmExtraction(
  engagementId: string,
  uploadId: string,
  rows: { id: string; accept: boolean; lineItem: string | null; channel: string | null; unitId: string | null; period: string | null; amount: number | null }[],
) {
  const me = await requireAdmin();
  const [u] = await db().select().from(upload).where(and(eq(upload.id, uploadId), eq(upload.engagementId, engagementId)));
  if (!u) return { ok: false, error: "Upload not found" };
  let n = 0;
  for (const r of rows) {
    await db()
      .update(extractionRow)
      .set({ decision: r.accept ? "accept" : "reject", proposedLineItem: (r.lineItem as never) ?? null, proposedChannel: (r.channel as never) ?? null, proposedUnitId: r.unitId, period: r.period, amount: r.amount === null ? null : String(r.amount) })
      .where(and(eq(extractionRow.id, r.id), eq(extractionRow.uploadId, uploadId)));
    if (!r.accept || !r.lineItem || !r.period || r.amount === null) continue;
    if (r.lineItem !== "head_office" && !r.unitId) continue;
    if (["depreciation", "interest", "tax"].includes(r.lineItem)) continue; // below EBITDA: kept for reference only
    const unitId = r.lineItem === "head_office" ? null : r.unitId;
    const channel = r.lineItem === "revenue" ? (r.channel ?? "dine_in") : null;
    const period = `${r.period.slice(0, 7)}-01`;
    const where = and(
      eq(monthlyFinancial.engagementId, engagementId),
      unitId ? eq(monthlyFinancial.unitId, unitId) : isNull(monthlyFinancial.unitId),
      eq(monthlyFinancial.period, period),
      eq(monthlyFinancial.lineItem, r.lineItem as "revenue"),
      channel ? eq(monthlyFinancial.channel, channel as "dine_in") : isNull(monthlyFinancial.channel),
    );
    const [existing] = await db().select().from(monthlyFinancial).where(where);
    if (existing) {
      await db().update(monthlyFinancial).set({ amountEgp: String(r.amount), origin: "extraction", confirmed: true, uploadId, updatedAt: new Date() }).where(eq(monthlyFinancial.id, existing.id));
    } else {
      await db().insert(monthlyFinancial).values({ engagementId, unitId, period, lineItem: r.lineItem as "revenue", channel: channel as "dine_in" | null, amountEgp: String(r.amount), origin: "extraction", confirmed: true, uploadId });
    }
    n++;
  }
  await db().update(upload).set({ status: "confirmed" }).where(eq(upload.id, uploadId));
  await audit({ engagementId, actor: me.email, action: "confirm", entity: "upload", entityId: uploadId, newValue: { figuresWritten: n } });
  revalidatePath(path(engagementId), "layout");
  return { ok: true, written: n };
}

/* ---------------- Settings ---------------- */

export async function saveBranding(fd: FormData) {
  const me = await requireAdmin();
  const [prev] = await db().select().from(branding).where(eq(branding.id, 1));
  const hex = (v: FormDataEntryValue | null, d: string) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : d);
  const next: Record<string, unknown> = {
    advisorName: String(fd.get("advisor_name") ?? "").trim() || prev?.advisorName,
    firmName: String(fd.get("firm_name") ?? "").trim() || prev?.firmName,
    primaryColor: hex(fd.get("primary_color"), prev?.primaryColor ?? "#1F2A44"),
    accentColor: hex(fd.get("accent_color"), prev?.accentColor ?? "#8C6D3F"),
    neutralColor: hex(fd.get("neutral_color"), prev?.neutralColor ?? "#5B6472"),
    typeface: String(fd.get("typeface") ?? prev?.typeface ?? "IBM Plex Sans"),
    footerText: String(fd.get("footer_text") ?? prev?.footerText ?? ""),
    disclaimerText: String(fd.get("disclaimer_text") ?? prev?.disclaimerText ?? ""),
    contactEmail: strOrNull(fd.get("contact_email")),
  };
  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.type !== "image/png" || logo.size > 2_000_000) redirect("/admin/settings?e=Logo%20must%20be%20a%20PNG%20under%202%20MB");
    next.logoUrl = await storeFile(`branding/logo.png`, new Uint8Array(await logo.arrayBuffer()), "image/png");
  }
  if (!String(next.disclaimerText).toLowerCase().includes("not a certified valuation"))
    redirect("/admin/settings?e=The%20disclaimer%20must%20state%20that%20this%20is%20not%20a%20certified%20valuation%20by%20a%20licensed%20valuer");
  await db().update(branding).set({ ...next, updatedAt: new Date() }).where(eq(branding.id, 1));
  await audit(diffEntries({ actor: me.email, action: "update", entity: "branding" }, (prev ?? {}) as never, next));
  revalidatePath("/admin", "layout");
  redirect("/admin/settings?ok=1");
}

export async function changePasswordAction(fd: FormData) {
  const me = await requireAdmin();
  const next = String(fd.get("next") ?? "");
  if (next !== String(fd.get("confirm") ?? "")) redirect("/admin/settings?e=New%20passwords%20do%20not%20match");
  const r = await changePassword(me.sub, String(fd.get("current") ?? ""), next);
  redirect(r.ok ? "/admin/settings?ok=password" : `/admin/settings?e=${encodeURIComponent(r.error ?? "Failed")}`);
}

/* ---------------- Industry profile defaults ---------------- */

export async function saveProfileDefault(profileKey: string, assumptionKey: string, value: number | null) {
  const me = await requireAdmin();
  const p = getProfile(profileKey);
  if (!CATALOGUE_BY_KEY[assumptionKey]) return { ok: false, error: "Unknown assumption" };
  const [prev] = await db().select().from(profileDefault).where(and(eq(profileDefault.profileKey, p.key), eq(profileDefault.assumptionKey, assumptionKey)));
  if (value === null) {
    await db().delete(profileDefault).where(and(eq(profileDefault.profileKey, p.key), eq(profileDefault.assumptionKey, assumptionKey)));
  } else {
    if (!Number.isFinite(value)) return { ok: false, error: "Enter a number" };
    await db()
      .insert(profileDefault)
      .values({ profileKey: p.key, assumptionKey, value: String(value), updatedBy: me.email })
      .onConflictDoUpdate({ target: [profileDefault.profileKey, profileDefault.assumptionKey], set: { value: String(value), updatedBy: me.email, updatedAt: new Date() } });
  }
  await audit({ actor: me.email, action: value === null ? "reset" : "update", entity: "profile_default", entityId: `${p.key}:${assumptionKey}`, field: assumptionKey, oldValue: prev ? prev.value : null, newValue: value });
  revalidatePath("/admin/settings/profiles");
  return { ok: true };
}
