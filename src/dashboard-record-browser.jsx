import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { changeDrilldownFilter, drilldownView, equipmentCategoryLabel, equipmentGroupLabel, equipmentMachineLabel } from "./dashboard-drilldown-model.mjs";
import { calculateBreakdownMinutes, formatBreakdownDaysHours } from "../breakdown-duration.mjs";
import { requestStatusSortRank } from "./request-status.mjs";
import { filterRecordsByDate } from "./record-date-range.mjs";
import { matchesSmartSearch } from "../smart-search.mjs";

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

export default function DashboardRecordBrowser({ rows, movementDateControl = null, regions, rowsAreScoped = false, groupBySite = false, title = "Chart records", summaryLabel = "", initialRegion = "", initialSite = "", hideHierarchyFilters = false, showDateFilter = true, showRowNumbers = true, hideCurrentLocation = false, hideSiteColumn = false, hideEquipmentCategory = false, requestRecords = false, lifecycleRecords = false, lifecycleEvent = "", showBdClosingTime = false, onHourlyReport = null, bdBalanceColumns = false, extraColumns = [], ActionsTable, Status, formatDate, RequestTimelineButton = null, timelineToken = "", Dialog = null, Remarks = null }) {
  const [filters, setFilters] = useState({ region: initialRegion, site: initialSite });
  const [openedLevel, setOpenedLevel] = useState(initialSite ? 2 : initialRegion ? 1 : 0);
  const [recordDateRange, setRecordDateRange] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [toolbarTarget, setToolbarTarget] = useState(null);
  // Opening balances already select carried requests in the parent; Started must not filter them again.
  const idleDateFilter = lifecycleEvent === "idle" || /\bidle\b/i.test(title);
  const datedRows = movementDateControl ? rows : showDateFilter ? filterRecordsByDate(rows, recordDateRange, (record) => idleDateFilter ? record.requestIdleAt : record.requestStart) : rows;
  // With no internal hierarchy, the parent supplies the complete filtered selection.
  const view = drilldownView(datedRows.filter((row) => matchesSmartSearch(searchQuery, row)), regions, hideHierarchyFilters ? {} : filters, { rowsAreScoped });
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
  const showIdleDate = lifecycleEvent === "idle" || /idle/i.test(title) || rows.some(row => ["idle", "ideal"].includes(String(row.requestStatus || "").toLowerCase()));
  const showLocationColumn = !hideSiteColumn && (requestRecords || !hideCurrentLocation);
  const showCategoryColumn = requestRecords || !hideEquipmentCategory;
  const showClosedColumn = lifecycleRecords && !["idle", "opened"].includes(lifecycleEvent);
  const showVerificationColumns = lifecycleRecords && !["production", "closed", "idle", "opened"].includes(lifecycleEvent);
  // Daily updates posted on the linked request open inline, the same way as in the workflow tables.
  const showUpdatesColumn = Boolean(Remarks) && (requestRecords || bdBalanceColumns);
  const columnCount = 9 + (showIdleDate ? 1 : 0) + (requestRecords ? 4 : 0) + (showUpdatesColumn ? 1 : 0) + (showClosedColumn ? 1 : 0) + (showVerificationColumns ? 2 : 0) + (showBdClosingTime ? 1 : 0) - (showLocationColumn ? 0 : 1) - (showCategoryColumn ? 0 : 1) + (bdBalanceColumns ? 4 : 0) + extraColumns.length;
  // Open requests keep counting: refresh the days-of-breakdown clock every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!requestRecords) return undefined;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [requestRecords]);
  const reset = () => { setFilters({}); setOpenedLevel(0); setRecordDateRange(""); };
  const sortableDate = (value) => (value && value !== "—" ? String(value) : "");
  // The time breakdown opens from the Days of breakdown value; the job reference stays plain text.
  const breakdownCell = (record) => {
    const label = formatBreakdownDaysHours(record.requestStart, record.requestClosed, now), reference = record.requestReference;
    return RequestTimelineButton && reference && reference !== "—"
      ? <RequestTimelineButton reference={reference} token={timelineToken} Dialog={Dialog} label={label} />
      : <b>{label}</b>;
  };
  return <div className="dashboard-record-browser" style={{ gridTemplateRows: hideHierarchyFilters ? "auto minmax(0, 1fr)" : "auto auto minmax(0, 1fr)" }}>
    <label className="dashboard-fleet-search">Search fleet<input autoFocus data-smart-search type="search" aria-label="Search fleet" placeholder="Search door number, chassis, site, model or status" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
    {!hideHierarchyFilters && <details className="dashboard-record-controls">
      <summary className={`dashboard-record-filter-summary${onHourlyReport ? " has-hourly-report" : ""}`}>
        <b>Filters</b>
        <span>{[view.regionLabel, view.selection.site, categoryName(view.selection.category), view.selection.group].filter(Boolean).join(" · ")}</span>
        {onHourlyReport && <button type="button" className="dashboard-hourly-report-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onHourlyReport(); }}>Hourly In/Out report</button>}
        <span className="dashboard-record-show-filters">Show filters</span>
        <span className="dashboard-record-hide-filters">Hide filters</span>
      </summary>
      <div className="dashboard-record-topline">
        <div className="dashboard-record-tabs" role="tablist" aria-label="Chart records by region">
          {view.regions.map((region, index) => <button key={region.code} type="button" role="tab" id={`${id}-${region.code}`} aria-selected={view.selection.region === region.code} aria-controls={`${id}-records`} tabIndex={view.selection.region === region.code ? 0 : -1}
            onClick={() => choose("region", region.code)} onKeyDown={(event) => moveBetweenTabs(event, index, view.regions.map((item) => ({ value: item.code })), (next) => choose("region", next), '[role="tab"]')}><span>{region.label}</span><b>{region.rows.length.toLocaleString()}</b></button>)}
        </div>
        <button type="button" className="dashboard-record-reset" onClick={reset} disabled={!(showDateFilter && recordDateRange) && !activeFilterCount && visibleLevel <= selectedLevel}><RotateCcw size={14} />Reset selection</button>
      </div>
      {visibleLevel === 0 && <p className="dashboard-record-hierarchy-hint">No regions available in your current scope.</p>}
      <div className="dashboard-record-hierarchy">
        {fields.slice(0, visibleLevel).map(([name, label, allLabel], index) => (index === 0 || view.options[fields[index - 1][0]].length > 0) && <FilterTabRow key={`${name}-${levels.slice(0, index + 1).map((parent) => view.selection[parent]).join("|")}`} name={name} label={label} allLabel={allLabel} options={view.options[name]} value={view.selection[name]} choose={choose} resultsId={`${id}-records`} />)}
      </div>
    </details>}
    <div id={`${id}-records`} className="dashboard-record-results" role="tabpanel" aria-label={hideHierarchyFilters ? `${title} records` : undefined} aria-labelledby={!hideHierarchyFilters && view.selection.region ? `${id}-${view.selection.region}` : undefined}>
      {summaryLabel && <div className="dashboard-record-summary"><h4>{summaryLabel}</h4></div>}
      <div className="dashboard-record-toolbar" ref={setToolbarTarget} />
      <div className="dashboard-asset-list" ref={listRef}>
<ActionsTable key={tableKey} toolbarTarget={toolbarTarget} toolbarPortal exportTitle={hideHierarchyFilters ? title : `${title} · ${view.regionLabel}`} groupBySite={groupBySite} preserveColumnOrder printTitle={hideHierarchyFilters ? title : `${title} · ${view.regionLabel}`} showRowNumbers={showRowNumbers} disableDateColumnFilter={!showDateFilter} recordDateFilter={showDateFilter ? movementDateControl || { label: idleDateFilter ? "Idle Vehicle Date" : "Started", value: recordDateRange, onChange: setRecordDateRange } : false} className={bdBalanceColumns || requestRecords ? "dashboard-location-dates" : undefined} data-verification-last={lifecycleRecords && lifecycleEvent === "mis" ? "true" : undefined}>
          <thead><tr>{requestRecords && <th>Job reference</th>}<th>Status</th><th>Days of breakdown</th>{bdBalanceColumns && showLocationColumn && <th>Current location</th>}<th data-filter-mode={requestRecords ? undefined : "date-sort"}>Started</th>{showIdleDate && <th>Idle Vehicle Date</th>}{showBdClosingTime && <th>BD closing time</th>}<th>Machine / Door no.</th>{showCategoryColumn && <th>Equipment category</th>}{bdBalanceColumns && <><th>Type of breakdown</th><th>Reason of breakdown</th></>}{showUpdatesColumn && bdBalanceColumns && <th>Daily updates</th>}<th>Equipment group</th><th>Model</th>{bdBalanceColumns && <><th>Opening HMR</th><th>Opening KMR</th></>}{!bdBalanceColumns && showLocationColumn && <th>{requestRecords ? "Request site" : "Current location"}</th>}<th>Serial / chassis no.</th>{requestRecords && <><th>Breakdown type</th><th>Delayed reason</th><th>Breakdown reason</th></>}{showUpdatesColumn && !bdBalanceColumns && <th>Daily updates</th>}{showClosedColumn && <th>Closed</th>}{showVerificationColumns && <><th>MIS verified at</th><th>First trip time</th></>}{extraColumns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>{view.rows.length ? view.rows.map((record, index) => <tr data-report-site={groupBySite ? record.reportSite : undefined} data-report-asset={groupBySite ? record.assetId || record.id : undefined} key={record.id || `${record.equipmentName}-${index}`}>
            {requestRecords && <td><b>{record.requestReference}</b></td>}<td data-sort-value={requestStatusSortRank(record.requestStatus)}><Status>{record.requestStatus || "—"}</Status></td><td data-sort-value={calculateBreakdownMinutes(record.requestStart, record.requestClosed, now)}>{breakdownCell(record)}</td>{bdBalanceColumns && showLocationColumn && <td>{record.currentLocation || record.location || record.site || "—"}</td>}<td data-sort-value={sortableDate(record.requestStart)}>{formatDate(record.requestStart)}</td>{showIdleDate && <td data-sort-value={record.requestIdleAt || ""}>{record.requestIdleAt ? formatDate(record.requestIdleAt, true) : "Not recorded"}</td>}{showBdClosingTime && <td data-sort-value={sortableDate(record.requestClosed)}>{sortableDate(record.requestClosed) ? formatDate(record.requestClosed) : "Not recorded"}</td>}<td>{equipmentMachineLabel(record)}</td>{showCategoryColumn && <td>{categoryName(equipmentCategoryLabel(record))}</td>}{bdBalanceColumns && <><td>{record.repairCategory || "—"}</td><td className="request-reason-cell"><div className="request-reason-text">{record.breakdownReason || "—"}</div></td></>}{showUpdatesColumn && bdBalanceColumns && <td><Remarks remarks={record.dailyRemarks} /></td>}<td>{equipmentGroupLabel(record)}</td><td>{record.model || "—"}</td>{bdBalanceColumns && <><td>{record.hmr ?? "—"}</td><td>{record.kmr ?? "—"}</td></>}{!bdBalanceColumns && showLocationColumn && <td>{record.requestSite || record.currentLocation || record.location || record.site || "—"}</td>}<td>{record.manufacturerSerialNo || record.chassisNo || "—"}</td>
            {requestRecords && <><td>{record.repairCategory}</td><td>{record.delayedReason || "—"}</td><td className="request-reason-cell"><div className="request-reason-text">{record.breakdownReason || "—"}</div></td></>}{showUpdatesColumn && !bdBalanceColumns && <td><Remarks remarks={record.dailyRemarks} /></td>}{showClosedColumn && <td data-sort-value={sortableDate(record.requestClosed)}>{formatDate(record.requestClosed)}</td>}{showVerificationColumns && <><td data-sort-value={sortableDate(record.requestVerified)}>{formatDate(record.requestVerified, true)}</td><td data-sort-value={sortableDate(record.requestFirstTrip)}>{formatDate(record.requestFirstTrip, true)}</td></>}
            {extraColumns.map(column => <td key={column.key}>{column.render(record)}</td>)}
          </tr>) : <tr><td colSpan={columnCount}><div className="dashboard-record-empty"><b>No matching {requestRecords ? "requests" : "fleet records"}</b><span>{view.selection.region ? `No records for ${view.regionLabel} in this chart selection.` : "No regions available in your current scope."}</span></div></td></tr>}</tbody>
        </ActionsTable>
      </div>
    </div>
  </div>;
}
