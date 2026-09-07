import React, { useId, useState } from "react";
import { RotateCcw } from "lucide-react";
import { changeDrilldownFilter, drilldownView, equipmentCategoryLabel, equipmentGroupLabel, equipmentMachineLabel } from "./dashboard-drilldown-model.mjs";

const categoryName = (value) => value === "Total vehicles" ? "Vehicles" : value === "Total equipment" ? "Equipment" : value;

export default function DashboardRecordBrowser({ rows, regions, title = "Chart records", initialRegion = "", initialSite = "", requestRecords = false, lifecycleRecords = false, ActionsTable, Status, formatDate }) {
  const [filters, setFilters] = useState({ region: initialRegion, site: initialSite });
  const view = drilldownView(rows, regions, filters);
  const id = useId();
  const choose = (name, value) => setFilters(changeDrilldownFilter(view.selection, name, value));
  const activeFilterCount = ["site", "category", "group", "machine"].filter((name) => view.selection[name]).length;
  const fields = [
    ["site", "Site", "All sites"],
    ["category", "Equipment / Vehicle", "All equipment & vehicles"],
    ["group", "Type", "All types"],
    ["machine", "Machine", "All machines"],
  ];
  const tableKey = JSON.stringify(view.selection);
  const columnCount = 8 + (requestRecords ? 4 : 0) + (lifecycleRecords ? 2 : 0);
  const reset = () => setFilters({ region: view.selection.region });
  return <div className="dashboard-record-browser">
    <div className="dashboard-record-controls">
      <div className="dashboard-record-topline">
        <div className="dashboard-record-tabs" role="tablist" aria-label="Chart records by region">
          {view.regions.map((region, index) => <button key={region.code} type="button" role="tab" id={`${id}-${region.code}`} aria-selected={view.selection.region === region.code} aria-controls={`${id}-records`} tabIndex={view.selection.region === region.code ? 0 : -1}
            onClick={() => choose("region", region.code)} onKeyDown={(event) => {
              const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (!offset && !["Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? view.regions.length - 1 : (index + offset + view.regions.length) % view.regions.length;
              choose("region", view.regions[next].code);
              event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
            }}><span>{region.code}</span><b>{region.rows.length.toLocaleString()}</b></button>)}
        </div>
        <button type="button" className="dashboard-record-reset" onClick={reset} disabled={!activeFilterCount}><RotateCcw size={14} />Reset filters</button>
      </div>
      <div className="dashboard-record-filters">
        {fields.map(([name, label, allLabel]) => <label key={name} htmlFor={`${id}-${name}`}><span>{label}</span><select id={`${id}-${name}`} value={view.selection[name]} onChange={(event) => choose(name, event.target.value)} disabled={!view.options[name].length}>
          <option value="">{allLabel}</option>
          {view.options[name].map(({ value, count }) => <option key={value} value={value}>{name === "category" ? categoryName(value) : value} ({count.toLocaleString()})</option>)}
        </select></label>)}
      </div>
    </div>
    <div id={`${id}-records`} className="dashboard-record-results" role="tabpanel" aria-labelledby={view.selection.region ? `${id}-${view.selection.region}` : undefined}>
      <div className="dashboard-record-summary"><h4>{view.selection.region || "Fleet"} {requestRecords ? "requests" : "fleet list"}</h4><span role="status" aria-live="polite">{view.rows.length.toLocaleString()} of {view.regionTotal.toLocaleString()} records</span></div>
      <div className="dashboard-asset-list">
        <ActionsTable key={tableKey} exportTitle={`${title} · ${view.selection.region || "Fleet"}`}>
          <thead><tr>{requestRecords && <th>Job reference</th>}<th>Equipment name</th><th>Machine / Door no.</th><th>Equipment category</th><th>Equipment group</th><th>Make</th><th>Model</th><th>{requestRecords ? "Request site" : "Current location"}</th><th>Serial / chassis no.</th>{requestRecords && <><th>Repair category</th><th>Status</th><th>Started</th></>}{lifecycleRecords && <><th>Closed</th><th>Verified</th></>}</tr></thead>
          <tbody>{view.rows.length ? view.rows.map((record, index) => <tr key={record.id || `${record.equipmentName}-${index}`}>
            {requestRecords && <td><b>{record.requestReference}</b></td>}<td><b>{record.equipmentName || record.door || "—"}</b></td><td>{equipmentMachineLabel(record)}</td><td>{categoryName(equipmentCategoryLabel(record))}</td><td>{equipmentGroupLabel(record)}</td><td>{record.make || "—"}</td><td>{record.model || "—"}</td><td>{record.requestSite || record.currentLocation || record.location || record.site || "—"}</td><td>{record.manufacturerSerialNo || record.chassisNo || "—"}</td>
            {requestRecords && <><td>{record.repairCategory}</td><td><Status>{record.requestStatus}</Status></td><td>{formatDate(record.requestStart)}</td></>}{lifecycleRecords && <><td>{formatDate(record.requestClosed)}</td><td>{formatDate(record.requestVerified)}</td></>}
          </tr>) : <tr><td colSpan={columnCount}><div className="dashboard-record-empty"><b>No matching {requestRecords ? "requests" : "fleet records"}</b><span>{view.selection.region ? `No records for ${view.selection.region} in this chart selection.` : "No regions available in your current scope."}</span></div></td></tr>}</tbody>
        </ActionsTable>
      </div>
    </div>
  </div>;
}
