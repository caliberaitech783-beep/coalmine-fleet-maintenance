import {canonicalSiteName} from './site-location.mjs';

export const REGION_DATA=[
  {name:'Western Coalfields Limited',code:'WCL',state:'MH / MP',sites:['Sasti OB','Majri OB','Dhoptala OB (2nd)','Gauri Pauni OB (2nd)','Lalpeth OB']},
  {name:'Northern Coalfields Limited',code:'NCL',state:'MP / UP',sites:['Jayant OB','Jayant OB 2nd','Dudhichua OB','Dudhichua East OB']},
];

export const MANAGER_REGION_OPTIONS=['All',...REGION_DATA.map(({code})=>code)];

export function managerRegionSelection(value){
  const raw=Array.isArray(value)?value:String(value||'').split(/\s*[|,]\s*/);
  return [...new Set(raw.map((item)=>String(item).trim()).filter((item)=>MANAGER_REGION_OPTIONS.includes(item)))];
}

export function managerSiteSelection(value){
  const raw=Array.isArray(value)?value:String(value||'').split(/\s*\|\s*/);
  return [...new Set(raw.map(canonicalSiteName).filter(Boolean))];
}

// One display name per site, keyed by its canonical form, so "sasti ob",
// "Sasti OB" and "SASTI II" all render and save as "Sasti OB".
const SITE_DISPLAY_NAMES=new Map(REGION_DATA.flatMap(({sites})=>sites).map((site)=>[canonicalSiteName(site),site]));

export function displaySiteName(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  return SITE_DISPLAY_NAMES.get(canonicalSiteName(raw))||raw;
}

export function displaySiteSelection(value){
  const raw=Array.isArray(value)?value:String(value||'').split(/\s*\|\s*/);
  const seen=new Set();
  const sites=[];
  for(const item of raw){
    const key=canonicalSiteName(item);
    if(!key||seen.has(key))continue;
    seen.add(key);
    sites.push(displaySiteName(item));
  }
  return sites;
}

export function normalizeUserSiteFields(record={}){
  const next={...record};
  for(const key of ['site','location']){
    if(typeof next[key]==='string'&&next[key].trim())next[key]=displaySiteName(next[key]);
  }
  if(next.managerSites!=null&&String(next.managerSites).trim())next.managerSites=displaySiteSelection(next.managerSites).join(' | ');
  return next;
}

export function sitesForManagerRegions(value){
  const regions=managerRegionSelection(value);
  const selected=regions.includes('All')?REGION_DATA:REGION_DATA.filter(({code})=>regions.includes(code));
  return [...new Set(selected.flatMap(({sites})=>sites).map(canonicalSiteName).filter(Boolean))];
}

export function managerReportScope(user={}){
  const regions=managerRegionSelection(user.managerRegion||user.region);
  const selectedSites=managerSiteSelection(user.managerSites);
  if(selectedSites.length)return {key:`SITES-${selectedSites.join('+')}`,label:selectedSites.join(' + '),sites:selectedSites};
  if(regions.includes('All'))return {key:'ALL',label:'All regions',sites:null};
  if(regions.length){
    const sites=[...new Set(REGION_DATA.filter(({code})=>regions.includes(code)).flatMap(({sites})=>sites).map(canonicalSiteName).filter(Boolean))];
    return {key:regions.join('+'),label:regions.join(' + '),sites};
  }
  const site=canonicalSiteName(user.site||user.location||user.currentLocation);
  return {key:site||'UNASSIGNED',label:site||'Unassigned site',sites:site?[site]:[]};
}

export function reportScopeIncludesSite(scope,site){
  const canonical=canonicalSiteName(site);
  return scope?.sites===null||Boolean(canonical&&scope?.sites?.includes(canonical));
}
