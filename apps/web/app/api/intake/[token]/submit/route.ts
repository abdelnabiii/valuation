import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { resolveToken } from "@/lib/links";
import { db, engagement, intakeLink } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveToken(token);
  if (!r.ok) return new NextResponse("This link is no longer valid.", { status: 403 });
  await db().update(intakeLink).set({ locked: true, submittedAt: new Date() }).where(eq(intakeLink.id, r.link.id));
  await db()
    .update(engagement)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(and(eq(engagement.id, r.engagement.id), inArray(engagement.status, ["draft", "intake_open"])));
  await audit({ engagementId: r.engagement.id, actor: `client:${r.link.id.slice(0, 8)}`, action: "submit", entity: "intake_link", entityId: r.link.id });
  return NextResponse.json({ ok: true });
}
