import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { recordCountLine, withSerialColumn } from "../serial-column.mjs";

function storedFiles(buffer) {
  const files = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 0);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, buffer.subarray(start, start + size).toString("utf8"));
    offset = start + size;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
  return files;
}

function browserXlsxBuilder() {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const start = source.indexOf("function escapeExportHtml");
  const end = source.indexOf("// Smart Print goes straight to the printer", start);
  assert.ok(start >= 0 && end > start, "browser XLSX builder source is present");
  return new Function(
    "withSerialColumn", "recordCountLine", "formatDisplayDateTime", "prepareXlsxExportSheets", "exportCellText",
    `${source.slice(start, end)}; return { buildXlsxSheetsWorkbook, escapeXlsxText };`,
  )(withSerialColumn, recordCountLine, () => "12:00 PM 22-09-2026", () => [], String);
}

test("browser XLSX worksheets use Excel's required element order and safe SpreadsheetML text", async () => {
  const { buildXlsxSheetsWorkbook, escapeXlsxText } = browserXlsxBuilder();
  assert.equal(escapeXlsxText("Control\u0001text\r\nnext"), "Control_x0001_text_x000D_\nnext");
  assert.equal(escapeXlsxText("literal _x0001_"), "literal _x005F_x0001_");

  const blob = buildXlsxSheetsWorkbook("BD & Balance", [
    { name: "Report", title: "BD Balance", columns: [{ label: "Daily updates" }], rows: [["2 updates"]] },
    { name: "Daily Updates", title: "Daily Updates", columns: [{ label: "Daily update" }], rows: [["Line one\nLine two"], ["Control\u0001text"], ["literal _x0001_"]] },
  ]);
  const files = storedFiles(Buffer.from(await blob.arrayBuffer()));
  assert.deepEqual([...files.keys()].filter((name) => name.startsWith("xl/worksheets/")), [
    "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml",
  ]);
  for (const name of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
    const xml = files.get(name);
    assert.ok(xml.indexOf("<autoFilter") < xml.indexOf("<mergeCells"), `${name} must put autoFilter before mergeCells`);
    assert.doesNotMatch(xml, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/);
  }
  assert.match(files.get("xl/worksheets/sheet2.xml"), /Control_x0001_text/);
  assert.match(files.get("xl/worksheets/sheet2.xml"), /literal _x005F_x0001_/);
  assert.match(files.get("docProps/core.xml"), /BD &amp; Balance/);
});
