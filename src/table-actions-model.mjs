import React from "react";
import { reportTime12 } from "../report-time-format.mjs";
import { matchesDateRange, parseDateRange } from "./date-range-filter.mjs";
import { cellMatchesFilterValues } from "./multi-value-filter.mjs";
import { recordDateKey } from "./record-date-range.mjs";
import { isDurationColumn, compareDurationValues } from "./duration-sort.mjs";

// Re-exported so the shared table (and its test harness) read the serial column contract from one place.
export { SERIAL_COLUMN_KEY, SERIAL_COLUMN_LABEL } from "../serial-column.mjs";

export function tableElements(children) {
  return React.Children.toArray(children).flatMap((child) =>
    React.isValidElement(child) ? child.type === React.Fragment ? tableElements(child.props.children) : [child] : [],
  );
}

export function tableCellText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(tableCellText).filter(Boolean).join(" ");
  if (!React.isValidElement(node)) return "";
  if (node.type === "input") return node.props.type === "checkbox" ? (node.props.checked ? "Yes" : "No") : String(node.props.value ?? "");
  if (node.type === "select" || node.type === "textarea") return String(node.props.value ?? "");
  return tableCellText(node.props.children) || node.props.label || "";
}

export function tableSlots(row) {
  return tableElements(row.props.children).flatMap((cell, index) =>
    Array.from({ length: Math.max(1, Number(cell.props.colSpan) || 1) }, () => ({ cell, index })),
  );
}

// Change presentation only: model values and data-sort-value remain untouched.
function timeFirstCell(node) {
  if (typeof node === "string") return reportTime12(node);
  if (Array.isArray(node)) return node.map(timeFirstCell);
  if (!React.isValidElement(node) || ["input", "select", "textarea"].includes(node.type)) return node;
  return React.cloneElement(node, {}, timeFirstCell(node.props.children));
}

export function projectTableRow(row, indices) {
  const slots = tableSlots(row);
  const groups = [];
  for (const index of indices) {
    const slot = slots[index];
    if (!slot) continue;
    const last = groups.at(-1);
    if (last?.index === slot.index) last.span++;
    else groups.push({ ...slot, span: 1 });
  }
  return React.cloneElement(row, {}, groups.map(({ cell, index, span }, position) =>
    React.cloneElement(cell, { key: `${cell.key || index}:${position}`, ...(cell.props.colSpan || span > 1 ? { colSpan: span } : {}) }, cell.type === "td" ? timeFirstCell(cell.props.children) : cell.props.children),
  ));
}

export function tableModel(children) {
  const sections = tableElements(children);
  const head = sections.find((section) => section.type === "thead");
  const header = head && tableElements(head.props.children).at(-1);
  const columns = header ? tableSlots(header).map(({ cell }, index) => ({
    key: String(cell.props.sortKey ?? `${index}:${tableCellText(cell)}`),
    label: cell.props.label || tableCellText(cell) || `Column ${index + 1}`,
    index,
    header: cell,
    value: (row) => tableCellText(tableSlots(row)[index]?.cell).trim(),
    // Cells may carry data-sort-value (raw date, minutes, etc.) so sorting is not limited to display text.
    sortValue: (row) => {
      const cell = tableSlots(row)[index]?.cell;
      const raw = cell?.props?.["data-sort-value"];
      return raw === undefined || raw === null ? tableCellText(cell).trim() : raw;
    },
  })) : [];
  return { sections, columns };
}

// Keep original indices so headers, values, filters and exports stay aligned.
export function requestColumnsInWorkflowOrder(columns, actionsFirst = false) {
  const priorities = ["days of breakdown", "status", "door no.", "site location", "repair category", "reason"];
  const rank = (column) => {
    const label = column.label.trim().toLowerCase();
    const index = priorities.indexOf(label);
    return index < 0 ? priorities.length : index;
  };
  const ordered = jobReferenceColumnsLast(dateColumnsFirst([...columns].sort((a, b) => rank(a) - rank(b)), false));
  if (!actionsFirst) return ordered;
  // Maintenance and MIS workflow tables lead with a fixed layout (the table adds Sr. No. in front),
  // then every remaining column follows in the standard order with Job reference last.
  const leading = [
    /^(?:machine\s*\/\s*)?door\s*(?:no\.?|number)$/i,
    /^status$/i,
    /^actions$/i,
    /^(?:started|production date and time)$/i,
    /^days of breakdown$/i,
    /^etc$/i,
    /^time left for etc$/i,
    /^(?:breakdown reason|reason of breakdown|reason)$/i,
    /^(?:breakdown type|type of breakdown|repair category)$/i,
    /^equipment group$/i,
    /^make$/i,
    /^model$/i,
    /^daily remarks$/i,
    /^work completion action taken$/i,
    /^delayed reason$/i,
  ];
  const lead = leading.flatMap((pattern) => ordered.filter((column) => pattern.test(column.label.trim())));
  return [...lead, ...ordered.filter((column) => !lead.includes(column))];
}

export function jobReferenceColumnsLast(columns) {
  const isJobReference = (column) => /^job\s+ref(?:erence)?s?\.?$/i.test(column.label.trim());
  let ordered = [...columns.filter((column) => !isJobReference(column)), ...columns.filter(isJobReference)];
  // Apply the same adjacent-field layout to tables, printing and exports without changing source indices.
  const moveAfter = (anchor, matches) => {
    const target = ordered.find(anchor);
    const moving = ordered.filter(matches);
    if (!target || !moving.length) return;
    ordered = ordered.filter((column) => !matches(column));
    ordered.splice(ordered.indexOf(target) + 1, 0, ...moving);
  };
  moveAfter(({label}) => /^status$/i.test(label.trim()), ({label}) => /^(?:machine\s*\/\s*)?door\s*(?:no\.?|number)$/i.test(label.trim()));
  moveAfter(({label}) => /^status$/i.test(label.trim()), ({label}) => /^(?:current location|request site)$/i.test(label.trim()));
  const isBreakdownDays = ({label}) => /^days of breakdown$/i.test(label.trim());
  // Workflow tables can supply reason before type; enforce type then reason in every table.
  moveAfter(isBreakdownDays, ({label}) => /^(?:reason of breakdown|breakdown reason|reason)$/i.test(label.trim()));
  moveAfter(isBreakdownDays, ({label}) => /^(?:type of breakdown|breakdown type|repair category)$/i.test(label.trim()));
  moveAfter(({label}) => /^(?:reason of breakdown|breakdown reason)$/i.test(label.trim()), ({label}) => /^(?:opening\s+)?(?:hmr|kmr)$/i.test(label.trim()));
  return ordered;
}

export function dateColumnsFirst(columns, statusFirst = true) {
  const isDate = ({ key, label }) => {
    if (/^(start|end|date|time|occurredAt|createdAt|updatedAt|closedAt|verifiedAt|firstTripAt|acceptedAt|arrivalFlaggedAt|misFlaggedAt)$/.test(key)) return true;
    const text = label.trim().toLowerCase();
    if (/\b(by|duration|waiting|delay|left|turn ?around|tat)\b/.test(text)) return false;
    return /\b(date|time|timestamp)\b/.test(text)
      || /^(started|closed|accepted|created|updated|ticket created|vehicle received|red flag raised)$/.test(text)
      || /\b(at|on)$/.test(text);
  };
  // General tables lead with status; workflow tables opt into dates first and their own field order.
  const isStatus = ({ key, label }) => statusFirst && (/^status$/i.test(String(key).replace(/^\d+:/, "")) || label.trim().toLowerCase() === "status");
  return [
    ...columns.filter(isStatus),
    ...columns.filter((column) => !isStatus(column) && isDate(column)),
    ...columns.filter((column) => !isStatus(column) && !isDate(column)),
  ];
}

export function selectTableRows(rows, columns, filters, sort) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const filtered = rows.filter((row) => columns.every((column) => {
    const expected = filters[column.key];
    if (!expected) return true;
    const range = parseDateRange(expected);
    if (range) return matchesDateRange(recordDateKey(column.sortValue?.(row)) || recordDateKey(column.value(row)), range);
    return cellMatchesFilterValues(column.value(row), expected);
  }));
  const column = columns.find((item) => item.key === sort.key);
  if (!column) return filtered;
  const sortValue = (row) => column.sortValue ? column.sortValue(row) : column.value(row);
  if (isDurationColumn(column.label, column.key)) return [...filtered].sort((a, b) => compareDurationValues(sortValue(a), sortValue(b), sort.direction));
  const compare = (a, b) => {
    const left = sortValue(a), right = sortValue(b), leftNumber = Number(left), rightNumber = Number(right);
    if (left !== "" && right !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    return collator.compare(String(left), String(right));
  };
  // Rows without a value ("—" or blank) stay at the bottom whichever way the column is sorted.
  const isEmpty = (value) => value == null || String(value).trim() === "" || String(value).trim() === "—";
  return [...filtered].sort((a, b) => {
    const leftEmpty = isEmpty(sortValue(a)), rightEmpty = isEmpty(sortValue(b));
    if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
    if (leftEmpty && rightEmpty) return 0;
    return compare(a, b) * (sort.direction === "desc" ? -1 : 1);
  });
}

export function tableExportModel(rows, columns, visibleKeys, filters = {}, sort = { key: "", direction: "asc" }) {
  return {
    columns: visibleKeys.map((key) => columns.find((column) => column.key === key)).filter(Boolean),
    rows: selectTableRows(rows, columns, filters, sort),
  };
}

function readStorage(key) {
  try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; }
}
function writeStorage(key, value) {
  try { if (typeof localStorage === "undefined") return; if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable (private mode, quota) */ }
}
// The saved arrangement holds the chosen keys and the full key set at the time, so a column the user hid
// stays hidden while a column added to the table later is appended rather than lost.
export function restoreColumnOrder(storageKey, defaultKeys) {
  const raw = readStorage(storageKey);
  if (!raw) return defaultKeys;
  try {
    const saved = JSON.parse(raw);
    const visible = Array.isArray(saved) ? saved : Array.isArray(saved?.visible) ? saved.visible : null;
    const all = Array.isArray(saved?.all) ? saved.all : visible;
    if (!visible) return defaultKeys;
    const known = visible.filter((key) => defaultKeys.includes(key));
    if (!known.length) return defaultKeys;
    return [...known, ...defaultKeys.filter((key) => !all.includes(key))];
  } catch { return defaultKeys; }
}
export function storeColumnOrder(storageKey, keys, defaultKeys) {
  const isDefault = keys.length === defaultKeys.length && keys.every((key, index) => key === defaultKeys[index]);
  writeStorage(storageKey, isDefault ? null : JSON.stringify({ visible: keys, all: defaultKeys }));
}
