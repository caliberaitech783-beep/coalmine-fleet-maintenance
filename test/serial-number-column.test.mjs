import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SERIAL_COLUMN_KEY, SERIAL_COLUMN_LABEL, hasSerialColumn, withSerialColumn, recordCountLine } from "../serial-column.mjs";
import { buildTableExportPdf } from "../table-export-pdf.mjs";
import { buildXlsxWorkbookBuffer } from "../director-report-bundle.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pdfText = (pdf) => [...pdf.toString("latin1").matchAll(/<([0-9a-f]+)>/gi)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join("");

test("the serial column is added exactly once to export data", () => {
  const added = withSerialColumn([{ label: "Door no." }], [["S1"], ["S2"]]);
  assert.deepEqual(added.columns.map((column) => column.label), [SERIAL_COLUMN_LABEL, "Door no."]);
  assert.deepEqual(added.rows, [["1", "S1"], ["2", "S2"]]);
  assert.equal(hasSerialColumn(added.columns), true);
  const decorated = { columns: [{ key: SERIAL_COLUMN_KEY, label: SERIAL_COLUMN_LABEL }, { label: "Door no." }], rows: [["1", "S1"]] };
  assert.deepEqual(withSerialColumn(decorated.columns, decorated.rows), decorated);
  assert.equal(hasSerialColumn([{ label: " Sr. No. " }]), true);
  assert.equal(hasSerialColumn([]), false);
  assert.equal(recordCountLine(1, "now"), "1 record · Generated now");
  assert.equal(recordCountLine(52, "now"), "52 records · Generated now");
});

test("shared tables number every row by default with the Sr. No. label and forward it to their exports", () => {
  const shared = read("../src/shared-actions-table.jsx");
  assert.match(shared, /showRowNumbers = true, \.\.\.tableProps \}\) \{/);
  assert.match(shared, /const numberColumn = \{ key: SERIAL_COLUMN_KEY, label: SERIAL_COLUMN_LABEL, value: \(row\) => rowNumbers\.get\(row\) \};/);
  assert.match(shared, /<th key="row-number" className="table-serial-header" scope="col" rowSpan=\{[^}]+\}>\{SERIAL_COLUMN_LABEL\}<\/th>/);
  assert.match(shared, /<td key="row-number" className="table-serial-cell">/);
  assert.match(read("../src/dashboard-record-browser.jsx"), /showDateFilter = true, showRowNumbers = true,/);
  assert.match(read("../src/table-actions.css"), /\.table-serial-header, \.table-serial-cell \{/);
});

test("report, backup and WhatsApp rule tables start with a Sr. No. column", () => {
  const main = read("../src/main.jsx");
  assert.match(main, /<thead><tr><th className="table-serial-header" scope="col">Sr\. No\.<\/th>\{displayedColumns\.map/);
  assert.match(main, /<td className="table-serial-cell">\{firstVisibleRow \+ index\}<\/td>/);
  assert.match(main, /colSpan=\{displayedColumns\.length \+ 1\} className="empty-state"/);
  assert.match(read("../src/backup-administration.jsx"), /<thead><tr><th>Sr\. No\.<\/th><th>Date & time<\/th>/);
  assert.match(read("../src/backup-administration.jsx"), /history\.map\(\(row,index\)=><tr key=\{row\.id\}><td>\{index\+1\}<\/td>/);
  assert.match(read("../src/whatsapp-report-settings.jsx"), /<th scope="col">Sr\. No\.<\/th><th scope="col">Role<\/th>/);
});

test("print and Excel downloads carry the serial column and the record count", () => {
  const main = read("../src/main.jsx");
  assert.match(main, /const serial = withSerialColumn\(columns, exportRows\);\r?\n  const headings = serial\.columns\.map/);
  assert.match(main, /colspan="\$\{serial\.columns\.length\}">No records available/);
  assert.match(main, /const summaryRows = \[\[sheetTitle \|\| title \|\| "Nerve Center report"\], \[recordCountLine\(exportRows\.length, formatDisplayDateTime\(new Date\(\)\)\)\]\];/);
  assert.match(main, /const worksheetRows = \[\.\.\.summaryRows, labels, \.\.\.serial\.rows\];/);
  const server = read("../server.mjs");
  assert.match(server, /const dataColumnCount=requestedColumns\.length-\(String\(requestedColumns\[0\]\?\.label\?\?''\)\.trim\(\)==='Sr\. No\.'\?1:0\);/);
});

test("PDF and Excel attachments start with a serial column, state the record count, and never double it", async () => {
  const pdf = await buildTableExportPdf({ title: "Fleet list", columns: [{ label: "Door no." }], rows: [["S1"], ["S2"]] });
  const text = pdfText(pdf);
  assert.equal(text.match(/Sr\. No\./g)?.length, 1);
  assert.match(text, /2 records exported/);
  const decorated = await buildTableExportPdf({ title: "Fleet list", columns: [{ label: "Sr. No." }, { label: "Door no." }], rows: [["1", "S1"]] });
  assert.equal(pdfText(decorated).match(/Sr\. No\./g)?.length, 1);
  const workbook = buildXlsxWorkbookBuffer("Fleet list", [{ label: "Door no." }], [["S1"], ["S2"]]).toString("utf8");
  assert.match(workbook, /<row r="1"><c r="A1" t="inlineStr"><is><t>Fleet list<\/t>/);
  assert.match(workbook, /<row r="2"><c r="A2" t="inlineStr"><is><t>2 records · Generated /);
  assert.match(workbook, /<row r="3"><c r="A3" t="inlineStr"><is><t>Sr\. No\.<\/t><\/is><\/c><c r="B3" t="inlineStr"><is><t>Door no\.<\/t>/);
  assert.match(workbook, /<row r="4"><c r="A4" t="inlineStr"><is><t>1<\/t><\/is><\/c><c r="B4" t="inlineStr"><is><t>S1<\/t>/);
  assert.match(workbook, /<row r="5"><c r="A5" t="inlineStr"><is><t>2<\/t>/);
  const already = buildXlsxWorkbookBuffer("Fleet list", [{ label: "Sr. No." }, { label: "Door no." }], [["1", "S1"]]).toString("utf8");
  assert.equal(already.match(/Sr\. No\./g)?.length, 1);
});
