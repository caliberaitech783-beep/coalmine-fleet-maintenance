import React, { useState } from "react";
import { tableElements, tableModel, projectTableRow, selectTableRows } from "./table-actions-model.mjs";
import "./table-actions.css";

export default function SharedActionsTable({ children, Menu, ColumnsDialog, SortDialog, FilterDialog, ...tableProps }) {
  const { sections, columns } = tableModel(children);
  const schema = columns.map((column) => column.key).join("|");
  return <TableView key={schema} {...{ sections, columns, Menu, ColumnsDialog, SortDialog, FilterDialog, tableProps }} />;
}

function TableView({ sections, columns, Menu, ColumnsDialog, SortDialog, FilterDialog, tableProps }) {
  const [visible, setVisible] = useState(columns.map((column) => column.key));
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [dialog, setDialog] = useState("");
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
  // Include the existing header's complete value list, not only currently filtered rows.
  const filterRows = columns.flatMap((column) => (column.header.props.values || []).map((value) => ({ tableActionValue: { key: column.key, value } })));
  const filterColumns = columns.map((column) => ({ ...column, value: (row) => row.tableActionValue ? row.tableActionValue.key === column.key ? row.tableActionValue.value : "" : column.value(row) }));
  const reset = () => { clearFilters(); applySort("", "asc"); setVisible(columns.map((column) => column.key)); };
  return <>
    <div className="shared-table-actions-toolbar" onClick={(event) => event.stopPropagation()}>
      <Menu resetLabel="Reset table" activeFilterCount={Object.values(effectiveFilters).filter(Boolean).length} onColumns={() => setDialog("columns")} onFilter={() => setDialog("filter")} onSort={() => setDialog("sort")} onClearSort={() => applySort("", "asc")} onReset={reset} />
      {dialog === "columns" && <ColumnsDialog columns={columns} visibleColumnKeys={visible} onApply={(keys) => { setVisible(keys); setDialog(""); }} onClose={() => setDialog("")} />}
      {dialog === "sort" && <SortDialog columns={columns} sort={sort.key ? sort : externalSort || sort} onApply={applySort} onClose={() => setDialog("")} />}
      <FilterDialog columns={filterColumns} rows={[...dataRows, ...filterRows]} filters={effectiveFilters} onFilterChange={updateFilter} onClearFilters={clearFilters} open={dialog === "filter"} onOpenChange={(open) => setDialog(open ? "filter" : "")} hideTrigger dialogMode />
    </div>
    <table {...tableProps}>{sections.map((section) => {
      if (!["thead", "tbody", "tfoot"].includes(section.type)) return section;
      let sectionRows = tableElements(section.props.children);
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
