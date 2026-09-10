import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { tableElements, tableCellText, tableModel, projectTableRow, selectTableRows, tableExportModel, dateColumnsFirst } from "./table-actions-model.mjs";
import "./table-actions.css";
import "./sortable-table.css";

export default function SharedActionsTable({ children, Menu, ColumnsDialog, SortDialog, FilterDialog, ExportMenu, FilterableHeader = null, exportTitle = "", printTitle = "", toolbarTarget = null, toolbarPortal = false, ...tableProps }) {
  const { sections, columns: originalColumns } = tableModel(children);
  const columns = dateColumnsFirst(originalColumns);
  const schema = columns.map((column) => column.key).join("|");
  return <TableView key={schema} {...{ sections, columns, Menu, ColumnsDialog, SortDialog, FilterDialog, ExportMenu, FilterableHeader, exportTitle, printTitle, toolbarTarget, toolbarPortal, tableProps }} />;
}

function TableView({ sections, columns, Menu, ColumnsDialog, SortDialog, FilterDialog, ExportMenu, FilterableHeader, exportTitle, printTitle, toolbarTarget, toolbarPortal, tableProps }) {
  const [visible, setVisible] = useState(columns.map((column) => column.key));
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [dialog, setDialog] = useState("");
  // Which plain column heading currently shows its sort-and-filter popover.
  const [openFilter, setOpenFilter] = useState(null);
  useEffect(() => {
    if (!openFilter) return undefined;
    const closeFilter = (event) => {
      if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null);
    };
    document.addEventListener("pointerdown", closeFilter);
    return () => document.removeEventListener("pointerdown", closeFilter);
  }, [openFilter]);
  const indices = visible.map((key) => columns.find((column) => column.key === key)?.index).filter((index) => index !== undefined);
  const rows = sections.filter((section) => section.type === "tbody").flatMap((section) => tableElements(section.props.children));
  const dataRows = rows.filter((row) => !(tableElements(row.props.children).length === 1 && Number(tableElements(row.props.children)[0]?.props.colSpan) > 1));
  const externalSort = columns.find((column) => column.header.props.sort)?.header.props.sort;
  const effectiveFilters = Object.fromEntries(columns.map((column) => [column.key, column.header.props.onFilterChange ? column.header.props.filterValue || "" : filters[column.key] || ""]));
  const updateFilter = (key, value) => {
    const column = columns.find((item) => item.key === key);
    if (column?.header.props.onFilterChange) column.header.props.onFilterChange(value);
    else setFilters((current) => ({ ...current, [key]: value }));
  };
  const clearFilters = () => {
    setFilters({});
    columns.forEach((column) => { if (column.header.props.filterValue) column.header.props.onFilterChange?.(""); });
  };
  const applySort = (key, direction) => {
    const column = columns.find((item) => item.key === key);
    const external = column?.header.props.onSort || (!key && columns.find((item) => item.header.props.onSort)?.header.props.onSort);
    if (external) { setSort({ key: "", direction: "asc" }); external(key, direction); }
    else setSort({ key, direction });
    setDialog("");
  };
  const localFilters = Object.fromEntries(columns.filter((column) => !column.header.props.onFilterChange).map((column) => [column.key, filters[column.key]]));
  // Distinct values per column for the heading filter popovers, taken from the full (unfiltered) table.
  const columnValues = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return Object.fromEntries(columns.map((column) => [column.key, [...new Set(dataRows.map((row) => column.value(row)).filter(Boolean))].sort((a, b) => collator.compare(a, b))]));
  }, [columns, dataRows]);
  const exportData = ExportMenu && exportTitle ? tableExportModel(dataRows, columns, visible, localFilters, sort) : null;
  const printData = ExportMenu && printTitle ? exportData || tableExportModel(dataRows, columns, visible, localFilters, sort) : null;
  // Include the existing header's complete value list, not only currently filtered rows.
  const filterRows = columns.flatMap((column) => (column.header.props.values || []).map((value) => ({ tableActionValue: { key: column.key, value } })));
  const filterColumns = columns.map((column) => ({ ...column, value: (row) => row.tableActionValue ? row.tableActionValue.key === column.key ? row.tableActionValue.value : "" : column.value(row) }));
  const reset = () => { clearFilters(); applySort("", "asc"); setVisible(columns.map((column) => column.key)); };
  // Plain <th> headings become sort-and-filter headers (or sort buttons when no FilterableHeader is supplied);
  // headers that bring their own sorting (onSort) are left untouched.
  const sortableHeaderRow = (row) => {
    const cells = tableElements(row.props.children);
    let slot = 0;
    return React.cloneElement(row, {}, cells.map((cell) => {
      const index = slot, span = Math.max(1, Number(cell.props.colSpan) || 1);
      slot += span;
      const column = columns.find((item) => item.index === index);
      if (cell.type !== "th" || !column || span > 1 || cell.props.onSort || !tableCellText(cell).trim() || column.label === "Actions") return cell;
      const active = sort.key === column.key;
      if (FilterableHeader) {
        return <FilterableHeader key={cell.key ?? column.key} label={column.label} sortKey={column.key} sort={sort} onSort={applySort}
          open={openFilter === column.key} onToggle={(key) => setOpenFilter((current) => current === key ? null : key)}
          values={columnValues[column.key] || []} filterValue={filters[column.key] || ""} onFilterChange={(value) => updateFilter(column.key, value)} />;
      }
      const Icon = active ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
      return React.cloneElement(cell, { "aria-sort": active ? (sort.direction === "asc" ? "ascending" : "descending") : "none" },
        <button type="button" className={`sort-header${active ? " active" : ""}`} title={`Sort by ${column.label}`} onClick={() => applySort(column.key, active && sort.direction === "asc" ? "desc" : "asc")}>
          <span>{cell.props.children}</span><Icon aria-hidden="true" />
        </button>);
    }));
  };
  const actionsToolbar = (
    <div className="shared-table-actions-toolbar" onClick={(event) => event.stopPropagation()}>
      {printData && <ExportMenu printOnly title={printTitle} columns={printData.columns} rows={printData.rows} />}
      <Menu resetLabel="Reset table" activeFilterCount={Object.values(effectiveFilters).filter(Boolean).length} onColumns={() => setDialog("columns")} onFilter={() => setDialog("filter")} onSort={() => setDialog("sort")} onClearSort={() => applySort("", "asc")} onReset={reset} />
      {exportData && <ExportMenu title={exportTitle} columns={exportData.columns} rows={exportData.rows} />}
      {dialog === "columns" && <ColumnsDialog columns={columns} visibleColumnKeys={visible} onApply={(keys) => { setVisible(keys); setDialog(""); }} onClose={() => setDialog("")} />}
      {dialog === "sort" && <SortDialog columns={columns} sort={sort.key ? sort : externalSort || sort} onApply={applySort} onClose={() => setDialog("")} />}
      <FilterDialog columns={filterColumns} rows={[...dataRows, ...filterRows]} filters={effectiveFilters} onFilterChange={updateFilter} onClearFilters={clearFilters} open={dialog === "filter"} onOpenChange={(open) => setDialog(open ? "filter" : "")} hideTrigger dialogMode />
    </div>
  );
  return <>
    {toolbarTarget ? createPortal(actionsToolbar, toolbarTarget) : toolbarPortal ? null : actionsToolbar}
    <table {...tableProps}>{sections.map((section) => {
      if (!["thead", "tbody", "tfoot"].includes(section.type)) return section;
      let sectionRows = tableElements(section.props.children);
      if (section.type === "thead") sectionRows = sectionRows.map((row, position) => position === sectionRows.length - 1 ? sortableHeaderRow(row) : row);
      if (section.type === "tbody") {
        const actual = sectionRows.filter((row) => !(tableElements(row.props.children).length === 1 && Number(tableElements(row.props.children)[0]?.props.colSpan) > 1));
        if (actual.length) {
          sectionRows = selectTableRows(actual, columns, localFilters, sort);
          if (!sectionRows.length) return React.cloneElement(section, {}, <tr><td colSpan={Math.max(1, indices.length)} className="empty-state">No matching records</td></tr>);
        }
      }
      return React.cloneElement(section, {}, sectionRows.map((row) => projectTableRow(row, indices)));
    })}</table>
  </>;
}
