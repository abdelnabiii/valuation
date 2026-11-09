import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { handleUpload } from "@/lib/uploads";

export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await readSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return new NextResponse("No file", { status: 400 });
  try {
    return NextResponse.json(await handleUpload(id, s.email, file));
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 400 });
  }
}
