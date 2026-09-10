import React from "react";
import { matchesDateRange, parseDateRange } from "./date-range-filter.mjs";

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
    React.cloneElement(cell, { key: `${cell.key || index}:${position}`, ...(cell.props.colSpan || span > 1 ? { colSpan: span } : {}) }),
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
export function dateColumnsFirst(columns) {
  const isDate = ({ key, label }) => {
    if (/^(start|end|date|time|occurredAt|createdAt|updatedAt|closedAt|verifiedAt|firstTripAt|acceptedAt|arrivalFlaggedAt|misFlaggedAt)$/.test(key)) return true;
    const text = label.trim().toLowerCase();
    if (/\b(by|duration|waiting|delay|turn ?around|tat)\b/.test(text)) return false;
    return /\b(date|time|timestamp)\b/.test(text)
      || /^(started|closed|accepted|created|updated|ticket created|vehicle received|red flag raised)$/.test(text)
      || /\b(at|on)$/.test(text);
  };
  return [...columns.filter(isDate), ...columns.filter((column) => !isDate(column))];
}

export function selectTableRows(rows, columns, filters, sort) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const filtered = rows.filter((row) => columns.every((column) => {
    const expected = filters[column.key];
    if (!expected) return true;
    const range = parseDateRange(expected);
    if (range) return matchesDateRange(column.sortValue ? column.sortValue(row) : column.value(row), range) || matchesDateRange(column.value(row), range);
    return column.value(row) === (expected === "__empty_table_filter_value__" ? "" : expected);
  }));
  const column = columns.find((item) => item.key === sort.key);
  if (!column) return filtered;
  const sortValue = (row) => column.sortValue ? column.sortValue(row) : column.value(row);
  const compare = (a, b) => {
    const left = sortValue(a), right = sortValue(b), leftNumber = Number(left), rightNumber = Number(right);
    if (left !== "" && right !== "" && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
    return collator.compare(String(left), String(right));
  };
  return [...filtered].sort((a, b) => compare(a, b) * (sort.direction === "desc" ? -1 : 1));
}

export function tableExportModel(rows, columns, visibleKeys, filters = {}, sort = { key: "", direction: "asc" }) {
  return {
    columns: visibleKeys.map((key) => columns.find((column) => column.key === key)).filter(Boolean),
    rows: selectTableRows(rows, columns, filters, sort),
  };
}
