import React, { useState } from "react";
import { Search, ListFilter } from "lucide-react";
import { matchesSmartSearch } from "../smart-search.mjs";
import DashboardRecordBrowser from "./dashboard-record-browser.jsx";

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
  const rows = selection.records.filter(record => (!status || record.requestStatus === status) && matchesSmartSearch(query,
    record.requestReference, record.door, record.requestSite, record.make, record.model, record.group, record.requestStatus,
    record.requestDetails.complaint, record.requestDetails.owner, record.manufacturerSerialNo));
  const columns = [...extraColumns,
    { key: "remarks", label: "Daily remarks", render: record => <MaintenanceRemarks remarks={record.requestDetails.dailyRemarks} /> },
    { key: "audio", label: "Audio clips", render: record => <div className="request-audio-list">{record.requestDetails.complaintAudio && <audio controls preload="none" aria-label="Complaint audio" src={record.requestDetails.complaintAudio} />}{record.requestDetails.maintenanceAudio && <audio controls preload="none" aria-label="Maintenance audio" src={record.requestDetails.maintenanceAudio} />}{!record.requestDetails.complaintAudio && !record.requestDetails.maintenanceAudio && "—"}</div> },
  ];
  return <div className="mine-oem-details">
    <div className="mine-oem-detail-context"><span className="mine-oem-selection"><i style={{ background: selection.color || "var(--brand-purple)" }} />{selection.label}{selection.site && ` · ${selection.site}`}</span><span>{selection.periodLabel} · {selection.rows.length} assets · {selection.records.length} records</span></div>
    <div className="table-search-toolbar mine-oem-detail-search">
      <label><Search /><input type="search" aria-label="Search OEM breakdown records" placeholder="Search this table" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label><ListFilter /><select aria-label="OEM breakdown status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{[...new Set(selection.records.map(record => record.requestStatus))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <DashboardRecordBrowser {...tableProps} rows={rows} regions={selection.regions} rowsAreScoped title={title} initialRegion={selection.regions.find(region => region.sites.includes(selection.site))?.code || ""} initialSite={selection.site || ""} requestRecords extraColumns={columns} />
  </div>;
}
