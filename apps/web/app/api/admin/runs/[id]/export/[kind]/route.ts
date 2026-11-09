import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { EXPORT_TYPES, generateExport, type ExportKind } from "@/lib/runs";

export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; kind: string }> }) {
  const s = await readSession();
  if (!s) return new NextResponse("Unauthorized", { status: 401 });
  const { id, kind } = await ctx.params;
  if (!(kind in EXPORT_TYPES)) return new NextResponse("Unknown export type", { status: 400 });
  const { bytes, filename, mime } = await generateExport(id, kind as ExportKind, s.email);
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": mime, "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" },
  });
}
