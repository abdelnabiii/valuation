import "server-only";
import { db, auditLog } from "./db";

export interface AuditEntry {
  engagementId?: string | null;
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

export async function audit(entries: AuditEntry | AuditEntry[]) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return;
  await db()
    .insert(auditLog)
    .values(
      list.map((e) => ({
        engagementId: e.engagementId ?? null,
        actor: e.actor,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        field: e.field ?? null,
        oldValue: (e.oldValue ?? null) as never,
        newValue: (e.newValue ?? null) as never,
        reason: e.reason ?? null,
      })),
    );
}

/** Field-level diff of two flat objects, as audit entries. */
export function diffEntries(base: Omit<AuditEntry, "field" | "oldValue" | "newValue">, before: Record<string, unknown>, after: Record<string, unknown>): AuditEntry[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: AuditEntry[] = [];
  for (const k of keys) {
    const a = before?.[k] ?? null;
    const b = after?.[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ ...base, field: k, oldValue: a, newValue: b });
  }
  return out;
}
