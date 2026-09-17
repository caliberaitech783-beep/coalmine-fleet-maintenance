import React, { useState } from "react";
import { Search, ListFilter, Eye, EyeOff } from "lucide-react";
import { matchesSmartSearch } from "../smart-search.mjs";
import DashboardRecordBrowser from "./dashboard-record-browser.jsx";
import { equipmentCategoryLabel, equipmentGroupLabel } from "./dashboard-drilldown-model.mjs";
import { groupOemRecordsBySite } from "./oem-dashboard-filters.mjs";
import {ProtectedAudio} from "./protected-media.jsx";
import "./oem-breakdown-details.css";

const extraColumns = [
  { key: "oem", label: "OEM", render: record => record.make || "—" },
  { key: "reason", label: "Reason", render: record => <div className="request-reason-text mine-oem-reason">{record.requestDetails.complaint || "—"}</div> },
  { key: "createdBy", label: "Created by", render: record => record.requestDetails.owner || record.requestDetails.requesterLogin || "—" },
  { key: "closedBy", label: "Closed by", render: record => record.requestDetails.closedBy || "—" },
  { key: "tat", label: "Turn around time (TAT)", render: record => record.requestDetails.hours || "—" },
  { key: "idleReason", label: "Idle reason", render: record => record.requestDetails.idleReason || "—" },
];

export default function OemBreakdownDetails({ selection, title, MaintenanceRemarks, ...tableProps }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [group, setGroup] = useState("");
  const [filtersHidden, setFiltersHidden] = useState(false);
  const categoryRows = selection.records.filter(record => !category || equipmentCategoryLabel(record) === category);
  const rows = categoryRows.filter(record => (!status || record.requestStatus === status) && (!group || equipmentGroupLabel(record) === group) && matchesSmartSearch(query,
    record.requestReference, record.door, record.requestSite, record.make, record.model, record.group, record.requestStatus,
    record.requestDetails?.complaint, record.requestDetails?.owner, record.manufacturerSerialNo));
  const siteGroups = groupOemRecordsBySite(rows, selection.regions);
  const groupedRows = siteGroups.flatMap(site => site.records.map(record => ({ ...record, reportSite: `${site.region} · ${site.site}` })));
  const columns = [...extraColumns,
    { key: "remarks", label: "Daily remarks", render: record => <MaintenanceRemarks remarks={record.requestDetails.dailyRemarks} /> },
    { key: "audio", label: "Audio clips", render: record => <div className="request-audio-list">{record.requestDetails.complaintAudioAvailable && <ProtectedAudio url={`/api/requests/${encodeURIComponent(record.requestReference)}/audio/complaint`} token={tableProps.timelineToken} label="Complaint audio" />}{record.requestDetails.maintenanceAudioAvailable && <ProtectedAudio url={`/api/requests/${encodeURIComponent(record.requestReference)}/audio/maintenance`} token={tableProps.timelineToken} label="Maintenance audio" />}{!record.requestDetails.complaintAudioAvailable && !record.requestDetails.maintenanceAudioAvailable && "—"}</div> },
  ];
  return <div className={`mine-oem-details${filtersHidden ? " filters-hidden" : ""}`}>
    <div className="mine-oem-detail-context"><span className="mine-oem-selection"><i style={{ background: selection.color || "var(--brand-purple)" }} />{selection.label}{selection.site && ` · ${selection.site}`}</span><span className="mine-oem-context-end"><span role="status" aria-live="polite">{selection.periodLabel}</span><button type="button" className="mine-oem-filter-toggle" aria-pressed={filtersHidden} title={filtersHidden ? "Show search, filters and site summary" : "Hide search, filters and site summary for a taller table"} onClick={() => setFiltersHidden(hidden => !hidden)}>{filtersHidden ? <Eye size={16} /> : <EyeOff size={16} />}{filtersHidden ? "Show filters" : "Hide filters"}</button></span></div>
    <div className="table-search-toolbar mine-oem-detail-search">
      <label><Search /><input type="search" aria-label="Search OEM breakdown records" placeholder="Search this table" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><ListFilter /><select aria-label="OEM breakdown status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(selection.records.map(record => record.requestStatus))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="mine-oem-local-filter"><select aria-label="Equipment category" value={category} onChange={event => { setCategory(event.target.value); setGroup(""); }}><option value="">All equipment &amp; vehicles</option>{[...new Set(selection.records.map(equipmentCategoryLabel))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="mine-oem-local-filter"><select aria-label="Equipment group" value={group} onChange={event => setGroup(event.target.value)}><option value="">All equipment groups</option>{[...new Set(categoryRows.map(equipmentGroupLabel))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="mine-oem-site-tables" role="region" tabIndex={0} aria-label="Site-wise fleet records">
      <DashboardRecordBrowser {...tableProps} rows={groupedRows} regions={selection.regions} rowsAreScoped title={title} groupBySite hideHierarchyFilters showDateFilter={false} showRowNumbers requestRecords={!selection.fleetOnly} extraColumns={selection.fleetOnly ? [extraColumns[0]] : columns} />
    </div>
  </div>;
}
