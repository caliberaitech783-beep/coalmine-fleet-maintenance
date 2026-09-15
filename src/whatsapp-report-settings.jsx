import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Bell, Check, Clock, FileText, MessageSquare, Plus, RefreshCw, Save, Settings2, ShieldCheck, X} from 'lucide-react';
import {defaultWhatsAppReportSettings, EVENT_OPTIONS, PURPOSE_OPTIONS, WORKFLOW_ROLE_OPTIONS, whatsappSettingsValidationError} from '../whatsapp-report-settings.mjs';
import {baseTemplateKey, isSingleReportPurpose, previewReportTemplate, reportTemplateChoices, resolvedReportTemplateChoice, SINGLE_REPORT_TEMPLATE_PURPOSES, TEMPLATE_FIELD_LABELS, validateCustomTemplate} from '../whatsapp-template-catalog.mjs';
import {readApiJson} from './api-response.mjs';
import './whatsapp-report-settings.css';

const sections = [
  {key:'delivery',label:'Who gets what / defaults',icon:ShieldCheck},
  {key:'alerts',label:'Request alerts',icon:Bell},
  {key:'reminders',label:'Reminders',icon:Clock},
  {key:'crm',label:'CRM fallback timetable',icon:FileText},
  {key:'templates',label:'Message templates',icon:MessageSquare},
];
const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const channelOptions = [
  ['hierarchyReports','Scheduled fleet reports','Timed report bundles, using role defaults or a saved personal report schedule.'],
  ['ticketCreated','CRM ticket created','Notify the ticket creator, Admin and Super Admin within existing CRM access. Managers and Directors never receive individual CRM alerts.'],
  ['ticketResolved','CRM ticket resolved','Notify the ticket creator, Admin and Super Admin within existing CRM access. Managers and Directors never receive individual CRM alerts.'],
  ['dailyUpdate','Daily maintenance updates','Notify operational users, Admin and Super Admin within their permitted sites. Managers and Directors receive scheduled reports only.'],
  ['manualReports','Manual report sends','Allow reports sent using the WhatsApp Send action, including administrator report tests.'],
  ['passwordResetOtp','Password reset OTPs','Allow WhatsApp verification codes for password resets. Keep this on if users depend on WhatsApp account recovery.'],
];

function Toggle({label,description,checked,onChange,emphasis=false}) {
  return <label className={`wrs-toggle-row${emphasis?' wrs-toggle-emphasis':''}`}>
    <span><strong>{label}</strong>{description&&<small>{description}</small>}</span>
    <span className="wrs-switch"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)}/><span aria-hidden="true"/></span>
  </label>;
}

export function resetWhatsAppDeliveryRules(current) {
  const defaults=defaultWhatsAppReportSettings();
  return {...current,...defaults,templates:current.templates,crm:{...defaults.crm,days:[...current.crm.days],times:[...current.crm.times]}};
}

export function WhatsAppReportSettingsDialog({token,onClose,onOpenReportSchedules}) {
  const [details,setDetails] = useState(null);
  const [draft,setDraft] = useState(null);
  const [section,setSection] = useState('delivery');
  const [purpose,setPurpose] = useState('requestOpened');
  const [busy,setBusy] = useState('load');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [discardPrompt,setDiscardPrompt] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const pendingScheduleRef = useRef(null);
  const dirty = !!details && JSON.stringify(draft)!==JSON.stringify(details.settings);
  const close = () => {if(busy)return;pendingScheduleRef.current=null;if(dirty)setDiscardPrompt(true);else onClose();};
  closeRef.current=close;
  const openSchedules = target => {
    if(busy||!onOpenReportSchedules)return;
    if(dirty){pendingScheduleRef.current=target;setDiscardPrompt(true);}
    else onOpenReportSchedules(target);
  };

  useEffect(()=>{
    const previousFocus=document.activeElement, previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.focus();
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key!=='Tab')return;
      const targets=[...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(element=>element.getClientRects().length);
      const first=targets[0],last=targets.at(-1);
      if(!first){event.preventDefault();return;}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogRef.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialogRef.current)){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keydown);previousFocus?.focus();};
  },[]);

  const request = async(path='',init={}) => readApiJson(await fetch(`/api/report-settings${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}}),'Could not update WhatsApp delivery settings.');
  const apply = result => {setDetails(result);setDraft(result.settings);};
  const load = async()=>{setBusy('load');setError('');setNotice('');try{apply(await request());setDiscardPrompt(false);}catch(cause){setError(cause.message);}finally{setBusy('');}};
  useEffect(()=>{let active=true;request().then(result=>{if(active)apply(result);}).catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setBusy('');});return()=>{active=false;};},[token]);
  const change = updater => {setDraft(updater);setNotice('');setDiscardPrompt(false);};
  const patch = (key,value)=>change(current=>({...current,[key]:{...current[key],...value}}));
  const patchEvent = (key,value)=>change(current=>({...current,events:{...current.events,[key]:{...current.events[key],...value}}}));
  const patchTemplate = value=>change(current=>({...current,templates:{...current.templates,[purpose]:{...current.templates[purpose],...value}}}));
  const save = async()=>{
    let invalid=whatsappSettingsValidationError(draft);
    if(!invalid)for(const option of PURPOSE_OPTIONS){const selection=draft.templates[option.key];if(selection.variant==='custom'){invalid=validateCustomTemplate(option.key,selection.body);if(invalid){setPurpose(option.key);setSection('templates');break;}}}
    if(invalid){setError(invalid);return;}
    setBusy('save');setError('');setNotice('');
    try{apply(await request('',{method:'PUT',body:JSON.stringify({settings:draft,revision:details.revision})}));setNotice('Settings saved. New deliveries will use these rules.');setDiscardPrompt(false);}catch(cause){setError(cause.message);}finally{setBusy('');}
  };
  const sync = async action=>{
    setBusy(action);setError('');setNotice('');
    try{apply(await request('/templates',{method:'POST',body:JSON.stringify({action})}));setNotice(action==='submit'?'Selected templates submitted or matched to existing templates. See their approval status below.':'Approval status refreshed. Approved choices are now available for delivery.');}catch(cause){setError(cause.message);}finally{setBusy('');}
  };
  const choices=reportTemplateChoices(purpose), selection=draft?.templates[purpose];
  const resolvedChoice=resolvedReportTemplateChoice(purpose,draft);
  const resolvedChoices=reportTemplateChoices(resolvedChoice.purpose);
  const body=resolvedChoice.selection.variant==='custom'?resolvedChoice.selection.body:resolvedChoices.find(choice=>choice.variant===resolvedChoice.selection.variant)?.body||'';
  const templateState=details?.templateState?.[purpose];
  const savedSelection=details?.settings.templates[purpose];
  const templateDirty=JSON.stringify(selection)!==JSON.stringify(savedSelection)||JSON.stringify(resolvedChoice)!==JSON.stringify(resolvedReportTemplateChoice(purpose,details?.settings));
  const validation=selection?.variant==='custom'?validateCustomTemplate(purpose,body):'';
  const preview=previewReportTemplate(purpose,body).split(/(\*[^*\n]+\*)/g).map((text,index)=>text.startsWith('*')&&text.endsWith('*')?<strong key={index}>{text.slice(1,-1)}</strong>:text);
  const selectedLabel=selection?.variant==='inherit'?'Follow consolidated choice':selection?.variant==='custom'?'Custom wording':choices.find(choice=>choice.variant===selection?.variant)?.label;
  const editableSample=/\}\}\s*$/.test(body)?`${body}\n\nOpen Nerve Center for the latest status.`:body;
  const purposeGroups=[...new Set(PURPOSE_OPTIONS.map(option=>option.group))];
  const displayChoices=[...(isSingleReportPurpose(purpose)?[{variant:'inherit',label:'Follow consolidated choice',description:'Keep the same style as the fleet bundle.'}]:[]),...choices,{variant:'custom',label:'Custom wording',description:'Adapt a sample or write your own.'}];

  return createPortal(<div className="wrs-overlay" onPointerDown={event=>{if(event.target===event.currentTarget)close();}}>
    <div className="wrs-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="wrs-title" tabIndex={-1}>
      <header className="wrs-header"><button type="button" className="modal-back-button" onClick={close} disabled={!!busy} aria-label="Back" title="Back"><span aria-hidden="true">←</span></button><span className="wrs-header-icon"><Settings2/></span><div><h2 id="wrs-title">WhatsApp delivery settings</h2><p>Who receives alerts and reports, and the organisation defaults</p></div><span className="wrs-admin-badge">Admin controls</span><button type="button" className="wrs-icon-button" aria-label="Close WhatsApp delivery settings" disabled={!!busy} onClick={close}><X/></button></header>
      {error&&<div className="wrs-feedback wrs-error" role="alert">{error}<button type="button" onClick={load} disabled={!!busy}>Reload saved settings</button></div>}
      {notice&&<div className="wrs-feedback wrs-success" role="status"><Check size={17}/>{notice}</div>}
      {discardPrompt&&<div className="wrs-feedback wrs-discard" role="alert"><span>You have unsaved delivery changes. Keep editing to save them before leaving.</span><button type="button" onClick={()=>{pendingScheduleRef.current=null;setDiscardPrompt(false);}}>Keep editing</button><button type="button" onClick={()=>pendingScheduleRef.current?onOpenReportSchedules(pendingScheduleRef.current):onClose()}>{pendingScheduleRef.current?'Discard changes and open schedule':'Discard and close'}</button></div>}
      {!draft?<div className="wrs-loading">{busy?'Loading saved settings…':'Settings could not be loaded. Use Reload to try again.'}</div>:<div className="wrs-layout">
        <nav className="wrs-nav" aria-label="WhatsApp delivery settings sections">{sections.map(({key,label,icon:Icon})=><button type="button" key={key} aria-current={section===key?'page':undefined} onClick={()=>setSection(key)}><Icon size={18}/>{label}</button>)}<div className="wrs-nav-note"><strong>All times are IST</strong><span>Changes apply to the organisation after you save.</span><span>Report access and site permissions still apply.</span></div></nav>
        <main className="wrs-content" aria-busy={!!busy}>
          <fieldset className="wrs-editable" disabled={!!busy}>
          {section==='delivery'&&<>
            <div className="wrs-section-heading"><span>01 / DELIVERY</span><h3>Who gets what by default</h3><p>Delivery follows the recipient’s role and permitted sites. Use the controls below to change the organisation’s delivery rules.</p></div>
            <div className="wrs-role-matrix"><table aria-describedby="wrs-site-scope"><caption>Default role delivery rules</caption><thead><tr><th scope="col">Role</th><th scope="col">Request alerts</th><th scope="col">Scheduled reports</th></tr></thead><tbody>
              <tr><th scope="row">Operational users<small>Production, Maintenance and MIS users, supervisors and incharges</small></th><td>All alerts</td><td>Assigned reports at saved times</td></tr>
              <tr><th scope="row">Managers and Directors</th><td>Never per-request</td><td>Reports only, at scheduled times</td></tr>
              <tr><th scope="row">Admin and Super Admin</th><td>All alerts</td><td>All reports at scheduled times</td></tr>
            </tbody></table></div>
            <div className="wrs-note" id="wrs-site-scope"><strong>Only within permitted sites</strong><p>Request-status alerts and daily maintenance updates cover all categories within each recipient’s permitted sites. CRM users receive alerts for their own tickets; Admin and Super Admin receive CRM alerts within their existing access. Managers and Directors never receive individual alerts. A saved WhatsApp number is required.</p><p>Hierarchy report assignments and site access still apply. Reports include all ticket categories the recipient is permitted to view.</p></div>
            <div className="wrs-schedule-links"><div><h4>Report days and times</h4><p>Use the existing Report schedules panel for role defaults and My report schedule. Your saved personal schedule takes priority over role defaults and the CRM fallback timetable.</p></div><div className="wrs-schedule-actions"><button type="button" className="wrs-outline-button" disabled={!onOpenReportSchedules} onClick={()=>openSchedules('role-defaults')}><Clock size={16}/> Role default schedules</button><button type="button" className="wrs-outline-button" disabled={!onOpenReportSchedules} onClick={()=>openSchedules('personal')}><Clock size={16}/> My report schedule</button></div>{!onOpenReportSchedules&&<p className="wrs-help">Open Reports → Report schedules to edit your timetable.</p>}</div>
            <div className="wrs-note"><strong>What each scheduled report covers</strong><p>The window runs from the previous scheduled time to the current time: for example, 7 PM → 7 AM covers the overnight period. Each site is highlighted by name and has its own separate PDF and Excel files.</p></div>
            <div className="wrs-card"><Toggle emphasis label="All WhatsApp delivery" description="Includes alerts, reminders, reports, manual sends and password reset OTPs." checked={draft.enabled} onChange={enabled=>change(current=>({...current,enabled}))}/>{!draft.enabled&&<p className="wrs-paused">Delivery will be paused when you save. WhatsApp password reset codes will also stop.</p>}</div>
            <p className="wrs-help">The master switch controls every WhatsApp message, including password reset codes. A role or personal schedule’s Active switch controls scheduled reports. Hierarchy Master defines report access and assignments.</p>
            <h4>Message types</h4><div className="wrs-card">{channelOptions.map(([key,label,description])=><Toggle key={key} label={label} description={description} checked={draft.channels[key]} onChange={enabled=>patch('channels',{[key]:enabled})}/>)}</div>
            <h4>Quiet hours</h4><div className="wrs-card"><Toggle label="Pause during quiet hours" description="Pause non-OTP messages during this daily IST window. Missed event messages are not queued; overdue reminders can qualify at a later check." checked={draft.quietHours.enabled} onChange={enabled=>patch('quietHours',{enabled})}/>{draft.quietHours.enabled&&<div className="wrs-form-row wrs-inset"><label>From (IST)<input type="time" value={draft.quietHours.start} onChange={event=>patch('quietHours',{start:event.target.value})}/></label><label>Until (IST)<input type="time" value={draft.quietHours.end} onChange={event=>patch('quietHours',{end:event.target.value})}/></label></div>}</div>
            <p className="wrs-help">Provider credentials remain under WhatsApp Integration. Delivery history remains in WhatsApp alert history. These settings do not change in-app notifications.</p>
          </>}
          {section==='alerts'&&<>
            <div className="wrs-section-heading"><span>02 / REQUEST ALERTS</span><h3>Request alerts for operational users and admins</h3><p>By default, operational users, Admin and Super Admin receive all request alerts for all ticket categories within their permitted sites.</p></div>
            <div className="wrs-note">Managers and Directors receive scheduled reports only, never per-request alerts or reminders. Recipients need a saved WhatsApp number and access to the request’s site.</div>
            <div className="wrs-alerts">{EVENT_OPTIONS.map(({key,label})=><div className="wrs-card" key={key}>
              <Toggle label={label} description={draft.events[key].recipientRoles.length?`${draft.events[key].recipientRoles.length} recipient roles selected`:'No recipients selected — this alert will not be sent.'} checked={draft.events[key].enabled} onChange={enabled=>patchEvent(key,{enabled})}/>
              <details className="wrs-role-picker"><summary>Choose recipient roles<span>{draft.events[key].recipientRoles.length}</span></summary><div>{WORKFLOW_ROLE_OPTIONS.map(role=><label key={role.key}><input type="checkbox" checked={draft.events[key].recipientRoles.includes(role.key)} onChange={event=>patchEvent(key,{recipientRoles:event.target.checked?[...draft.events[key].recipientRoles,role.key]:draft.events[key].recipientRoles.filter(value=>value!==role.key)})}/>{role.label}</label>)}</div></details>
            </div>)}</div><p className="wrs-help">Off Road escalations use the Opened / Off Road recipients. Idle reminders use the Marked Idle recipients. Switching either alert off also pauses its reminders.</p>
          </>}
          {section==='reminders'&&<>
            <div className="wrs-section-heading"><span>03 / REMINDERS</span><h3>Follow up on unresolved requests</h3><p>Choose when operational users and admins receive another notification for an open or idle request. Managers and Directors receive scheduled reports only.</p></div>
            {[['offRoad','Off Road escalation','Send one escalation when a request is still Off Road after this many hours.','opened',168],['idle','Idle reminders','Repeat while the request remains Idle, at the selected interval.','idle',24]].map(([key,label,description,eventKey,max])=><div className="wrs-card" key={key}>
              <Toggle label={label} description={description} checked={draft.reminders[key].enabled} onChange={enabled=>patch('reminders',{[key]:{...draft.reminders[key],enabled}})}/>
              <div className="wrs-inset"><label className="wrs-number-field">{key==='offRoad'?'Escalate after':'Repeat every'}<span><input aria-label={`${label} hours`} type="number" min="1" max={max} value={draft.reminders[key].hours} onChange={event=>patch('reminders',{[key]:{...draft.reminders[key],hours:event.target.value===''?'':Number(event.target.value)}})}/> hours</span></label><p className="wrs-help">{draft.events[eventKey].enabled?`${draft.events[eventKey].recipientRoles.length} roles selected in ${eventKey==='opened'?'Opened / Off Road':'Marked Idle'} alerts.`:'The corresponding direct alert is off, so these reminders are paused.'}</p></div>
            </div>)}<div className="wrs-note"><strong>When changes take effect</strong><p>Saved rules apply on the next reminder check. Existing overdue requests may immediately qualify. A closed or verified request is no longer eligible.</p></div>
          </>}
          {section==='crm'&&<>
            <div className="wrs-section-heading"><span>04 / CRM REPORTS</span><h3>Organisation CRM fallback timetable</h3><p>These days and times apply when a user has no saved personal report schedule. My report schedule uses the same timing preferences for fleet and CRM reports and overrides this fallback.</p></div>
            <div className="wrs-note"><strong>Personal timing takes priority</strong><p>Choose your own days and times in Reports → My report schedule.</p><button type="button" className="wrs-outline-button" disabled={!onOpenReportSchedules} onClick={()=>openSchedules('personal')}>My report schedule</button></div>
            <div className="wrs-card"><Toggle label="Scheduled CRM reports" description="Use personal report timing when saved; otherwise use the organisation fallback below." checked={draft.crm.enabled} onChange={enabled=>patch('crm',{enabled})}/>
              <div className="wrs-inset"><label className="wrs-field-label">Fallback delivery days</label><div className="wrs-days">{days.map((day,index)=><label key={day}><input type="checkbox" checked={draft.crm.days.includes(index)} onChange={event=>patch('crm',{days:event.target.checked?[...draft.crm.days,index].sort():draft.crm.days.filter(value=>value!==index)})}/><span>{day}</span></label>)}</div>
                <label className="wrs-field-label">Fallback delivery times (IST)</label><div className="wrs-time-slots">{draft.crm.times.map((time,index)=><div key={index}><input type="time" aria-label={`CRM fallback delivery time ${index+1}`} value={time} onChange={event=>patch('crm',{times:draft.crm.times.map((value,item)=>item===index?event.target.value:value)})}/><button type="button" className="wrs-icon-button" aria-label={`Remove CRM fallback time ${index+1}`} onClick={()=>patch('crm',{times:draft.crm.times.filter((_,item)=>item!==index)})}><X size={16}/></button></div>)}<button type="button" className="wrs-outline-button" disabled={draft.crm.times.length>=6} onClick={()=>patch('crm',{times:[...draft.crm.times,'12:00']})}><Plus size={16}/> Add time</button></div><p className="wrs-help">Up to six fallback slots per day. All times are IST.</p>
                <label className="wrs-field-label">Recipient account types</label><div className="wrs-checks">{['Admin','Manager','Super Admin'].map(role=><label key={role}><input type="checkbox" checked={draft.crm.recipientRoles.includes(role)} onChange={event=>patch('crm',{recipientRoles:event.target.checked?[...draft.crm.recipientRoles,role]:draft.crm.recipientRoles.filter(value=>value!==role)})}/>{role}</label>)}</div><p className="wrs-help">Each recipient receives their permitted site scope. Managers need an assigned region or site.</p>
                <div className="wrs-inset"><strong>Separate PDF and Excel files for each site</strong><p className="wrs-help">Each site is highlighted by name, with its own PDF and Excel links covering all ticket categories within permitted sites. The window runs from the previous scheduled time to the current time: for example, 7 PM → 7 AM. Links expire in 14 days.</p></div>
              </div><Toggle label="Send empty reports" description="Send a zero-count report when there are no matching tickets in the reporting window." checked={draft.crm.sendEmpty} onChange={sendEmpty=>patch('crm',{sendEmpty})}/>
            </div>
          </>}
          {section==='templates'&&<>
            <div className="wrs-section-heading"><span>05 / MESSAGE TEMPLATES</span><h3>A sample for every report and update</h3><p>Choose from 10 ready-made samples for each purpose, or customise one. Includes {SINGLE_REPORT_TEMPLATE_PURPOSES.length} single reports, consolidated bundles, alerts and reminders.</p></div>
            <label className="wrs-field-label">Message purpose<select value={purpose} onChange={event=>setPurpose(event.target.value)}>{purposeGroups.map(group=><optgroup key={group} label={group}>{PURPOSE_OPTIONS.filter(option=>option.group===group).map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</optgroup>)}</select></label>
            {isSingleReportPurpose(purpose)?<p className="wrs-help">This choice applies when this is the only report in a scheduled delivery. A delivery containing multiple reports uses the consolidated bundle choice. By default, single reports follow that choice too.</p>:purpose==='consolidatedRequestReport'?<p className="wrs-help">Used for deliveries with multiple reports, and for single reports set to Follow consolidated choice.</p>:null}
            <div className="wrs-template-workbench">
              <div className="wrs-sample-library"><div className="wrs-library-heading"><strong>{choices.length} ready-made samples</strong><span>Choose one to preview</span></div><div className="wrs-template-choices" role="radiogroup" aria-label="Template samples">{displayChoices.map(choice=><label key={choice.variant} className={selection.variant===choice.variant?'is-selected':''}><span className="wrs-sample-top"><input type="radio" name="wrs-template-style" aria-label={choice.label} checked={selection.variant===choice.variant} onChange={()=>patchTemplate({variant:choice.variant,...(choice.variant==='custom'&&!selection.body?{body:editableSample||choices.find(item=>item.variant==='detailed').body}:{})})}/><span>{choices.some(item=>item.variant===choice.variant)?String(choices.findIndex(item=>item.variant===choice.variant)+1).padStart(2,'0'):choice.variant==='inherit'?'Default':'Edit'}</span></span><strong>{choice.label}</strong><small>{choice.description}</small></label>)}</div></div>
              <div className="wrs-preview"><div className="wrs-preview-label"><MessageSquare size={17}/><strong>Message preview</strong><span>Sample data</span></div><p className="wrs-preview-style">{selectedLabel}</p><pre>{preview}</pre><button type="button" className="wrs-outline-button" disabled={selection.variant==='custom'} onClick={()=>patchTemplate({variant:'custom',body:editableSample})}>Customise this sample</button></div>
            </div>
            {selection.variant==='custom'&&<div className="wrs-card wrs-inset"><label className="wrs-field-label">Message wording<textarea rows="9" maxLength="1024" value={body} onChange={event=>patchTemplate({body:event.target.value})}/></label><div className="wrs-character-count">{body.length} / 1,024 characters</div>{validation&&<p className="wrs-inline-error" role="status">{validation}</p>}<p className="wrs-help">Keep every placeholder. The real request or report details replace these values when sending.</p><div className="wrs-placeholders">{TEMPLATE_FIELD_LABELS[baseTemplateKey(purpose)].map((label,index)=><span key={label}><code>{`{{${index+1}}}`}</code> {label}</span>)}</div></div>}
            <div className="wrs-note"><strong>Site comes first in every operational message</strong><p>The first line is a bold site heading. Each message includes the relevant complaint, breakdown type, repair or resolution details. Next-step wording follows the receiving team’s role. Scheduled reports keep a separate PDF and Excel link for each site.</p><p>Custom wording must start with <code>{'*SITE: {{1}}*'}</code> on its own line and retain all the numbered fields. Older custom wording stays saved for reference; update its fields or select a prepared style to use the new layout.</p></div>
            <div className="wrs-approval"><div><strong>{templateDirty?'Unsaved template choice':templateState?.status==='APPROVED'&&templateState?.usingRequested?'Selected wording is approved':'Template approval needs checking'}</strong><span>{templateDirty?'Save settings before submitting this choice.':`Meta status: ${(templateState?.status||'NOT_CHECKED').replaceAll('_',' ').toLowerCase()}`}</span>{!templateDirty&&templateState?.checkedAt&&<small>Last checked: {new Date(templateState.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</small>}</div><p>New or edited templates need Meta approval. Save your choices, submit them, then refresh approval status. The site-first standard is submitted automatically after deployment. Delivery uses the previous approved template if Meta says the new template is not yet available. The new layout takes effect when Meta accepts it.</p><div className="wrs-template-actions"><button type="button" className="wrs-outline-button" disabled={dirty||!!validation} onClick={()=>sync('submit')}>{busy==='submit'?'Submitting…':'Submit saved template choices'}</button><button type="button" className="wrs-outline-button" disabled={dirty} onClick={()=>sync('refresh')}><RefreshCw size={15}/>{busy==='refresh'?'Refreshing…':'Refresh approval status'}</button></div></div>
            <p className="wrs-help">Templates change WhatsApp wording, not PDF contents or report access. Password reset OTPs retain their authentication template.</p>
          </>}
          </fieldset>
        </main>
      </div>}
      <footer className="wrs-footer"><div><span className={`wrs-state-dot${dirty?' is-dirty':''}`}/>{busy==='load'?'Loading…':dirty?'Unsaved changes':details?.revision?'Saved configuration':'Existing defaults'}{details?.revision&&!dirty&&<small>Updated {new Date(details.revision).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</small>}</div><div className="wrs-footer-actions"><button type="button" className="wrs-reset" disabled={!draft||!!busy} onClick={()=>{change(resetWhatsAppDeliveryRules);setNotice('Default delivery rules loaded. Your CRM days and times, role schedules, personal schedules and message templates are kept. Save settings to apply the rules.');}}>Reset delivery rules<small>Keep saved timetables</small></button><button type="button" className="wrs-outline-button" disabled={!!busy} onClick={close}>Close</button><button type="button" className="wrs-save" disabled={!draft||!dirty||!!busy} onClick={save}><Save size={17}/>{busy==='save'?'Saving…':'Save settings'}</button></div></footer>
    </div>
  </div>,document.body);
}

export default function WhatsAppReportSettingsButton({token,onOpenReportSchedules}) {
  const [open,setOpen]=useState(false);
  return <><button type="button" className="secondary director-timing-trigger" onClick={()=>setOpen(true)}><Settings2/> WhatsApp delivery settings</button>{open&&<WhatsAppReportSettingsDialog token={token} onClose={()=>setOpen(false)} onOpenReportSchedules={onOpenReportSchedules?target=>{setOpen(false);onOpenReportSchedules(target);}:undefined}/>}</>;
}
