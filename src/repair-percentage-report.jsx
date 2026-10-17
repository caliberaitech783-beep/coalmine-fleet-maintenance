import React, {useMemo, useState} from 'react';
import {repairPercentageRows, percentageColumns, PERCENTAGE_REPORT_TITLE} from '../repair-percentage-report.mjs';
import {REGION_DATA, displaySiteName} from '../region-scope.mjs';

export default function RepairPercentageReport({rows, ReportSection}) {
  const [region,setRegion]=useState('');
  const [site,setSite]=useState('');
  const [group,setGroup]=useState('');
  const [query,setQuery]=useState('');
  const siteOf=row=>displaySiteName(row.reportSite || row.site);
  const regionSites=REGION_DATA.find(item=>item.code===region)?.sites.map(displaySiteName);
  const scoped=rows.filter(row=>!regionSites || regionSites.includes(siteOf(row)));
  const sites=[...new Set(scoped.map(siteOf).filter(Boolean))].sort();
  const groups=[...new Set(rows.map(row=>row.equipmentGroup).filter(Boolean))].sort();
  const filtered=useMemo(()=>scoped.filter(row=>(!site || siteOf(row)===site) && (!group || row.equipmentGroup===group) &&
    (!query.trim() || [row.ref,row.door,row.category,row.complaint,siteOf(row),row.equipmentGroup].join(' ').toLowerCase().includes(query.trim().toLowerCase()))),[rows,region,site,group,query]);
  const summary=useMemo(()=>repairPercentageRows(filtered),[filtered]);
  return <ReportSection title={PERCENTAGE_REPORT_TITLE} category="maintenance" rows={summary} columns={percentageColumns} showSearch={false}
    description={`All open and closed breakdowns: ${filtered.length} matching requests. Category count ÷ matching requests × 100. Dates use production submission; archived requests excluded. Percentages rounded to two decimals.`}
    rowKey={row=>row.repairCategory} emptyMessage="No breakdown requests match these filters"
    controls={<div className="vehicle-breakdown-scope-filter">
      <label>Region<select value={region} onChange={event=>{setRegion(event.target.value);setSite('');}}><option value="">All regions</option>{REGION_DATA.map(item=><option key={item.code} value={item.code}>{item.code}</option>)}</select></label>
      <label>Site<select value={site} onChange={event=>setSite(event.target.value)}><option value="">All sites</option>{sites.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Equipment group<select value={group} onChange={event=>setGroup(event.target.value)}><option value="">All equipment groups</option>{groups.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Search requests<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Door, reason, category or request" /></label>
      <button type="button" onClick={()=>{setRegion('');setSite('');setGroup('');setQuery('');}}>Reset filters</button>
    </div>} />;
}
