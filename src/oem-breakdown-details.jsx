import React, { useState } from "react";
import { Search, ListFilter } from "lucide-react";
import { matchesSmartSearch } from "../smart-search.mjs";
import DashboardRecordBrowser from "./dashboard-record-browser.jsx";
import { equipmentCategoryLabel, equipmentGroupLabel } from "./dashboard-drilldown-model.mjs";
import { groupOemRecordsBySite } from "./oem-dashboard-filters.mjs";
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
  const categoryRows = selection.records.filter(record => !category || equipmentCategoryLabel(record) === category);
  const rows = categoryRows.filter(record => (!status || record.requestStatus === status) && (!group || equipmentGroupLabel(record) === group) && matchesSmartSearch(query,
    record.requestReference, record.door, record.requestSite, record.make, record.model, record.group, record.requestStatus,
    record.requestDetails?.complaint, record.requestDetails?.owner, record.manufacturerSerialNo));
  const shownAssets = new Set(rows.map(record => record.assetId || record.id)).size;
  const siteGroups = groupOemRecordsBySite(rows, selection.regions);
  const columns = [...extraColumns,
    { key: "remarks", label: "Daily remarks", render: record => <MaintenanceRemarks remarks={record.requestDetails.dailyRemarks} /> },
    { key: "audio", label: "Audio clips", render: record => <div className="request-audio-list">{record.requestDetails.complaintAudio && <audio controls preload="none" aria-label="Complaint audio" src={record.requestDetails.complaintAudio} />}{record.requestDetails.maintenanceAudio && <audio controls preload="none" aria-label="Maintenance audio" src={record.requestDetails.maintenanceAudio} />}{!record.requestDetails.complaintAudio && !record.requestDetails.maintenanceAudio && "—"}</div> },
  ];
  return <div className="mine-oem-details">
    <div className="mine-oem-detail-context"><span className="mine-oem-selection"><i style={{ background: selection.color || "var(--brand-purple)" }} />{selection.label}{selection.site && ` · ${selection.site}`}</span><span role="status" aria-live="polite">{selection.periodLabel} · Showing {shownAssets} of {selection.rows.length} assets · {rows.length} of {selection.records.length} records</span></div>
    <div className="table-search-toolbar mine-oem-detail-search">
      <label><Search /><input type="search" aria-label="Search OEM breakdown records" placeholder="Search this table" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><ListFilter /><select aria-label="OEM breakdown status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(selection.records.map(record => record.requestStatus))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="mine-oem-local-filter"><select aria-label="Equipment category" value={category} onChange={event => { setCategory(event.target.value); setGroup(""); }}><option value="">All equipment &amp; vehicles</option>{[...new Set(selection.records.map(equipmentCategoryLabel))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="mine-oem-local-filter"><select aria-label="Equipment group" value={group} onChange={event => setGroup(event.target.value)}><option value="">All equipment groups</option>{[...new Set(categoryRows.map(equipmentGroupLabel))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="mine-oem-site-tables" role="region" tabIndex={0} aria-label="Site-wise fleet records">
      {siteGroups.map(site => <section className="mine-oem-site-section" key={`${site.region}:${site.site}`} aria-label={`${site.region} · ${site.site} records`}>
        <DashboardRecordBrowser {...tableProps} rows={site.records} regions={selection.regions} rowsAreScoped title={`${title} · ${site.region} · ${site.site}`} summaryLabel={`${site.region} · ${site.site}`} hideHierarchyFilters hideSiteColumn showDateFilter={false} showRowNumbers requestRecords={!selection.fleetOnly} extraColumns={selection.fleetOnly ? [extraColumns[0]] : columns} />
      </section>)}
      {!siteGroups.length && <div className="dashboard-record-empty" role="status"><b>No matching {selection.fleetOnly ? "fleet records" : "requests"}</b><span>Change the filters above to view another site or OEM.</span></div>}
    </div>
  </div>;
}
