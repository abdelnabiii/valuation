import "server-only";
import { eq } from "drizzle-orm";
import { getProfile } from "@valuation/engine";
import { db, engagement, profileDefault } from "./db";
import { intakeConfig } from "./intake/config";

export async function engagementProfileKey(engagementId: string): Promise<string> {
  const [e] = await db().select({ k: engagement.profileKey }).from(engagement).where(eq(engagement.id, engagementId));
  return getProfile(e?.k).key;
}

export async function configForEngagement(engagementId: string) {
  return intakeConfig(await engagementProfileKey(engagementId));
}

/** Built-in profile defaults merged with the admin's edits. */
export async function profileDefaultsFor(profileKey: string): Promise<Record<string, number>> {
  const p = getProfile(profileKey);
  const rows = await db().select().from(profileDefault).where(eq(profileDefault.profileKey, p.key));
  return { ...p.defaults, ...Object.fromEntries(rows.map((r) => [r.assumptionKey, Number(r.value)])) };
}
