import {REGION_DATA,displaySiteName} from '../region-scope.mjs';
import {canonicalSiteName} from '../site-location.mjs';

export function bdAgeingView(groups = [], {ageing = 'all',region = 'all',site = 'all'} = {}) {
  const allRows = groups.flatMap(group => group.rows.map(row => ({...row,ageingGroup:group.label,ageingId:group.id,
    region:REGION_DATA.find(item=>item.sites.some(name=>canonicalSiteName(name)===canonicalSiteName(row.site)))?.code || 'Other',
    siteKey:canonicalSiteName(row.site)||'unassigned',site:displaySiteName(row.site)||'Not assigned',
  }))).sort((a,b)=>b.ageMilliseconds-a.ageMilliseconds || String(a.ref).localeCompare(String(b.ref)));
  const regions = [...new Set(allRows.map(row=>row.region))].sort();
  const regionRows = allRows.filter(row=>region==='all'||row.region===region);
  const sites = [...new Map(regionRows.map(row=>[row.siteKey,{key:row.siteKey,label:row.site}])).values()].sort((a,b)=>a.label.localeCompare(b.label));
  const scoped = regionRows.filter(row=>site==='all'||row.siteKey===site);
  const tabs = [{id:'all',label:'All ageing',count:scoped.length},...groups.map(group=>({id:group.id,label:group.label,count:scoped.filter(row=>row.ageingId===group.id).length}))];
  return {regions,sites,tabs,rows:scoped.filter(row=>ageing==='all'||row.ageingId===ageing)};
}
