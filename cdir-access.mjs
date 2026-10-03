import {managerRoleSelection,normalizeAdminLevel} from './admin-access.mjs';
import {displaySiteSelection,managerReportScope,userSiteSelection} from './region-scope.mjs';
import {canonicalSiteName} from './site-location.mjs';

function directorySiteIds(sites,assignedSites){
  const assigned=new Set(assignedSites.map(canonicalSiteName).filter(Boolean));
  return sites.filter((site)=>[site.label,site.dataKey].some((value)=>assigned.has(canonicalSiteName(value)))).map((site)=>site.id);
}

const unique=values=>[...new Set(values.filter(Boolean))];

/** Returns only display-safe scope information. User-master permissions never leave the server. */
export function cdirViewerContext({session={},user={},sites=[]}={}){
  const adminLevel=normalizeAdminLevel(user.adminLevel||session.permissions?.adminLevel);
  const allAccess=session.role==='super'&&adminLevel!=='Manager';
  const managerRoles=managerRoleSelection(user.managerRole||session.permissions?.managerRoles||session.permissions?.managerRole);
  const isManager=session.role==='super'&&adminLevel==='Manager';
  const isProjectManager=isManager&&managerRoles.includes('Project Manager');
  const assignedRole=String(session.assignedRole||user.userGroup||user.assignedRole||'').trim();
  let assignedSites=[];
  if(allAccess)assignedSites=sites.map((site)=>site.label);
  else if(isManager){
    const scope=managerReportScope(user);
    assignedSites=scope.sites===null
      ? sites.map((site)=>site.label)
      : displaySiteSelection(user.managerSites).length
        ? displaySiteSelection(user.managerSites)
        : scope.sites||[];
  }else assignedSites=userSiteSelection(user);

  const siteIds=allAccess?sites.map((site)=>site.id):directorySiteIds(sites,assignedSites);
  const allowedSites=sites.filter((site)=>siteIds.includes(site.id));
  return {
    profile:allAccess?'admin-user':isProjectManager?'project-manager':isManager?'manager-user':assignedRole==='General User'?'general-user':'site-user',
    label:allAccess?(adminLevel==='Super Admin'?'Super Admin':'Admin'):isProjectManager?'Project Manager':managerRoles.join(' · ')||assignedRole||'Site User',
    allAccess,mySitesEnabled:!allAccess,siteIds,
    sites:allowedSites.map((site)=>site.label),
    regions:unique(allowedSites.map((site)=>site.group)),
  };
}

/** Restricts the actual API payload and aggregate totals to the viewer's assigned sites. */
export function cdirDirectoryForViewer(directory={},viewer={}){
  if(viewer.allAccess)return directory;
  const allowed=new Set(viewer.siteIds||[]);
  const sites=(directory.sites||[]).filter((site)=>allowed.has(site.id));
  const siteIds=new Set(sites.map((site)=>site.id));
  const matrix=Object.fromEntries(Object.entries(directory.matrix||{}).filter(([key])=>siteIds.has(key.slice(0,key.lastIndexOf('|')))));
  const siteTotals=Object.fromEntries(sites.map((site)=>[site.id,directory.siteTotals?.[site.id]||0]));
  const siteStats=Object.fromEntries(sites.map((site)=>[site.id,directory.siteStats?.[site.id]||{sanctioned:0,filled:0,vacant:0}]));
  const categories=directory.categories||[];
  const categoryTotalsUnique=Object.fromEntries(categories.map((category)=>[category,sites.reduce((total,site)=>total+(matrix[`${site.id}|${category}`]?.length||0),0)]).filter(([,count])=>count>0));
  const rows=Object.values(matrix).flat();
  return {...directory,
    meta:{...(directory.meta||{}),
      totalStaffSanctioned:Object.values(siteTotals).reduce((sum,count)=>sum+count,0),
      totalFilled:Object.values(siteStats).reduce((sum,stats)=>sum+(stats.filled||0),0),
      totalVacant:Object.values(siteStats).reduce((sum,stats)=>sum+(stats.vacant||0),0),
      totalSitesOffices:sites.filter((site)=>siteTotals[site.id]>0).length,
      totalDepartments:new Set(rows.map((row)=>row.department).filter(Boolean)).size},
    sites,matrix,siteTotals,siteStats,categoryTotalsUnique};
}
