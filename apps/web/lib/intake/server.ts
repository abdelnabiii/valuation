import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import {
  addback,
  db,
  debtItem,
  intakeSection,
  lease,
  monthlyFinancial,
  unit,
  unitCapex,
  upload,
} from "../db";
import { audit, diffEntries } from "../audit";
import type { IntakeConfig } from "./config";
import { completion, parseCellKey, sectionCompletion, type IntakeState } from "./types";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const str = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Non-multi-site profiles keep their figures on one implicit "Company" unit. */
export async function ensureCompanyUnit(engagementId: string, cfg: IntakeConfig) {
  if (cfg.model === "units") return;
  const existing = await db().select({ id: unit.id }).from(unit).where(eq(unit.engagementId, engagementId));
  if (existing.length) return;
  await db().insert(unit).values({ engagementId, name: "Company", format: "company", status: "operating", sortOrder: 0 });
}

export async function loadIntake(engagementId: string, cfg?: IntakeConfig): Promise<IntakeState> {
  if (cfg) await ensureCompanyUnit(engagementId, cfg);
  const d = db();
  const [secs, units, caps, abs, debts, fins, ups] = await Promise.all([
    d.select().from(intakeSection).where(eq(intakeSection.engagementId, engagementId)),
    d.select().from(unit).where(eq(unit.engagementId, engagementId)).orderBy(unit.sortOrder),
    d.select({ c: unitCapex }).from(unitCapex).innerJoin(unit, eq(unit.id, unitCapex.unitId)).where(eq(unit.engagementId, engagementId)),
    d.select().from(addback).where(eq(addback.engagementId, engagementId)),
    d.select().from(debtItem).where(eq(debtItem.engagementId, engagementId)),
    d.select().from(monthlyFinancial).where(eq(monthlyFinancial.engagementId, engagementId)),
    d.select().from(upload).where(eq(upload.engagementId, engagementId)),
  ]);
  const leases = units.length ? await d.select().from(lease).where(inArray(lease.unitId, units.map((u) => u.id))) : [];
  const financials: Record<string, number> = {};
  for (const f of fins) {
    if (!f.confirmed) continue;
    financials[`${f.unitId ?? "ho"}|${f.lineItem}|${f.channel ?? "-"}|${f.period.slice(0, 7)}`] = Number(f.amountEgp);
  }
  return {
    sections: Object.fromEntries(secs.map((s) => [s.sectionKey, s.data as Record<string, unknown>])),
    units: units.map((u) => ({
      id: u.id,
      name: u.name,
      format: u.format,
      city: u.city,
      openedOn: u.openedOn,
      status: u.status,
      sqm: num(u.sqm),
      seats: u.seats,
    })),
    leases: Object.fromEntries(
      leases.map((l) => [
        l.unitId,
        {
          yearsRemaining: num(l.yearsRemaining),
          monthlyRent: num(l.monthlyRentEgp),
          escalationPct: num(l.escalationPct),
          escalationEveryMonths: l.escalationEveryMonths,
          renewalRight: l.renewalRight,
          renewalTerms: l.renewalTerms,
          deposit: num(l.depositEgp),
        },
      ]),
    ),
    capex: caps.map(({ c }) => ({
      id: c.id,
      unitId: c.unitId,
      category: c.category,
      description: c.description,
      cost: num(c.costEgp),
      spentOn: c.spentOn,
      imported: c.imported,
    })),
    addbacks: abs.map((a) => ({
      id: a.id,
      kind: a.kind,
      description: a.description,
      amount: num(a.amountEgp),
      recurring: a.recurring,
      evidenceNote: a.evidenceNote,
    })),
    debt: debts.map((x) => ({
      id: x.id,
      kind: x.kind,
      counterparty: x.counterparty,
      balance: num(x.balance),
      currency: x.currency,
      ratePct: num(x.ratePct),
      maturity: x.maturity,
    })),
    financials,
    uploads: ups.map((u) => ({ id: u.id, filename: u.filename, status: u.status, createdAt: u.createdAt.toISOString() })),
  };
}

type Payload = Record<string, unknown>;

/**
 * Save one section. `data` shape depends on the section kind.
 * Returns the fresh state so the client can re-render completion and checks.
 */
export async function saveSection(engagementId: string, actor: string, sectionKey: string, data: Payload, cfg: IntakeConfig) {
  const def = cfg.sections.find((x) => x.key === sectionKey);
  if (!def) throw new Error("Unknown section");
  const d = db();
  const base = { engagementId, actor, action: "update", entity: `intake.${sectionKey}` };

  // JSON part (fields sections, toggles on structured sections)
  if (data.fields && typeof data.fields === "object") {
    const allowed = new Set([...(def.fields ?? []).map((f) => f.key), "none_confirmed", "end_month", "months_count", ...(def.kind === "assets" ? ["rows"] : [])]);
    const clean = Object.fromEntries(Object.entries(data.fields as Payload).filter(([k]) => allowed.has(k)));
    const [prev] = await d
      .select()
      .from(intakeSection)
      .where(and(eq(intakeSection.engagementId, engagementId), eq(intakeSection.sectionKey, sectionKey)));
    const merged = { ...((prev?.data as Payload) ?? {}), ...clean };
    await d
      .insert(intakeSection)
      .values({ engagementId, sectionKey, data: merged, updatedBy: actor })
      .onConflictDoUpdate({
        target: [intakeSection.engagementId, intakeSection.sectionKey],
        set: { data: merged, updatedBy: actor, updatedAt: new Date() },
      });
    await audit(diffEntries(base, (prev?.data as Payload) ?? {}, merged));
  }

  if (def.kind === "units" && Array.isArray(data.units)) {
    const rows = (data.units as Payload[]).filter((u) => typeof u.id === "string" && UUID.test(u.id as string));
    const existing = await d.select().from(unit).where(eq(unit.engagementId, engagementId));
    const keep = rows.map((r) => r.id as string);
    const removed = existing.filter((e) => !keep.includes(e.id));
    if (removed.length) {
      await d.delete(unit).where(and(eq(unit.engagementId, engagementId), notInArray(unit.id, keep.length ? keep : ["00000000-0000-0000-0000-000000000000"])));
      await audit(removed.map((r) => ({ ...base, action: "delete", entityId: r.id, oldValue: r.name })));
    }
    for (const [i, r] of rows.entries()) {
      const v = {
        id: r.id as string,
        engagementId,
        name: String(r.name ?? "").slice(0, 120) || "Unnamed unit",
        format: String(r.format ?? "cafe"),
        city: (r.city as string) || null,
        openedOn: (r.openedOn as string) || null,
        status: String(r.status ?? "operating"),
        sqm: str(num(r.sqm)),
        seats: num(r.seats),
        sortOrder: i,
      };
      const prev = existing.find((e) => e.id === v.id);
      if (prev && prev.engagementId !== engagementId) continue;
      await d.insert(unit).values(v).onConflictDoUpdate({ target: unit.id, set: v });
      await audit(diffEntries({ ...base, entityId: v.id }, prev ? { ...prev, sqm: prev.sqm } : {}, v as Payload).filter((e) => e.field !== "sortOrder" && e.field !== "engagementId" && e.field !== "id"));
    }
  }

  const ownUnitIds = async () => (await d.select({ id: unit.id }).from(unit).where(eq(unit.engagementId, engagementId))).map((u) => u.id);

  if (def.kind === "leases" && data.leases && typeof data.leases === "object") {
    const ids = await ownUnitIds();
    for (const [unitId, l] of Object.entries(data.leases as Record<string, Payload>)) {
      if (!ids.includes(unitId)) continue;
      const [prev] = await d.select().from(lease).where(eq(lease.unitId, unitId));
      const v = {
        unitId,
        yearsRemaining: str(num(l.yearsRemaining)),
        monthlyRentEgp: str(num(l.monthlyRent)),
        escalationPct: str(num(l.escalationPct)),
        escalationEveryMonths: num(l.escalationEveryMonths),
        renewalRight: l.renewalRight === null || l.renewalRight === undefined ? null : Boolean(l.renewalRight),
        renewalTerms: (l.renewalTerms as string) || null,
        depositEgp: str(num(l.deposit)),
      };
      await d.insert(lease).values(v).onConflictDoUpdate({ target: lease.unitId, set: v });
      await audit(diffEntries({ ...base, entityId: unitId }, (prev as unknown as Payload) ?? {}, v as Payload).filter((e) => e.field !== "unitId" && e.field !== "revenueShare"));
    }
  }

  if (def.kind === "capex" && Array.isArray(data.capex)) {
    const ids = await ownUnitIds();
    const rows = (data.capex as Payload[]).filter((r) => ids.includes(r.unitId as string) && UUID.test(String(r.id)));
    if (ids.length) await d.delete(unitCapex).where(inArray(unitCapex.unitId, ids));
    if (rows.length)
      await d.insert(unitCapex).values(
        rows.map((r) => ({
          id: r.id as string,
          unitId: r.unitId as string,
          category: String(r.category ?? "other"),
          description: (r.description as string) || null,
          costEgp: String(num(r.cost) ?? 0),
          spentOn: (r.spentOn as string) || null,
          imported: Boolean(r.imported),
        })),
      );
    await audit({ ...base, action: "replace", newValue: { rows: rows.length } });
  }

  if (def.kind === "owner" && Array.isArray(data.addbacks)) {
    const rows = (data.addbacks as Payload[]).filter((r) => UUID.test(String(r.id)));
    const prev = await d.select().from(addback).where(eq(addback.engagementId, engagementId));
    await d.delete(addback).where(eq(addback.engagementId, engagementId));
    if (rows.length)
      await d.insert(addback).values(
        rows.map((r) => ({
          id: r.id as string,
          engagementId,
          kind: (["owner_pay", "one_off", "related_party", "non_operating"].includes(r.kind as string) ? r.kind : "one_off") as "owner_pay",
          description: String(r.description ?? ""),
          amountEgp: String(num(r.amount) ?? 0),
          recurring: Boolean(r.recurring),
          evidenceNote: (r.evidenceNote as string) || null,
          accepted: prev.find((p) => p.id === r.id)?.accepted ?? true,
        })),
      );
    await audit({ ...base, action: "replace", oldValue: prev.map((p) => ({ d: p.description, a: p.amountEgp })), newValue: rows.map((r) => ({ d: r.description, a: r.amount })) });
  }

  if (def.kind === "debt" && Array.isArray(data.debt)) {
    const rows = (data.debt as Payload[]).filter((r) => UUID.test(String(r.id)));
    const prev = await d.select().from(debtItem).where(eq(debtItem.engagementId, engagementId));
    await d.delete(debtItem).where(eq(debtItem.engagementId, engagementId));
    if (rows.length)
      await d.insert(debtItem).values(
        rows.map((r) => ({
          id: r.id as string,
          engagementId,
          kind: String(r.kind ?? "other") as "other",
          counterparty: (r.counterparty as string) || null,
          balance: String(num(r.balance) ?? 0),
          currency: r.currency === "USD" ? "USD" : "EGP",
          ratePct: str(num(r.ratePct)),
          maturity: (r.maturity as string) || null,
        })),
      );
    await audit({ ...base, action: "replace", oldValue: prev.map((p) => ({ k: p.kind, b: p.balance })), newValue: rows.map((r) => ({ k: r.kind, b: r.balance })) });
  }

  if (def.kind === "financials" && data.cells && typeof data.cells === "object") {
    const ids = await ownUnitIds();
    const changes = Object.entries(data.cells as Record<string, number | null>);
    const origin = actor.startsWith("client") ? ("client" as const) : ("admin" as const);
    let n = 0;
    for (const [k, v] of changes) {
      const { unit: u, line, channel, month } = parseCellKey(k);
      const unitId = u === "ho" ? null : u;
      if (unitId && !ids.includes(unitId)) continue;
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const period = `${month}-01`;
      const where = and(
        eq(monthlyFinancial.engagementId, engagementId),
        unitId ? eq(monthlyFinancial.unitId, unitId) : isNull(monthlyFinancial.unitId),
        eq(monthlyFinancial.period, period),
        eq(monthlyFinancial.lineItem, line as "revenue"),
        channel ? eq(monthlyFinancial.channel, channel as "dine_in") : isNull(monthlyFinancial.channel),
      );
      if (v === null || v === undefined || Number.isNaN(Number(v))) {
        await d.delete(monthlyFinancial).where(where);
      } else {
        const [prev] = await d.select({ id: monthlyFinancial.id }).from(monthlyFinancial).where(where);
        if (prev)
          await d
            .update(monthlyFinancial)
            .set({ amountEgp: String(v), origin, confirmed: true, updatedAt: new Date() })
            .where(eq(monthlyFinancial.id, prev.id));
        else
          await d.insert(monthlyFinancial).values({
            engagementId,
            unitId,
            period,
            lineItem: line as "revenue",
            channel: (channel as "dine_in") ?? null,
            amountEgp: String(v),
            origin,
          });
      }
      n++;
    }
    if (n) await audit({ ...base, action: "update", field: "cells", newValue: { cellsChanged: n } });
  }

  // Completion snapshot for the section
  const state = await loadIntake(engagementId, cfg);
  const pct = Math.round(sectionCompletion(def, state, cfg) * 100);
  await d
    .insert(intakeSection)
    .values({ engagementId, sectionKey, data: state.sections[sectionKey] ?? {}, completionPct: pct, updatedBy: actor })
    .onConflictDoUpdate({
      target: [intakeSection.engagementId, intakeSection.sectionKey],
      set: { completionPct: pct, updatedAt: sql`now()` },
    });
  return { state, completion: completion(state, cfg) };
}
