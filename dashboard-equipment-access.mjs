import {accessAllows} from './admin-access.mjs';
import {assignedUserSiteName,canonicalSiteName,equipmentSiteName} from './site-location.mjs';
import {REGION_DATA,managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';

const OPERATIONAL_DASHBOARD_ROLES=new Set(['Production User','Maintenance User','MIS User']);

const normalizedIdentity=(value)=>String(value||'').trim().toLowerCase();

export function currentDashboardUserCandidate(rows=[],session={}){
  const records=(Array.isArray(rows)?rows:[]).map((row)=>row?.record_data||row).filter((record)=>record&&typeof record==='object');
  const login=normalizedIdentity(session.login);
  const employeeName=normalizedIdentity(session.name);
  const sameEmployee=(record)=>!employeeName||normalizedIdentity(record.employee)===employeeName;
  if(login){
    const exact=records.filter((record)=>normalizedIdentity(record.login)===login);
    if(exact.length)return exact.length===1&&sameEmployee(exact[0])?exact[0]:null;
    const legacy=records.filter((record)=>!normalizedIdentity(record.login)
      &&normalizedIdentity(record.employee).split(/\s+/)[0]===login);
    return legacy.length===1&&sameEmployee(legacy[0])?legacy[0]:null;
  }
  if(!employeeName)return null;
  const legacy=records.filter((record)=>normalizedIdentity(record.employee)===employeeName);
  return legacy.length===1?legacy[0]:null;
}

export function dashboardSessionFromProfile(profile={}){
  return {
    role:profile.sessionRole||'',
    assignedRole:profile.assignedRole||'',
    permissions:profile.permissions&&typeof profile.permissions==='object'?profile.permissions:{},
  };
}

export function canReadDashboardEquipment(session={}){
  if(session.role==='normal')return OPERATIONAL_DASHBOARD_ROLES.has(session.assignedRole);
  if(session.role!=='super')return false;
  if(session.permissions?.adminLevel==='Manager')return true;
  const permissions=session.permissions||{};
  const desktopAllowed=accessAllows(permissions.tabAccess,'Dashboard')
    &&accessAllows(permissions.dashboardAccess,'Dashboard');
  const mobileAllowed=accessAllows(permissions.mobileTabAccess??permissions.tabAccess,'Dashboard')
    &&accessAllows(permissions.mobileDashboardAccess??permissions.dashboardAccess,'Dashboard');
  return desktopAllowed||mobileAllowed;
}

export function dashboardEquipmentScope(session={},user={}){
  if(session.role==='normal'){
    const assignedSite=canonicalSiteName(assignedUserSiteName(user));
    return {restrictToScope:true,allowedSites:assignedSite?[assignedSite]:[],allowedRegions:[]};
  }
  if(session.role==='super'&&session.permissions?.adminLevel==='Manager'){
    const reportScope=managerReportScope({...user,site:assignedUserSiteName(user)});
    // Region metadata must describe the resolved site scope, not contradict an
    // explicit site assignment with an older managerRegion field.
    const allowedRegions=Array.isArray(reportScope.sites)
      ? REGION_DATA.filter(region=>region.sites.some(site=>reportScopeIncludesSite(reportScope,site))).map(region=>region.code)
      : [];
    return {
      restrictToScope:Array.isArray(reportScope.sites),
      allowedSites:reportScope.sites,
      allowedRegions,
    };
  }
  return {restrictToScope:false,allowedSites:null,allowedRegions:null};
}

export function dashboardEquipmentScopeIsUsable(scope={}){
  return scope.restrictToScope===false
    ||(scope.restrictToScope===true&&Array.isArray(scope.allowedSites)&&scope.allowedSites.length>0);
}

export function scopeDashboardEquipmentRecords(records=[],session={},user={},resolvedScope=null){
  const safeRecords=Array.isArray(records)?records:[];
  const scope=resolvedScope||dashboardEquipmentScope(session,user);
  if(scope.restrictToScope)
    return safeRecords.filter((record)=>reportScopeIncludesSite({sites:scope.allowedSites},equipmentSiteName(record)));
  return safeRecords;
}
