import "server-only";
import { put, get } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Private file storage: Vercel Blob in production, local temp dir in development. */
export async function storeFile(pathname: string, bytes: Uint8Array | Buffer, contentType: string): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const r = await put(pathname, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: true });
    return r.url;
  }
  const p = join(tmpdir(), "valuation-files", pathname.replace(/[^a-zA-Z0-9._/-]/g, "_"));
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, bytes);
  return `local://${p}`;
}

export async function readStoredFile(url: string): Promise<Buffer> {
  if (url.startsWith("local://")) return readFile(url.slice("local://".length));
  const r = await get(url, { access: "private" });
  if (!r || !r.stream) throw new Error("File not found");
  const chunks: Uint8Array[] = [];
  const reader = r.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
