import {recordCountLine,withSerialColumn} from "./serial-column.mjs";
import {formatDisplayDateTime} from "./date-time-format.mjs";
function escapeExportHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[character]));
}
// SpreadsheetML uses _xHHHH_ escapes for XML control characters. Literal text
// that already looks like one of those escapes must have its underscore escaped
// first, otherwise Excel silently changes the user's text while opening the file.
function escapeXlsxText(value) {
  return escapeExportHtml(String(value ?? "")
    .replace(/_x[0-9a-f]{4}_/gi, (match) => `_x005F_${match.slice(1)}`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff\r]/g, (character) => `_x${character.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}_`));
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crc32.table[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}
crc32.table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function uint16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}
function uint32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}
function zipStoredFiles(files, mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const encoder = new TextEncoder();
  const chunks = [], centralDirectory = [];
  let offset = 0;
  files.forEach(({ name, content }) => {
    const filename = encoder.encode(name);
    const data = content instanceof Uint8Array
      ? content
      : content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : encoder.encode(String(content));
    const checksum = crc32(data);
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(checksum), ...uint32(data.length), ...uint32(data.length), ...uint16(filename.length), ...uint16(0),
    ]);
    chunks.push(localHeader, filename, data);
    centralDirectory.push({ filename, checksum, size: data.length, offset });
    offset += localHeader.length + filename.length + data.length;
  });
  const centralStart = offset;
  centralDirectory.forEach((entry) => {
    const header = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, ...uint16(20), ...uint16(20), ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0),
      ...uint32(entry.checksum), ...uint32(entry.size), ...uint32(entry.size), ...uint16(entry.filename.length),
      ...uint16(0), ...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(entry.offset),
    ]);
    chunks.push(header, entry.filename);
    offset += header.length + entry.filename.length;
  });
  const centralSize = offset - centralStart;
  chunks.push(new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, ...uint16(0), ...uint16(0), ...uint16(files.length), ...uint16(files.length),
    ...uint32(centralSize), ...uint32(centralStart), ...uint16(0),
  ]));
  return new Blob(chunks, { type: mimeType });
}
function excelCellReference(columnIndex, rowIndex) {
  let column = "", value = columnIndex + 1;
  while (value) {
    value -= 1;
    column = String.fromCharCode(65 + (value % 26)) + column;
    value = Math.floor(value / 26);
  }
  return `${column}${rowIndex + 1}`;
}
// An Excel workbook with one worksheet per table ({name, title, columns, rows, highlightedRows}): each sheet
// has its title, record count, column headings with the Sr. No. column, and rows, highlighted rows filled.
// Sheet names are made Excel-safe and unique.
function buildXlsxSheetsWorkbook(title, sheets = []) {
  const usedNames = new Set();
  const sheetName = (name, index) => {
    const base = String(name || "").replace(/[\u0000-\u001f\u007f-\u009f\ufffe\uffff[\]:*?/\x5c]/g, " ").replace(/\s+/g, " ").replace(/^[\s']+|[\s']+$/g, "").slice(0, 31) || `Sheet ${index + 1}`;
    let unique = base;
    for (let copy = 2; usedNames.has(unique.toLowerCase()); copy++) unique = `${base.slice(0, 27)} ${copy}`;
    usedNames.add(unique.toLowerCase());
    return unique;
  };
  const worksheets = sheets.map(({ name, title: sheetTitle, columns = [], rows: exportRows = [], highlightedRows = new Set() }, sheetIndex) => {
    const serial = withSerialColumn(columns, exportRows);
    const usedLabels = new Set();
    const labels = serial.columns.map((column, index) => {
      const base = String(column.label || `Column ${index + 1}`).slice(0, 240);
      let label = base;
      for (let suffix = 2; usedLabels.has(label.toLowerCase()); suffix++) label = `${base} (${suffix})`;
      usedLabels.add(label.toLowerCase());
      return label;
    });
    const summaryRows = [[sheetTitle || title || "Caliber Pulse report"], [recordCountLine(exportRows.length, formatDisplayDateTime(new Date()))]];
    const firstDataRow = summaryRows.length + 1;
    const worksheetRows = [...summaryRows, labels, ...serial.rows];
    const sheetData = worksheetRows.map((row, rowIndex) => {
      const style = rowIndex === 0 ? 3 : rowIndex === 1 ? 4 : rowIndex === 2 ? 5 : highlightedRows.has(rowIndex - firstDataRow) ? 2 : (rowIndex - firstDataRow) % 2 === 0 ? 6 : 1;
      const height = rowIndex === 0 ? ' ht="24" customHeight="1"' : rowIndex === 2 ? ' ht="30" customHeight="1"' : "";
      return `<row r="${rowIndex + 1}"${height}>${row.map((cell, columnIndex) => `<c r="${excelCellReference(columnIndex, rowIndex)}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXlsxText(cell)}</t></is></c>`).join("")}</row>`;
    }).join("");
    const widths = labels.map((label, index) => {
      const maxLength = Math.max(String(label || "").length, ...serial.rows.map((row) => Math.max(...String(row[index] || "").split(/\r?\n/).map((line) => line.length))));
      return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(48, Math.max(12, maxLength + 2))}" customWidth="1"/>`;
    }).join("");
    const lastCell = excelCellReference(Math.max(0, labels.length - 1), Math.max(2, worksheetRows.length - 1));
    const filterRange = `A3:${excelCellReference(Math.max(0, labels.length - 1), Math.max(2, worksheetRows.length - 1))}`;
    const mergedTo = excelCellReference(Math.max(0, labels.length - 1), 0).replace(/1$/, "");
    // SpreadsheetML requires autoFilter before mergeCells. Excel repairs (and may
    // discard) the complete worksheet when these otherwise valid elements are reversed.
    return { name: sheetName(name, sheetIndex), part: `xl/worksheets/sheet${sheetIndex + 1}.xml`, tableRange: filterRange, tableLabels: labels, content: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastCell}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${widths}</cols><sheetData>${sheetData}</sheetData><autoFilter ref="${filterRange}"/>${labels.length > 1 ? `<mergeCells count="2"><mergeCell ref="A1:${mergedTo}1"/><mergeCell ref="A2:${mergedTo}2"/></mergeCells>` : ""}<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>` };
  });
  const workbookTitle = escapeXlsxText(title || "Caliber Pulse report");
  return zipStoredFiles([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${worksheets.map((sheet) => `<Override PartName="/${sheet.part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}${worksheets.map((_, index) => `<Override PartName="/xl/tables/table${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", content: `<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${workbookTitle}</dc:title><dc:creator>Caliber Pulse</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", content: `<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Caliber Pulse</Application></Properties>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${worksheets.map((sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${worksheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF10284C"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF65758B"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8CACA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" applyBorder="1" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyBorder="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><tableStyles count="0" defaultTableStyle="TableStyleLight15" defaultPivotStyle="PivotStyleLight16"/></styleSheet>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${worksheets.map((sheet, index) => `<sheet name="${escapeXlsxText(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>` },
    ...worksheets.flatMap((sheet, index) => [
      {name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`, content: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${index + 1}.xml"/></Relationships>`},
      {name: `xl/tables/table${index + 1}.xml`, content: `<?xml version="1.0" encoding="UTF-8"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${index + 1}" name="ReportTable${index + 1}" displayName="ReportTable${index + 1}" ref="${sheet.tableRange}" totalsRowShown="0"><autoFilter ref="${sheet.tableRange}"/><tableColumns count="${sheet.tableLabels.length}">${sheet.tableLabels.map((label, i) => `<tableColumn id="${i + 1}" name="${escapeXlsxText(label)}"/>`).join("")}</tableColumns><tableStyleInfo name="TableStyleLight15" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`},
    ]),
    ...worksheets.map((sheet) => ({ name: sheet.part, content: sheet.content })),
  ]);
}

export {buildXlsxSheetsWorkbook,zipStoredFiles,escapeExportHtml};
