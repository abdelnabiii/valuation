import "server-only";
import ExcelJS from "exceljs";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq } from "drizzle-orm";
import { claude, hasClaude, MODEL } from "./claude";
import { db, extractionRow, unit, upload } from "./db";
import { readStoredFile } from "./storage";

const LINE_ITEMS = [
  "revenue",
  "cogs",
  "labour",
  "rent",
  "delivery_commission",
  "marketing",
  "utilities",
  "maintenance",
  "other_opex",
  "head_office",
  "depreciation",
  "interest",
  "tax",
] as const;

const Row = z.object({
  raw_label: z.string().describe("Row label exactly as in the document"),
  unit_name: z.string().nullable().describe("Unit/branch the figure belongs to if stated, else null"),
  period: z.string().describe("YYYY-MM of the month the figure belongs to"),
  amount: z.number().describe("Amount as stated, in EGP; costs as positive numbers"),
  line_item: z.enum(LINE_ITEMS).nullable().describe("Best mapping, or null if subtotal/unclear"),
  channel: z.enum(["dine_in", "delivery", "wholesale", "online"]).nullable().describe("Only for revenue rows"),
  confidence: z.number().min(0).max(1),
});
const Out = z.object({ rows: z.array(Row), notes: z.string().nullable() });

const PROMPT = `Extract monthly profit-and-loss figures for a coffee/F&B business. Return one row per (label, month) for monthly columns only. Skip totals, subtotals, percentages, YTD and annual columns. Do not compute or infer values that are not in the document. Map each row to a line item where clear; otherwise set line_item to null. If a figure is a cost shown in brackets or as negative, return it as a positive amount.`;

/** Turn an Excel/CSV workbook into a compact text grid for the model. */
async function sheetToText(bytes: Buffer, filename: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) {
    const { Readable } = await import("node:stream");
    await wb.csv.read(Readable.from(bytes));
  } else await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const parts: string[] = [];
  wb.eachSheet((ws) => {
    parts.push(`## Sheet: ${ws.name}`);
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n > 400) return;
      const cells = (row.values as unknown[]).slice(1, 40).map((v) => {
        if (v === null || v === undefined) return "";
        if (v instanceof Date) return v.toISOString().slice(0, 7);
        if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result ?? "");
        if (typeof v === "object" && v && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
        return String(v);
      });
      parts.push(cells.join("\t"));
    });
  });
  return parts.join("\n").slice(0, 400_000);
}

/** Best-effort extraction into staged rows; the advisor confirms before anything is used. */
export async function extractUpload(uploadId: string) {
  const d = db();
  const [u] = await d.select().from(upload).where(eq(upload.id, uploadId));
  if (!u) throw new Error("Upload not found");
  if (!hasClaude()) {
    await d.update(upload).set({ status: "pending", extractionNote: "Automatic extraction needs ANTHROPIC_API_KEY. Enter figures manually." }).where(eq(upload.id, uploadId));
    return;
  }
  const bytes = await readStoredFile(u.blobUrl);
  const units = await d.select().from(unit).where(eq(unit.engagementId, u.engagementId));
  const unitList = units.map((x) => x.name).join(", ") || "(none recorded)";
  const content: Parameters<ReturnType<typeof claude>["messages"]["parse"]>[0]["messages"][0]["content"] = /\.pdf$/i.test(u.filename)
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
        { type: "text", text: `${PROMPT}\nKnown units: ${unitList}.` },
      ]
    : [{ type: "text", text: `${PROMPT}\nKnown units: ${unitList}.\n\n<spreadsheet filename="${u.filename}">\n${await sheetToText(bytes, u.filename)}\n</spreadsheet>` }];
  try {
    const stream = claude().messages.stream({
      model: MODEL,
      max_tokens: 64000,
      output_config: { format: zodOutputFormat(Out), effort: "low" },
      messages: [{ role: "user", content }],
    });
    const msg = await stream.finalMessage();
    const textBlock = msg.content.find((b) => b.type === "text");
    const parsed = Out.parse(JSON.parse(textBlock && textBlock.type === "text" ? textBlock.text : "{}"));
    const unitByName = new Map(units.map((x) => [x.name.trim().toLowerCase(), x.id]));
    await d.delete(extractionRow).where(eq(extractionRow.uploadId, uploadId));
    const rows = parsed.rows.filter((r) => /^\d{4}-\d{2}$/.test(r.period));
    if (rows.length)
      await d.insert(extractionRow).values(
        rows.map((r) => ({
          uploadId,
          rawLabel: r.raw_label.slice(0, 200),
          period: `${r.period}-01`,
          amount: String(r.amount),
          proposedLineItem: r.line_item,
          proposedChannel: r.line_item === "revenue" ? (r.channel ?? "dine_in") : null,
          proposedUnitId: r.unit_name ? (unitByName.get(r.unit_name.trim().toLowerCase()) ?? null) : units.length === 1 ? units[0]!.id : null,
          confidence: String(r.confidence),
        })),
      );
    await d
      .update(upload)
      .set({ status: "extracted", extractionNote: `${rows.length} figures extracted for review.${parsed.notes ? ` ${parsed.notes}` : ""}`.slice(0, 1000) })
      .where(eq(upload.id, uploadId));
  } catch (e) {
    await d.update(upload).set({ status: "failed", extractionNote: `Extraction failed: ${(e as Error).message}`.slice(0, 500) }).where(eq(upload.id, uploadId));
  }
}
