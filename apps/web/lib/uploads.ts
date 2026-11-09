import "server-only";
import { db, upload } from "./db";
import { storeFile } from "./storage";
import { audit } from "./audit";
import { extractUpload } from "./extraction";

const ALLOWED = /\.(xlsx|xls|csv|pdf)$/i;

export async function handleUpload(engagementId: string, actor: string, file: File) {
  if (!ALLOWED.test(file.name)) throw new Error("Only Excel, CSV or PDF files are accepted.");
  if (file.size > 15 * 1024 * 1024) throw new Error("File is larger than 15 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sig = Buffer.from(bytes.slice(0, 4)).toString("hex");
  const isPdf = sig === "25504446";
  const isZip = sig === "504b0304";
  if (/\.pdf$/i.test(file.name) && !isPdf) throw new Error("This file is not a valid PDF.");
  if (/\.xlsx$/i.test(file.name) && !isZip) throw new Error("This file is not a valid Excel workbook.");
  const url = await storeFile(`uploads/${engagementId}/${file.name}`, bytes, file.type || "application/octet-stream");
  const [row] = await db()
    .insert(upload)
    .values({ engagementId, blobUrl: url, filename: file.name.slice(0, 200), mime: file.type || "application/octet-stream", size: file.size, uploadedBy: actor })
    .returning();
  await audit({ engagementId, actor, action: "upload", entity: "upload", entityId: row!.id, newValue: file.name });
  // Best-effort extraction; failures are recorded on the upload, never block the client.
  try {
    await extractUpload(row!.id);
  } catch (e) {
    console.error("extraction failed", e);
  }
  return { id: row!.id, filename: row!.filename, status: row!.status, createdAt: row!.createdAt.toISOString() };
}
