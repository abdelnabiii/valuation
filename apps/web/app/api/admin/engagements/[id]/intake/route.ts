import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { saveSection } from "@/lib/intake/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { section?: string; data?: Record<string, unknown> } | null;
  if (!body?.section || !body.data) return new NextResponse("Bad request", { status: 400 });
  const r = await saveSection(id, s.email, body.section, body.data);
  return NextResponse.json({ completion: r.completion });
}
