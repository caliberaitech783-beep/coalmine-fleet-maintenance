import React from "react";

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
  })) : [];
  return { sections, columns };
}

export function selectTableRows(rows, columns, filters, sort) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  const filtered = rows.filter((row) => columns.every((column) => {
    const expected = filters[column.key];
    return !expected || column.value(row) === (expected === "__empty_table_filter_value__" ? "" : expected);
  }));
  const column = columns.find((item) => item.key === sort.key);
  return column ? [...filtered].sort((a, b) => collator.compare(column.value(a), column.value(b)) * (sort.direction === "desc" ? -1 : 1)) : filtered;
}
