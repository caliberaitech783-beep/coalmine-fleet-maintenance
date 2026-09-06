import {flowDesignationForUser} from './hierarchy-report-flow.mjs';
import {displaySiteName,managerReportScope,reportScopeIncludesSite} from './region-scope.mjs';
import {canonicalSiteName} from './site-location.mjs';

const DIRECTOR_PROFILE_NAMES=new Set(['mohit chadda','manish chadda','rahul chadda']);
const normalizedName=(value)=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');

export function isInfoPulseDirector(session={},user={}){
  const designation=flowDesignationForUser(user,{
    permissions:session.permissions||{},
    assignedRole:session.assignedRole||'',
  });
  return designation?.key==='director'||DIRECTOR_PROFILE_NAMES.has(normalizedName(session.name||user.employee||user.name));
}

export function infoPulseRequestScope(session={},user={}){
  if(session.role==='normal'){
    const site=canonicalSiteName(user.site||user.location||user.currentLocation||session.location||'');
    return {
      kind:'location',
      label:site?displaySiteName(site):'No location assigned',
      restrictToScope:true,
      sites:site?[site]:[],
    };
  }

  if(session.role==='super'&&session.permissions?.adminLevel==='Manager'&&!isInfoPulseDirector(session,user)){
    const reportScope=managerReportScope(user);
    const sites=reportScope.sites;
    const displaySites=Array.isArray(sites)?sites.map(displaySiteName):[];
    return {
      kind:'assigned',
      label:sites===null?'All assigned regions':displaySites.length===1?displaySites[0]:`${displaySites.length} assigned locations`,
      restrictToScope:sites!==null,
      sites,
    };
  }

  return {kind:'all',label:'All regions',restrictToScope:false,sites:null};
}

export function scopeInfoPulseRequests(requests=[],scope={}){
  const rows=Array.isArray(requests)?requests:[];
  if(scope.restrictToScope!==true)return rows;
  if(!Array.isArray(scope.sites)||!scope.sites.length)return [];
  return rows.filter((request)=>reportScopeIncludesSite({sites:scope.sites},request.site||request.location||request.currentLocation||''));
}
