import {canonicalSiteName} from './site-location.mjs';
import {managerReportScope} from './region-scope.mjs';

// null means explicitly authorized all-sites access; [] means no access.
// A designation's report rule may narrow an account, never broaden it.
export function hierarchyRecipientReportScope(user={},profile={},siteAccess=''){
  let sites=[];
  if(profile.sessionRole==='super'){
    if(profile.permissions?.adminLevel==='Manager')sites=managerReportScope(user).sites;
    else if(['Admin','Super Admin'].includes(profile.permissions?.adminLevel))sites=null;
  }else if(profile.sessionRole==='normal'){
    const assignedSite=canonicalSiteName(user.site||user.location||user.currentLocation||'');
    if(assignedSite)sites=[assignedSite];
  }
  const restriction=String(siteAccess||'').trim();
  if(!restriction)return {sites};
  const ruleSites=[...new Set(restriction.split(/\s*\|\s*/).map(canonicalSiteName).filter(Boolean))];
  return {sites:sites===null?ruleSites:sites.filter(site=>ruleSites.includes(site))};
}
