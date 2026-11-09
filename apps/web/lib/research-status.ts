import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLog, db } from "./db";

/** Latest research job for an engagement and kind: running, or the last result. */
export async function researchStatus(engagementId: string, entity: "macro" | "comparables") {
  const [last] = await db()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.engagementId, engagementId), eq(auditLog.entity, entity), inArray(auditLog.action, ["research_started", "research"])))
    .orderBy(desc(auditLog.at))
    .limit(1);
  if (!last) return null;
  const running = last.action === "research_started" && Date.now() - last.at.getTime() < 15 * 60 * 1000;
  const v = (last.newValue ?? {}) as { proposals?: number; rejected?: string[]; error?: string };
  return { running, at: last.at.toISOString(), proposals: v.proposals ?? null, rejected: v.rejected ?? [], error: v.error ?? null, stalled: last.action === "research_started" && !running };
}
