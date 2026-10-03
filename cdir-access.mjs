import {managerRoleSelection,normalizeAdminLevel} from './admin-access.mjs';
import {displaySiteName,displaySiteSelection,managerReportScope,userSiteSelection} from './region-scope.mjs';
import {canonicalSiteName} from './site-location.mjs';

function directorySiteIds(sites,assignedSites){
  const assigned=new Set(assignedSites.map(canonicalSiteName).filter(Boolean));
  return sites.filter((site)=>[site.label,site.dataKey].some((value)=>assigned.has(canonicalSiteName(value)))).map((site)=>site.id);
}

export function cdirViewerContext({session={},user={},sites=[]}={}){
  const managerRoles=managerRoleSelection(user.managerRole||session.permissions?.managerRoles||session.permissions?.managerRole);
  const isProjectManager=session.role==='super'&&normalizeAdminLevel(user.adminLevel||session.permissions?.adminLevel)==='Manager'&&managerRoles.includes('Project Manager');
  const isGeneralUser=session.assignedRole==='General User'||String(user.userGroup||user.assignedRole||'').trim()==='General User';
  if(!isProjectManager&&!isGeneralUser)return {profile:'all-user',label:'All directory',mySitesEnabled:false,siteIds:[],sites:[]};

  let assignedSites=[];
  if(isProjectManager){
    const scope=managerReportScope(user);
    assignedSites=scope.sites===null
      ? sites.map((site)=>site.label)
      : displaySiteSelection(user.managerSites).length
        ? displaySiteSelection(user.managerSites)
        : (scope.sites||[]).map(displaySiteName);
  }else assignedSites=userSiteSelection(user).map(displaySiteName);

  return {
    profile:isProjectManager?'project-manager':'general-user',
    label:isProjectManager?'Project Manager':'General User',
    mySitesEnabled:true,
    siteIds:directorySiteIds(sites,assignedSites),
    sites:assignedSites,
  };
}
