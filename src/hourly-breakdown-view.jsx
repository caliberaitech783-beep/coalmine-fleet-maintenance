import React, { useEffect, useState } from "react";
import { hourlyBreakdownView, breakdownElapsed } from "./hourly-breakdown.mjs";
import "./hourly-breakdown-view.css";

export default function HourlyBreakdownView({ requests, sites, onBack, FilterableHeader }) {
  const [hours, setHours] = useState(1);
  const [site, setSite] = useState("");
  const [now, setNow] = useState(Date.now);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({key: "", direction: "asc"});
  const [openFilter, setOpenFilter] = useState(null);
  useEffect(() => {
    const close = event => { if (!event.target.closest?.(".column-filter-header, .column-filter-popover")) setOpenFilter(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const view = hourlyBreakdownView(requests, hours, site, now, sites);
  const columns = [["site", "Sites"], ["door", "Door No"], ["direction", "In/Out"], ["timing", "BD Timing"]];
  const value = (row, key) => key === "timing" ? breakdownElapsed(row, now) : row[key];
  const rows = view.rows.filter(row => columns.every(([key]) => !filters[key] || value(row, key) === filters[key]));
  if (sort.key) rows.sort((a, b) => {
    const comparison = sort.key === "timing"
      ? ((a.closedAt ?? now) - a.startedAt) - ((b.closedAt ?? now) - b.startedAt)
      : String(value(a, sort.key)).localeCompare(String(value(b, sort.key)), undefined, {numeric: true});
    return comparison * (sort.direction === "desc" ? -1 : 1);
  });
  return <section className="hourly-breakdown-view">
    <header><button type="button" onClick={onBack}>← Back to Breakdown</button><h2>Hourly breakdown activity</h2></header>
    <p>Activity within the last {hours} {hours === 1 ? "hour" : "hours"}. Active BD timers update automatically; completed BD durations stop at closure.</p>
    <section className="hourly-panel">
      <div className="hourly-periods" aria-label="Choose breakdown activity window">{view.hourCounts.map((count, index) => <button type="button" key={index} aria-pressed={hours === index + 1} onClick={() => setHours(index + 1)}>{index + 1} {index === 0 ? "hour" : "hours"} <b>{count}</b></button>)}</div>
      <div className="hourly-sites" aria-label="Filter breakdown activity by site"><span>Site</span>{[{site:"", count:view.total}, ...view.siteCounts].map(option => <button type="button" key={option.site} aria-pressed={site === option.site} onClick={() => setSite(option.site)}>{option.site || "All sites"} <b>{option.count}</b></button>)}</div>
    </section>
    <section className="hourly-panel"><header><h3>{site || "All sites"} · Last {hours} {hours === 1 ? "hour" : "hours"}</h3><span>{rows.length} events</span></header>
      <p>Pink: BD In · Green: BD Out. Counts include entry and exit events.</p>
      <div className="hourly-table"><table><thead><tr>{columns.map(([key, label]) => <FilterableHeader key={key} label={label} sortKey={key} sort={sort} onSort={(key, direction) => setSort({key, direction})} open={openFilter === key} onToggle={key => setOpenFilter(current => current === key ? null : key)} values={[...new Set(view.rows.map(row => value(row, key)))]} filterValue={filters[key] || ""} onFilterChange={value => setFilters(current => ({...current, [key]: value}))} durationSortOnly={false} />)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}><td>{row.site}</td><td>{row.door}</td><td>{row.direction}</td><td className={row.closedAt != null ? "bd-out" : "bd-in"}>{breakdownElapsed(row, now)}</td></tr>)}{!rows.length && <tr><td colSpan={4}>{view.rows.length ? "No matching records." : "No breakdown activity in this time window."}</td></tr>}</tbody>
      </table></div>
    </section>
  </section>;
}
