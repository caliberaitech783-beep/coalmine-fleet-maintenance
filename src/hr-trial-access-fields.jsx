import React,{useState} from 'react';
import {HR_ACCOUNT_STATUSES,HR_TRIAL_ALL_SITES_ROLES,HR_TRIAL_ROLES,normalizeHrTrialAssignments} from '../hr-trial-access.mjs';

export default function HrTrialAccessFields({record={},siteOptions=[],onAssignmentsChange}){
  const [status,setStatus]=useState(record.hrAccountStatus||'Active');
  const [assignments,setAssignments]=useState(()=>normalizeHrTrialAssignments(record.hrTrialAssignments).map(item=>({...item,sites:item.sites.map(site=>site.name)})));
  const update=next=>{setAssignments(next);onAssignmentsChange?.(next)};
  const change=(index,values)=>update(assignments.map((item,i)=>i===index?{...item,...values}:item));
  return <fieldset className="user-access-field access-section-card hr-trial-access"><legend>Trial Form roles and site scope</legend>
    <p>Pulse username: <b>{record.login||'the Login name entered above'}</b>. Roles apply only to the sites selected in the same row.</p>
    <label>Account status<select name="hrAccountStatus" value={status} onChange={event=>setStatus(event.target.value)}>{HR_ACCOUNT_STATUSES.map(option=><option key={option}>{option}</option>)}</select></label>
    <input type="hidden" name="hrTrialAssignments" value={JSON.stringify(assignments)}/>
    {assignments.map((assignment,index)=><div className="hr-trial-assignment" key={index}>
      <label>Trial role<select value={assignment.role} onChange={event=>change(index,{role:event.target.value,allSites:false})}><option value="">Select role</option>{HR_TRIAL_ROLES.map(role=><option key={role}>{role}</option>)}</select></label>
      <fieldset><legend>Assigned sites</legend>{siteOptions.map(site=><label key={site}><input type="checkbox" checked={assignment.sites.includes(site)} disabled={assignment.allSites} onChange={event=>change(index,{sites:event.target.checked?[...new Set([...assignment.sites,site])]:assignment.sites.filter(value=>value!==site)})}/>{site}</label>)}</fieldset>
      {HR_TRIAL_ALL_SITES_ROLES.includes(assignment.role)&&<label><input type="checkbox" checked={assignment.allSites} onChange={event=>change(index,{allSites:event.target.checked,sites:event.target.checked?[]:assignment.sites})}/> All sites access (central role)</label>}
      <button type="button" onClick={()=>update(assignments.filter((_,i)=>i!==index))}>Remove role</button>
    </div>)}
    <button type="button" onClick={()=>update([...assignments,{role:'',allSites:false,sites:[]}])}>Add Trial role</button>
    <small>Blank sites never grant access. Region is derived from each selected site.</small>
  </fieldset>;
}
