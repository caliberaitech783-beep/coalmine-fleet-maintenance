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

export function managerReportScope(user={}){
  const regions=managerRegionSelection(user.managerRegion||user.region);
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
