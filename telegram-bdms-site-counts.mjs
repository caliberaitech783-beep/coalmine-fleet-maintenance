import {canonicalSiteName} from './site-location.mjs';
// Callers supply only records already scoped to the signed-in account.
export function bdmsSiteCounts(rows,metrics=[['Count',()=>true]],{language='en',siteFor=row=>row.site||row.location,title}={}){
 const groups=new Map();
 for(const row of rows){const name=String(siteFor(row)||'Not recorded').replace(/[\r\n]+/g,' ').trim().slice(0,120);const existing=[...groups.keys()].find(site=>canonicalSiteName(site)===canonicalSiteName(name));const site=existing||name;if(!groups.has(site))groups.set(site,[]);groups.get(site).push(row);}
 const heading=title||(language==='hi'?'साइट के अनुसार संख्या':'Site-wise counts');
 return `${heading}\n${[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([site,records])=>`${site}: ${metrics.map(([label,predicate])=>`${label}: ${records.filter(predicate).length}`).join(' · ')}`).join('\n')||(language==='hi'?'कोई रिकॉर्ड नहीं':'No matching records')}`;
}
