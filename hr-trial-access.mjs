import {REGION_DATA,displaySiteName} from './region-scope.mjs';

export const HR_TRIAL_ROLES=['HR Manager','Driver Trainer','PM','Office HR','Regional HR','Director','Trial Admin'];
export const HR_TRIAL_ALL_SITES_ROLES=['Director','Trial Admin'];
export const HR_ACCOUNT_STATUSES=['Active','Inactive'];

const trialSiteCodes={'Sasti OC':'WCL-SASTI','Majri OC':'WCL-MAJRI','Dhoptala OC (2nd)':'WCL-DHOPTALA','Gauri Pauni OC (2nd)':'WCL-GAURI','Lalpeth OC':'WCL-LALPETH','Jayant OC':'NCL-JAYANT','Dudhichua OC':'NCL-DUDW','Dudhichua East OC':'NCL-DUDE'};
const siteDirectory=new Map(REGION_DATA.flatMap(region=>region.sites.map(name=>[name.toLowerCase(),{code:trialSiteCodes[name]||name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,''),name,region:region.code}])));

export function normalizeHrTrialAssignments(raw){
  let values=raw;
  if(typeof raw==='string'){try{values=JSON.parse(raw||'[]')}catch{return []}}
  if(!Array.isArray(values))return [];
  return values.map(value=>{
    const role=HR_TRIAL_ROLES.includes(value?.role)?value.role:'';
    const allSites=value?.allSites===true&&HR_TRIAL_ALL_SITES_ROLES.includes(role);
    const sites=[...new Set((Array.isArray(value?.sites)?value.sites:[]).map(site=>displaySiteName(typeof site==='string'?site:site?.name)).filter(Boolean))].map(name=>siteDirectory.get(name.toLowerCase())).filter(Boolean);
    return {role,allSites,sites:allSites?[]:sites};
  }).filter(value=>value.role&&(value.allSites||value.sites.length));
}

export function hrTrialAccessError(record={}){
  const raw=record.hrTrialAssignments;
  const requested=Array.isArray(raw)?raw.length>0:Boolean(String(raw||'').trim()&&String(raw).trim()!=='[]');
  const assignments=normalizeHrTrialAssignments(raw);
  if(requested&&!assignments.length)return 'Add at least one valid Trial role with an assigned site.';
  if(!assignments.length)return '';
  const access=record.hrAccess===true||['true','yes','1'].includes(String(record.hrAccess||'').toLowerCase());
  if(!access)return 'Trial roles require HR application access.';
  const menus=[record.hrDesktopAccess,record.hrMobileAccess].flatMap(value=>Array.isArray(value)?value:String(value||'').split(/\s*\|\s*/));
  if(!menus.includes('Employee Master'))return 'Trial roles require Employee Master in HR menu access.';
  if(String(record.hrAccountStatus||'Active')!=='Active')return 'An inactive HR account cannot remain a Trial approver.';
  return '';
}

export function prepareHrTrialAccess(record={}){
  const next={...record};
  next.hrAccountStatus=HR_ACCOUNT_STATUSES.includes(next.hrAccountStatus)?next.hrAccountStatus:'Active';
  next.hrTrialAssignments=normalizeHrTrialAssignments(next.hrTrialAssignments);
  return next;
}
