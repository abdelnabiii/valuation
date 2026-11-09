import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, engagement, intakeLink, client } from "./db";

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Creates a link; the raw token is returned once and never stored. */
export async function createIntakeLink(engagementId: string, days = 60) {
  const token = randomBytes(32).toString("base64url");
  await db()
    .update(intakeLink)
    .set({ revokedAt: new Date() })
    .where(and(eq(intakeLink.engagementId, engagementId), isNull(intakeLink.revokedAt)));
  const [row] = await db()
    .insert(intakeLink)
    .values({ engagementId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + days * 86400000) })
    .returning();
  await db().update(engagement).set({ status: "intake_open" }).where(and(eq(engagement.id, engagementId), eq(engagement.status, "draft")));
  return { token, link: row! };
}

export type LinkResolution =
  | { ok: true; link: typeof intakeLink.$inferSelect; engagement: typeof engagement.$inferSelect; clientName: string }
  | { ok: false; reason: "not_found" | "revoked" | "expired" };

export async function resolveToken(token: string): Promise<LinkResolution> {
  if (!token || token.length < 20) return { ok: false, reason: "not_found" };
  const rows = await db()
    .select({ link: intakeLink, engagement, clientName: client.name })
    .from(intakeLink)
    .innerJoin(engagement, eq(engagement.id, intakeLink.engagementId))
    .innerJoin(client, eq(client.id, engagement.clientId))
    .where(eq(intakeLink.tokenHash, hashToken(token)));
  const r = rows[0];
  if (!r) return { ok: false, reason: "not_found" };
  if (r.link.revokedAt) return { ok: false, reason: "revoked" };
  if (r.link.expiresAt < new Date()) return { ok: false, reason: "expired" };
  return { ok: true, ...r };
}
