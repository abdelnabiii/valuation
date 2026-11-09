import "server-only";
import { desc, eq, isNull, or } from "drizzle-orm";
import { db, source } from "./db";

export async function sourceOptions(engagementId: string) {
  const rows = await db()
    .select()
    .from(source)
    .where(or(eq(source.engagementId, engagementId), isNull(source.engagementId)))
    .orderBy(desc(source.accessedAt));
  return rows.map((s) => ({ id: s.id, title: s.title, publisher: s.publisher, publishedDate: s.publishedDate, url: s.url, accepted: s.accepted, kind: s.kind, excerpt: s.excerpt }));
}
