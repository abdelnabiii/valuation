import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";

/**
 * Recalculate an xlsx with LibreOffice headless (forced full recalculation on
 * load) and return a reader for computed cell values. Test-only helper.
 */
export async function recalc(buffer: Uint8Array) {
  const dir = mkdtempSync(join(tmpdir(), "xl-"));
  const profile = join(dir, "profile");
  mkdirSync(join(profile, "user"), { recursive: true });
  writeFileSync(
    join(profile, "user", "registrymodifications.xcu"),
    `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`,
  );
  const inFile = join(dir, "in.xlsx");
  const outDir = join(dir, "out");
  writeFileSync(inFile, buffer);
  execFileSync(
    "soffice",
    [`-env:UserInstallation=file://${profile}`, "--headless", "--calc", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", outDir, inFile],
    { stdio: "pipe", timeout: 180_000 },
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(join(outDir, "in.xlsx")) as unknown as ArrayBuffer);
  return {
    wb,
    value(ref: string): unknown {
      const m = ref.match(/^'?(.+?)'?!\$?([A-Z]+)\$?(\d+)$/);
      if (!m) throw new Error(`bad ref ${ref}`);
      const ws = wb.getWorksheet(m[1]!);
      if (!ws) throw new Error(`no sheet ${m[1]}`);
      const v = ws.getCell(`${m[2]}${m[3]}`).value as unknown;
      if (v && typeof v === "object" && "result" in (v as object)) return (v as { result: unknown }).result;
      return v;
    },
  };
}
