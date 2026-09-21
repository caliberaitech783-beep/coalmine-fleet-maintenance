import { dailyUpdatesExportRows } from "./daily-updates-order.mjs";

const DAILY_UPDATES_SHEET = "Daily Updates";
const empty = (value) => String(value ?? "").trim() || "—";
const dailyColumn = (column) => column?.key === "dailyRemarks" || /daily\s+(?:updates?|remarks?)/i.test(String(column?.label || ""));

function requestRecord(row) {
  return row?.requestDetails && typeof row.requestDetails === "object" ? row.requestDetails : row || {};
}

function detailIdentity(row) {
  const request = requestRecord(row);
  return {
    reference: empty(request.requestReference || request.ref || request.reference),
    machine: empty(request.door || request.machineDoor || request.equipmentName || request.equipment || request.assetId),
    location: empty(request.requestSite || request.currentLocation || request.location || request.site),
    equipmentGroup: empty(request.equipmentGroup || request.group || request.equipment),
    model: empty(request.model),
    serial: empty(request.manufacturerSerialNo || request.chassisNo || request.serialNo || request.serial),
    breakdownType: empty(request.repairCategory || request.category),
    breakdownReason: empty(request.breakdownReason || request.complaint || request.reason),
  };
}

export const DAILY_UPDATES_DETAIL_COLUMNS = [
  "Report", "Report row", "Job reference", "Machine / Door no.", "Location", "Equipment group", "Model",
  "Serial / chassis no.", "Breakdown type", "Breakdown reason", "Update no.", "Update date/time",
  "Updated by", "Daily update", "Delayed reason",
].map((label) => ({ label }));

// Keeps the ordinary report compact and appends one filterable workbook sheet containing every
// saved update as its own row. The original report order and all unrelated sheets stay unchanged.
export function prepareXlsxExportSheets({ title = "Nerve Center report", sheets = [], formatCell = (value) => empty(value) } = {}) {
  const detailRows = [];
  const prepared = sheets.map((sheet) => {
    const columns = Array.isArray(sheet?.columns) ? sheet.columns : [];
    const sourceRows = Array.isArray(sheet?.rows) ? sheet.rows : [];
    const dailyIndex = columns.findIndex(dailyColumn);
    const rows = sourceRows.map((row) => columns.map((column) => formatCell(column.value?.(row))));
    if (dailyIndex < 0) return { ...sheet, columns, rows };

    sourceRows.forEach((row, rowIndex) => {
      const request = requestRecord(row);
      const identity = detailIdentity(row);
      const updates = dailyUpdatesExportRows(request.dailyRemarks, { category: request.repairCategory || request.category });
      rows[rowIndex][dailyIndex] = updates.length
        ? `${updates.length} update${updates.length === 1 ? "" : "s"} · Latest ${updates.at(-1).dateTime} · Full history in ${DAILY_UPDATES_SHEET} sheet`
        : "—";
      updates.forEach((update) => detailRows.push([
        empty(sheet.title || sheet.name || title), rowIndex + 1, identity.reference, identity.machine, identity.location,
        identity.equipmentGroup, identity.model, identity.serial, identity.breakdownType, identity.breakdownReason,
        update.number, update.dateTime, update.author, update.update, update.delayedReason,
      ]));
    });
    return { ...sheet, columns, rows };
  });

  if (detailRows.length) prepared.push({
    name: DAILY_UPDATES_SHEET,
    title: `${title} · Daily Updates`,
    columns: DAILY_UPDATES_DETAIL_COLUMNS,
    rows: detailRows,
  });
  return prepared;
}
