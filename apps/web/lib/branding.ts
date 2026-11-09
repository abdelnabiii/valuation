import "server-only";
import { eq } from "drizzle-orm";
import { db, branding } from "./db";

export const DEFAULT_DISCLAIMER =
  "This is an advisory valuation prepared by an independent advisor for the addressee's internal decision-making. It is not a certified valuation by a licensed valuer, is not a fairness opinion, and must not be relied on as such for regulatory, tax, court or financing purposes. It relies on information supplied by management, which has not been audited or independently verified, and on market data from the sources cited, as at the dates shown.";

export async function getBranding() {
  const [b] = await db().select().from(branding).where(eq(branding.id, 1));
  if (b) return b;
  const [created] = await db().insert(branding).values({ id: 1, disclaimerText: DEFAULT_DISCLAIMER }).onConflictDoNothing().returning();
  return created ?? (await db().select().from(branding).where(eq(branding.id, 1)))[0]!;
}
