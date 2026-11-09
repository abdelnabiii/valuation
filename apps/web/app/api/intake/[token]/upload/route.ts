import { NextResponse } from "next/server";
import { resolveToken } from "@/lib/links";
import { handleUpload } from "@/lib/uploads";

export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await resolveToken(token);
  if (!r.ok) return new NextResponse("This link is no longer valid.", { status: 403 });
  if (r.link.locked) return new NextResponse("The questionnaire is locked.", { status: 423 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new NextResponse("No file", { status: 400 });
  try {
    return NextResponse.json(await handleUpload(r.engagement.id, `client:${r.link.id.slice(0, 8)}`, file));
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 400 });
  }
}
