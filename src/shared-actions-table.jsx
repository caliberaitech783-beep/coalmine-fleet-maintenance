import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import RecordDateRange from "./record-date-range.jsx";
import { primaryRecordDateColumn } from "./record-date-range.mjs";
import { tableElements, tableCellText, tableModel, projectTableRow, selectTableRows, tableExportModel, dateColumnsFirst, jobReferenceColumnsLast, requestColumnsInWorkflowOrder, SERIAL_COLUMN_KEY, SERIAL_COLUMN_LABEL, restoreColumnOrder, storeColumnOrder } from "./table-actions-model.mjs";
import "./table-actions.css";
import "./sortable-table.css";

const isDataRow = (row) => !(tableElements(row.props.children).length === 1 && Number(tableElements(row.props.children)[0]?.props.colSpan) > 1);

export default function SharedActionsTable({ closedTimeAfterStarted = false, children, Menu, ColumnsDialog, SortDialog, FilterDialog, ExportMenu, FilterableHeader = null, exportTitle = "", printTitle = "", toolbarTarget = null, toolbarPortal = false, recordDateFilter = null, disableDateColumnFilter = false, preserveColumnOrder = false, printReport = null, SavedReports = null, showRowNumbers = true, ...tableProps }) {
  const { sections, columns: originalColumns } = tableModel(children);
  const isWorkflowTable = /\b(workflow-table|breakdown-table-auto-fit)\b/.test(tableProps.className || "");
  const columns = preserveColumnOrder ? jobReferenceColumnsLast(originalColumns) : isWorkflowTable ? requestColumnsInWorkflowOrder(originalColumns, /\bworkflow-table\b/.test(tableProps.className || "")) : jobReferenceColumnsLast(dateColumnsFirst(originalColumns));
  if (closedTimeAfterStarted) {
    const closed = columns.findIndex(column => column.label.trim().toLowerCase() === "closed time");
    if (closed >= 0 && columns.some(column => column.label.trim().toLowerCase() === "started")) {
      const [column] = columns.splice(closed, 1);
      columns.splice(columns.findIndex(item => item.label.trim().toLowerCase() === "started") + 1, 0, column);
    }
  }
  const schema = columns.map((column) => column.key).join("|");
  return <TableView key={schema} {...{ sections, columns, Menu, ColumnsDialog, SortDialog, FilterDialog, ExportMenu, FilterableHeader, exportTitle, printTitle, toolbarTarget, toolbarPortal, recordDateFilter, disableDateColumnFilter, showRowNumbers, printReport, SavedReports, tableProps }} />;
}

function TableView({ sections, columns, Menu, ColumnsDialog, SortDialog, FilterDialog, ExportMenu, FilterableHeader, exportTitle, printTitle, toolbarTarget, toolbarPortal, recordDateFilter, disableDateColumnFilter, showRowNumbers, printReport, SavedReports, tableProps }) {
  // Remember each table's column arrangement (order and visibility) in this browser so it survives a refresh.
  const columnStorageKey = `nerveCenterTableColumns:${exportTitle || printTitle || tableProps.className || "table"}`;
  const [visible, setVisibleState] = useState(() => restoreColumnOrder(columnStorageKey, columns.map((column) => column.key)));
  const setVisible = (keys) => { setVisibleState(keys); storeColumnOrder(columnStorageKey, keys, columns.map((column) => column.key)); };
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [dialog, setDialog] = useState("");
  // "save" | "saved" while a saved-report dialog is open (see SavedReports).
  const [savedReportDialog, setSavedReportDialog] = useState("");
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
  const dataRows = rows.filter(isDataRow);
  const dateColumn = primaryRecordDateColumn(columns);
  const disabledDateKey = disableDateColumnFilter ? dateColumn?.key : undefined;
  const filterableColumns = columns.filter((column) => column.key !== disabledDateKey);
  const externalSort = columns.find((column) => column.header.props.sort)?.header.props.sort;
  const effectiveFilters = Object.fromEntries(filterableColumns.map((column) => [column.key, column.header.props.onFilterChange ? column.header.props.filterValue || "" : filters[column.key] || ""]));
  const updateFilter = (key, value) => {
    if (key === disabledDateKey) return;
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
  const localFilters = Object.fromEntries(filterableColumns.filter((column) => !column.header.props.onFilterChange).map((column) => [column.key, filters[column.key]]));
  const bodySelections = new Map(sections.filter((section) => section.type === "tbody").map((section) => {
    const sectionRows = tableElements(section.props.children), actual = sectionRows.filter(isDataRow);
    return [section, actual.length ? selectTableRows(actual, columns, localFilters, sort) : sectionRows];
  }));
  // Number the final displayed order, including tables with more than one body.
  // Keep this presentation column out of the data's sort/filter/column indices.
  const numberedRows = showRowNumbers ? [...bodySelections.values()].flat().filter(isDataRow) : [];
  const rowNumbers = new Map(numberedRows.map((row, index) => [row, index + 1]));
  // Distinct values per column for the heading filter popovers, taken from the full (unfiltered) table.
  const columnValues = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return Object.fromEntries(columns.map((column) => [column.key, [...new Set(dataRows.map((row) => column.value(row)).filter(Boolean))].sort((a, b) => collator.compare(a, b))]));
  }, [columns, dataRows]);
  const exportData = ExportMenu && exportTitle ? tableExportModel(dataRows, columns, visible, localFilters, sort) : null;
  const printData = ExportMenu && printTitle ? exportData || tableExportModel(dataRows, columns, visible, localFilters, sort) : null;
  const smartPrintData = ExportMenu && (printTitle || exportTitle) ? tableExportModel(dataRows, columns, columns.map(column => column.key), localFilters, sort) : null;
  if (showRowNumbers) {
    const numberColumn = { key: SERIAL_COLUMN_KEY, label: SERIAL_COLUMN_LABEL, value: (row) => rowNumbers.get(row) };
    // Print can reuse the export model; decorate each distinct model just once.
    for (const data of new Set([exportData, printData, smartPrintData])) if (data) {
      data.columns = [numberColumn, ...data.columns];
      data.rows = numberedRows;
    }
  }
  // Include the existing header's complete value list, not only currently filtered rows.
  const filterRows = filterableColumns.flatMap((column) => (column.header.props.values || []).map((value) => ({ tableActionValue: { key: column.key, value } })));
  const filterColumns = filterableColumns.map((column) => ({ ...column, value: (row) => row.tableActionValue ? row.tableActionValue.key === column.key ? row.tableActionValue.value : "" : column.value(row) }));
  const reset = () => { clearFilters(); if(recordDateFilter!==false)recordDateFilter?.onChange(""); applySort("", "asc"); setVisible(columns.map((column) => column.key)); };
  const dateControl = recordDateFilter===false ? null : recordDateFilter || (dateColumn ? { label: dateColumn.label, value: effectiveFilters[dateColumn.key], onChange: (value) => updateFilter(dateColumn.key, value) } : null);
  const dateRangeControl = dateControl && <RecordDateRange {...dateControl} />;
  // Saved reports: named views of this table (visible columns, filters, sort, date range).
  // The SavedReports panel owns storage and dialogs; this table only exposes its view.
  const reportTitle = printTitle || exportTitle || "";
  const canPrintReport = Boolean(printReport && smartPrintData);
  const printModelRef = useRef(null);
  printModelRef.current = { title: reportTitle, columns: smartPrintData?.columns || [], rows: smartPrintData?.rows || [] };
  const printCurrentView = () => { if (canPrintReport) printReport(printModelRef.current); };
  const currentView = () => ({ visible, filters: effectiveFilters, sort: sort.key ? sort : externalSort || sort, dateRange: dateControl?.value || "" });
  const applySavedView = (view) => {
    setVisible(view.visible.length ? view.visible : columns.map((column) => column.key));
    const localOnly = {};
    columns.forEach((column) => {
      if (column.key === disabledDateKey) return;
      const value = view.filters[column.key] || "";
      if (column.header.props.onFilterChange) column.header.props.onFilterChange(value);
      else if (value) localOnly[column.key] = value;
    });
    setFilters(localOnly);
    applySort(view.sort.key, view.sort.direction);
    if (recordDateFilter !== false && dateControl) dateControl.onChange(view.dateRange || "");
  };
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
      if (FilterableHeader && column.key !== disabledDateKey) {
        return <FilterableHeader key={cell.key ?? column.key} label={column.label} sortKey={column.key} sort={sort} onSort={applySort}
          open={openFilter === column.key} onToggle={(key) => setOpenFilter((current) => current === key ? null : key)}
          values={columnValues[column.key] || []} filterValue={filters[column.key] || ""} onFilterChange={(value) => updateFilter(column.key, value)}
          dateSortOnly={cell.props["data-filter-mode"] === "date-sort"} />;
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
      <span className="shared-table-record-count" role="status">{[...bodySelections.values()].flat().filter(isDataRow).length} of {dataRows.length} records</span>
      {printData && dateRangeControl}
      {printData && <ExportMenu printOnly title={printTitle} columns={printData.columns} rows={printData.rows} smartPrintColumns={smartPrintData.columns} smartPrintRows={smartPrintData.rows} />}
      <Menu resetLabel="Reset table" activeFilterCount={Object.values(effectiveFilters).filter(Boolean).length} onColumns={() => setDialog("columns")} onFilter={() => setDialog("filter")} onSort={() => setDialog("sort")} onClearSort={() => applySort("", "asc")} onReset={reset} onSaveReport={SavedReports ? () => setSavedReportDialog("save") : undefined} onSavedReports={SavedReports ? () => setSavedReportDialog("saved") : undefined} />
      {!printData && dateRangeControl}
      {exportData && <ExportMenu title={exportTitle} columns={exportData.columns} rows={exportData.rows} smartPrintColumns={smartPrintData.columns} smartPrintRows={smartPrintData.rows} />}
      {dialog === "columns" && <ColumnsDialog columns={columns} visibleColumnKeys={visible} onApply={(keys) => { setVisible(keys); setDialog(""); }} onClose={() => setDialog("")} />}
      {dialog === "sort" && <SortDialog columns={columns} sort={sort.key ? sort : externalSort || sort} onApply={applySort} onClose={() => setDialog("")} />}
      {SavedReports && <SavedReports title={reportTitle} tableKey={tableProps.className || ""} columns={columns} open={savedReportDialog} onOpenChange={setSavedReportDialog} currentView={currentView} onApply={applySavedView} canPrint={canPrintReport} onPrint={printCurrentView} />}
      <FilterDialog columns={filterColumns} rows={[...dataRows, ...filterRows]} filters={effectiveFilters} onFilterChange={updateFilter} onClearFilters={clearFilters} open={dialog === "filter"} onOpenChange={(open) => setDialog(open ? "filter" : "")} hideTrigger dialogMode />
    </div>
  );
  return <>
    {toolbarTarget ? createPortal(actionsToolbar, toolbarTarget) : toolbarPortal ? null : actionsToolbar}
    <table {...tableProps}>{sections.map((section) => {
      if (showRowNumbers && section.type === "colgroup") return React.cloneElement(section, {}, <col key="row-number" />, section.props.children);
      if (!["thead", "tbody", "tfoot"].includes(section.type)) return section;
      let sectionRows = tableElements(section.props.children);
      if (section.type === "thead") sectionRows = sectionRows.map((row, position) => position === sectionRows.length - 1 ? sortableHeaderRow(row) : row);
      if (section.type === "tbody") {
        const hadData = sectionRows.some(isDataRow);
        sectionRows = bodySelections.get(section);
        if (hadData && !sectionRows.length) return React.cloneElement(section, {}, <tr><td colSpan={Math.max(1, indices.length + (showRowNumbers ? 1 : 0))} className="empty-state">No matching records</td></tr>);
      }
      return React.cloneElement(section, {}, sectionRows.map((row, position) => {
        const projected = projectTableRow(row, indices);
        if (!showRowNumbers) return projected;
        const cells = tableElements(projected.props.children);
        if (section.type === "thead") return position === 0 ? React.cloneElement(projected, {},
          <th key="row-number" className="table-serial-header" scope="col" rowSpan={sectionRows.length > 1 ? sectionRows.length : undefined}>{SERIAL_COLUMN_LABEL}</th>, cells) : projected;
        if (!isDataRow(row)) return React.cloneElement(projected, {}, cells.map((cell) => React.cloneElement(cell, { colSpan: Math.max(1, indices.length + 1) })));
        return React.cloneElement(projected, {}, <td key="row-number" className="table-serial-cell">{section.type === "tbody" ? rowNumbers.get(row) : ""}</td>, cells);
      }));
    })}</table>
  </>;
}
