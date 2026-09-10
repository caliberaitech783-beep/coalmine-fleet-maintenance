import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { changeDrilldownFilter, drilldownView, equipmentCategoryLabel, equipmentGroupLabel, equipmentMachineLabel } from "./dashboard-drilldown-model.mjs";
import { calculateBreakdownMinutes, formatBreakdownDaysHours } from "../breakdown-duration.mjs";
import { requestStatusSortRank } from "./request-status.mjs";

const categoryName = (value) => value === "Total vehicles" ? "Vehicles" : value === "Total equipment" ? "Equipment" : value;

function moveBetweenTabs(event, index, options, choose, selector) {
  const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!offset && !["Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + offset + options.length) % options.length;
  choose(options[next].value);
  const button = event.currentTarget.parentElement.querySelectorAll(selector)[next];
  button.focus();
  button.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function FilterTabRow({ name, label, allLabel, options, value, choose, resultsId }) {
  const stripRef = useRef(null);
  const [scrollable, setScrollable] = useState({ left: false, right: false });
  const optionKey = options.map((option) => option.value).join("|");
  const updateScroll = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const left = strip.scrollLeft > 1, right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
    setScrollable((current) => current.left === left && current.right === right ? current : { left, right });
  };
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return undefined;
    updateScroll();
    const observer = new ResizeObserver(updateScroll);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [optionKey]);
  const tabs = [{ value: "", label: allLabel, count: options.reduce((total, option) => total + option.count, 0) }, ...options];
  return <div className="dashboard-record-level" data-level={name}>
    <span className="dashboard-record-level-label">{label}</span>
    {options.length ? <div className="dashboard-record-level-navigation" data-scrollable={scrollable.left || scrollable.right}>
      <button type="button" className="dashboard-record-tab-scroll" aria-label={`Scroll ${label} choices left`} disabled={!scrollable.left} onClick={() => stripRef.current?.scrollBy({ left: -320, behavior: "smooth" })}><ChevronLeft size={16} /></button>
      <div className="dashboard-record-level-tabs" role="group" aria-label={`${label} choices`} ref={stripRef} onScroll={updateScroll}>
        {tabs.map((tab, index) => <button type="button" key={tab.value} aria-pressed={value === tab.value} aria-controls={resultsId} tabIndex={value === tab.value ? 0 : -1}
          onClick={() => choose(name, tab.value)} onKeyDown={(event) => moveBetweenTabs(event, index, tabs, (next) => choose(name, next), "button")}
          className={tab.value ? "" : "dashboard-record-all-tab"}><span>{tab.label || (name === "category" ? categoryName(tab.value) : tab.value)}</span><b>{tab.count.toLocaleString()}</b></button>)}
      </div>
      <button type="button" className="dashboard-record-tab-scroll" aria-label={`Scroll ${label} choices right`} disabled={!scrollable.right} onClick={() => stripRef.current?.scrollBy({ left: 320, behavior: "smooth" })}><ChevronRight size={16} /></button>
    </div> : <span className="dashboard-record-level-empty">No choices in this selection</span>}
  </div>;
}

export default function DashboardRecordBrowser({ rows, regions, rowsAreScoped = false, title = "Chart records", initialRegion = "", initialSite = "", requestRecords = false, lifecycleRecords = false, ActionsTable, Status, formatDate, RequestTimelineButton = null, timelineToken = "", Dialog = null }) {
  const [filters, setFilters] = useState({ region: initialRegion, site: initialSite });
  const [openedLevel, setOpenedLevel] = useState(initialSite ? 2 : initialRegion ? 1 : 0);
  const view = drilldownView(rows, regions, filters, { rowsAreScoped });
  const id = useId();
  const levels = ["region", "site", "category", "group"];
  const invalidParent = levels.findIndex((name) => filters[name] && filters[name] !== view.selection[name]);
  const selectedLevel = levels.slice(0, -1).reduce((depth, name, index) => view.selection[name] ? index + 1 : depth, 0);
  const visibleLevel = view.selection.region ? Math.max(selectedLevel, invalidParent < 0 ? openedLevel : Math.min(openedLevel, invalidParent)) : 0;
  const choose = (name, value) => {
    setFilters(changeDrilldownFilter(view.selection, name, value));
    setOpenedLevel(Math.min(levels.indexOf(name) + 1, levels.length - 1));
  };
  const activeFilterCount = ["region", "site", "category", "group"].filter((name) => view.selection[name] && view.selection[name] !== "all").length;
  const fields = [
    ["site", "Site", "All sites"],
    ["category", "Equipment / Vehicle", "All equipment & vehicles"],
    ["group", "Type", "All types"],
  ];
  const tableKey = JSON.stringify(view.selection);
  const listRef = useRef(null);
  // Every new selection shows its fleet list from the top, not where the previous list was scrolled.
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [tableKey]);
  const columnCount = 9 + (requestRecords ? 2 : 0) + (lifecycleRecords ? 3 : 0);
  // Open requests keep counting: refresh the days-of-breakdown clock every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!requestRecords) return undefined;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [requestRecords]);
  const reset = () => { setFilters({}); setOpenedLevel(0); };
  const sortableDate = (value) => (value && value !== "—" ? String(value) : "");
  // The time breakdown opens from the Days of breakdown value; the job reference stays plain text.
  const breakdownCell = (record) => {
    const label = formatBreakdownDaysHours(record.requestStart, record.requestClosed, now), reference = record.requestReference;
    return RequestTimelineButton && reference && reference !== "—"
      ? <RequestTimelineButton reference={reference} token={timelineToken} Dialog={Dialog} label={label} />
      : <b>{label}</b>;
  };
  return <div className="dashboard-record-browser">
    <div className="dashboard-record-controls">
      <div className="dashboard-record-topline">
        <div className="dashboard-record-tabs" role="tablist" aria-label="Chart records by region">
          {view.regions.map((region, index) => <button key={region.code} type="button" role="tab" id={`${id}-${region.code}`} aria-selected={view.selection.region === region.code} aria-controls={`${id}-records`} tabIndex={view.selection.region === region.code ? 0 : -1}
            onClick={() => choose("region", region.code)} onKeyDown={(event) => moveBetweenTabs(event, index, view.regions.map((item) => ({ value: item.code })), (next) => choose("region", next), '[role="tab"]')}><span>{region.label}</span><b>{region.rows.length.toLocaleString()}</b></button>)}
        </div>
        <button type="button" className="dashboard-record-reset" onClick={reset} disabled={!activeFilterCount && visibleLevel <= selectedLevel}><RotateCcw size={14} />Reset selection</button>
      </div>
      {visibleLevel === 0 && <p className="dashboard-record-hierarchy-hint">No regions available in your current scope.</p>}
      <div className="dashboard-record-hierarchy">
        {fields.slice(0, visibleLevel).map(([name, label, allLabel], index) => (index === 0 || view.options[fields[index - 1][0]].length > 0) && <FilterTabRow key={`${name}-${levels.slice(0, index + 1).map((parent) => view.selection[parent]).join("|")}`} name={name} label={label} allLabel={allLabel} options={view.options[name]} value={view.selection[name]} choose={choose} resultsId={`${id}-records`} />)}
      </div>
    </div>
    <div id={`${id}-records`} className="dashboard-record-results" role="tabpanel" aria-labelledby={view.selection.region ? `${id}-${view.selection.region}` : undefined}>
      <div className="dashboard-record-summary"><h4>{view.regionLabel} {requestRecords ? "requests" : "fleet list"}</h4><span role="status" aria-live="polite">{view.rows.length.toLocaleString()} of {view.regionTotal.toLocaleString()} records</span></div>
      <div className="dashboard-asset-list" ref={listRef}>
        <ActionsTable key={tableKey} exportTitle={`${title} · ${view.regionLabel}`} printTitle={`${title} · ${view.regionLabel}`}>
          <thead><tr>{requestRecords && <th>Job reference</th>}<th>Status</th><th>Started</th><th>Days of breakdown</th><th>Machine / Door no.</th><th>Equipment category</th><th>Equipment group</th><th>Model</th><th>{requestRecords ? "Request site" : "Current location"}</th><th>Serial / chassis no.</th>{requestRecords && <th>Repair category</th>}{lifecycleRecords && <><th>Closed</th><th>MIS verified at</th><th>First trip time</th></>}</tr></thead>
          <tbody>{view.rows.length ? view.rows.map((record, index) => <tr key={record.id || `${record.equipmentName}-${index}`}>
            {requestRecords && <td><b>{record.requestReference}</b></td>}<td data-sort-value={requestStatusSortRank(record.requestStatus)}><Status>{record.requestStatus || "—"}</Status></td><td data-sort-value={sortableDate(record.requestStart)}>{formatDate(record.requestStart)}</td><td data-sort-value={calculateBreakdownMinutes(record.requestStart, record.requestClosed, now)}>{breakdownCell(record)}</td><td>{equipmentMachineLabel(record)}</td><td>{categoryName(equipmentCategoryLabel(record))}</td><td>{equipmentGroupLabel(record)}</td><td>{record.model || "—"}</td><td>{record.requestSite || record.currentLocation || record.location || record.site || "—"}</td><td>{record.manufacturerSerialNo || record.chassisNo || "—"}</td>
            {requestRecords && <td>{record.repairCategory}</td>}{lifecycleRecords && <><td data-sort-value={sortableDate(record.requestClosed)}>{formatDate(record.requestClosed)}</td><td data-sort-value={sortableDate(record.requestVerified)}>{formatDate(record.requestVerified, true)}</td><td data-sort-value={sortableDate(record.requestFirstTrip)}>{formatDate(record.requestFirstTrip, true)}</td></>}
          </tr>) : <tr><td colSpan={columnCount}><div className="dashboard-record-empty"><b>No matching {requestRecords ? "requests" : "fleet records"}</b><span>{view.selection.region ? `No records for ${view.regionLabel} in this chart selection.` : "No regions available in your current scope."}</span></div></td></tr>}</tbody>
        </ActionsTable>
      </div>
    </div>
  </div>;
}
