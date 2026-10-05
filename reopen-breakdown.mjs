import {managerRoleSelection} from './admin-access.mjs';
export function canReopenBreakdown(session){
  const p=session?.permissions;
  return session?.role==='super' && p?.adminLevel==='Manager' && managerRoleSelection(p.managerRoles?.length?p.managerRoles:p.managerRole).some(role=>['Maintenance Manager','Project Manager'].includes(role));
}
export function reopenBreakdownError(request,reason){
  if(!String(reason||'').trim()||String(reason).length>500)return 'Enter a correction reason (up to 500 characters).';
  if(request.status!=='Closed'||!request.closedAt)return 'Only a closed maintenance request can be reopened.';
  if(request.verifiedAt||request.firstTripDone||request.firstTripAt||request.productionFirstTripAt)return 'MIS verification or first trip is recorded. Additional review is required; this request cannot be reopened here.';
  if(request.vehicleIdle||request.idealRequestedAt)return 'Idle/on-road approval cases require additional review.';
  if(!request.acceptedAt)return 'Maintenance acceptance is missing. Additional review is required.';
  return '';
}
