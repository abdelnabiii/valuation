import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveToken } from "@/lib/links";
import { saveSection } from "@/lib/intake/server";
import { intakeConfig } from "@/lib/intake/config";
import { db, intakeLink } from "@/lib/db";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveToken(token);
  if (!r.ok) return new NextResponse("This link is no longer valid.", { status: 403 });
  if (r.link.locked) return new NextResponse("The questionnaire has been submitted and is locked.", { status: 423 });
  const body = (await req.json().catch(() => null)) as { section?: string; data?: Record<string, unknown> } | null;
  if (!body?.section || !body.data) return new NextResponse("Bad request", { status: 400 });
  const raw = JSON.stringify(body.data);
  if (raw.length > 2_000_000) return new NextResponse("Payload too large", { status: 413 });
  const res = await saveSection(r.engagement.id, `client:${r.link.id.slice(0, 8)}`, body.section, body.data, intakeConfig(r.engagement.profileKey));
  await db().update(intakeLink).set({ lastSavedAt: new Date() }).where(eq(intakeLink.id, r.link.id));
  return NextResponse.json({ completion: res.completion });
}
