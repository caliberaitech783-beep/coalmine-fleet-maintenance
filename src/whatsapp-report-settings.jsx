import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Bell, Check, Clock, FileText, MessageSquare, Plus, RefreshCw, Save, Settings2, ShieldCheck, X} from 'lucide-react';
import {defaultWhatsAppReportSettings, EVENT_OPTIONS, PURPOSE_OPTIONS, WORKFLOW_ROLE_OPTIONS, whatsappSettingsValidationError} from '../whatsapp-report-settings.mjs';
import {baseTemplateKey, isSingleReportPurpose, previewReportTemplate, reportTemplateChoices, resolvedReportTemplateChoice, SINGLE_REPORT_TEMPLATE_PURPOSES, TEMPLATE_FIELD_LABELS, validateCustomTemplate} from '../whatsapp-template-catalog.mjs';
import {readApiJson} from './api-response.mjs';
import './whatsapp-report-settings.css';

const sections = [
  {key:'delivery',label:'Delivery controls',icon:ShieldCheck},
  {key:'alerts',label:'Direct alerts',icon:Bell},
  {key:'reminders',label:'Reminders',icon:Clock},
  {key:'crm',label:'CRM report schedule',icon:FileText},
  {key:'templates',label:'Message templates',icon:MessageSquare},
];
const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const channelOptions = [
  ['hierarchyReports','Hierarchy reports','Scheduled and event report bundles. Recipients and report selections remain in Hierarchy Master and Report schedules.'],
  ['ticketCreated','CRM ticket created','Notify the assigned CRM audience when a ticket is created.'],
  ['ticketResolved','CRM ticket resolved','Notify the ticket creator and the assigned managers when a ticket is resolved.'],
  ['dailyUpdate','Daily maintenance updates','Notify the existing maintenance workflow audience when an update is added.'],
  ['manualReports','Manual report sends','Allow reports sent using the WhatsApp Send action, including administrator report tests.'],
  ['passwordResetOtp','Password reset OTPs','Allow WhatsApp verification codes for password resets. Keep this on if users depend on WhatsApp account recovery.'],
];

function Toggle({label,description,checked,onChange,emphasis=false}) {
  return <label className={`wrs-toggle-row${emphasis?' wrs-toggle-emphasis':''}`}>
    <span><strong>{label}</strong>{description&&<small>{description}</small>}</span>
    <span className="wrs-switch"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)}/><span aria-hidden="true"/></span>
  </label>;
}

export function WhatsAppReportSettingsDialog({token,onClose}) {
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
  const dirty = !!details && JSON.stringify(draft)!==JSON.stringify(details.settings);
  const close = () => {if(busy)return;if(dirty)setDiscardPrompt(true);else onClose();};
  closeRef.current=close;

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

  const request = async(path='',init={}) => readApiJson(await fetch(`/api/report-settings${path}`,{...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}}),'Could not update Report settings.');
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
      <header className="wrs-header"><span className="wrs-header-icon"><Settings2/></span><div><h2 id="wrs-title">Report settings</h2><p>WhatsApp delivery, recipients and message preferences</p></div><span className="wrs-admin-badge">Admin controls</span><button type="button" className="wrs-icon-button" aria-label="Close Report settings" disabled={!!busy} onClick={close}><X/></button></header>
      {error&&<div className="wrs-feedback wrs-error" role="alert">{error}<button type="button" onClick={load} disabled={!!busy}>Reload saved settings</button></div>}
      {notice&&<div className="wrs-feedback wrs-success" role="status"><Check size={17}/>{notice}</div>}
      {discardPrompt&&<div className="wrs-feedback wrs-discard" role="alert"><span>You have unsaved changes.</span><button type="button" onClick={()=>setDiscardPrompt(false)}>Keep editing</button><button type="button" onClick={onClose}>Discard and close</button></div>}
      {!draft?<div className="wrs-loading">{busy?'Loading saved settings…':'Settings could not be loaded. Use Reload to try again.'}</div>:<div className="wrs-layout">
        <nav className="wrs-nav" aria-label="Report settings sections">{sections.map(({key,label,icon:Icon})=><button type="button" key={key} aria-current={section===key?'page':undefined} onClick={()=>setSection(key)}><Icon size={18}/>{label}</button>)}<div className="wrs-nav-note"><strong>All times are IST</strong><span>Changes apply to the organisation after you save.</span><span>Report access and site permissions still apply.</span></div></nav>
        <main className="wrs-content" aria-busy={!!busy}>
          <fieldset className="wrs-editable" disabled={!!busy}>
          {section==='delivery'&&<>
            <div className="wrs-section-heading"><span>01 / DELIVERY</span><h3>One place to control WhatsApp</h3><p>Use the master switch to pause every WhatsApp message sent by Nerve Center.</p></div>
            <div className="wrs-card"><Toggle emphasis label="All WhatsApp delivery" description="Includes alerts, reminders, reports, manual sends and password reset OTPs." checked={draft.enabled} onChange={enabled=>change(current=>({...current,enabled}))}/>{!draft.enabled&&<p className="wrs-paused">Delivery will be paused when you save. WhatsApp password reset codes will also stop.</p>}</div>
            <div className="wrs-note"><strong>How this differs from Report schedules</strong><p>A designation’s Active switch only controls its hierarchy reports. The master switch above controls all WhatsApp delivery. Hierarchy Master continues to define hierarchy rules and report assignments.</p></div>
            <h4>Message types</h4><div className="wrs-card">{channelOptions.map(([key,label,description])=><Toggle key={key} label={label} description={description} checked={draft.channels[key]} onChange={enabled=>patch('channels',{[key]:enabled})}/>)}</div>
            <h4>Quiet hours</h4><div className="wrs-card"><Toggle label="Pause during quiet hours" description="Pause non-OTP messages during this daily IST window. Missed event messages are not queued; overdue reminders can qualify at a later check." checked={draft.quietHours.enabled} onChange={enabled=>patch('quietHours',{enabled})}/>{draft.quietHours.enabled&&<div className="wrs-form-row wrs-inset"><label>From (IST)<input type="time" value={draft.quietHours.start} onChange={event=>patch('quietHours',{start:event.target.value})}/></label><label>Until (IST)<input type="time" value={draft.quietHours.end} onChange={event=>patch('quietHours',{end:event.target.value})}/></label></div>}</div>
            <p className="wrs-help">Provider credentials remain under WhatsApp Integration. Delivery history remains in WhatsApp alert history. These settings do not change in-app notifications.</p>
          </>}
          {section==='alerts'&&<>
            <div className="wrs-section-heading"><span>02 / DIRECT ALERTS</span><h3>Choose who receives each event</h3><p>Alerts are sent when a request changes status. Select the roles to notify for that event.</p></div>
            <div className="wrs-note">Recipients must have a saved WhatsApp number and access to the request’s site. Admin, Super Admin and Director receive these alerts only when explicitly selected.</div>
            <div className="wrs-alerts">{EVENT_OPTIONS.map(({key,label})=><div className="wrs-card" key={key}>
              <Toggle label={label} description={draft.events[key].recipientRoles.length?`${draft.events[key].recipientRoles.length} recipient roles selected`:'No recipients selected — this alert will not be sent.'} checked={draft.events[key].enabled} onChange={enabled=>patchEvent(key,{enabled})}/>
              <details className="wrs-role-picker"><summary>Choose recipient roles<span>{draft.events[key].recipientRoles.length}</span></summary><div>{WORKFLOW_ROLE_OPTIONS.map(role=><label key={role.key}><input type="checkbox" checked={draft.events[key].recipientRoles.includes(role.key)} onChange={event=>patchEvent(key,{recipientRoles:event.target.checked?[...draft.events[key].recipientRoles,role.key]:draft.events[key].recipientRoles.filter(value=>value!==role.key)})}/>{role.label}</label>)}</div></details>
            </div>)}</div><p className="wrs-help">Off Road escalations use the Opened / Off Road recipients. Idle reminders use the Marked Idle recipients. Switching either alert off also pauses its reminders.</p>
          </>}
          {section==='reminders'&&<>
            <div className="wrs-section-heading"><span>03 / REMINDERS</span><h3>Follow up on unresolved requests</h3><p>Choose when an open or idle request needs another WhatsApp notification.</p></div>
            {[['offRoad','Off Road escalation','Send one escalation when a request is still Off Road after this many hours.','opened',168],['idle','Idle reminders','Repeat while the request remains Idle, at the selected interval.','idle',24]].map(([key,label,description,eventKey,max])=><div className="wrs-card" key={key}>
              <Toggle label={label} description={description} checked={draft.reminders[key].enabled} onChange={enabled=>patch('reminders',{[key]:{...draft.reminders[key],enabled}})}/>
              <div className="wrs-inset"><label className="wrs-number-field">{key==='offRoad'?'Escalate after':'Repeat every'}<span><input aria-label={`${label} hours`} type="number" min="1" max={max} value={draft.reminders[key].hours} onChange={event=>patch('reminders',{[key]:{...draft.reminders[key],hours:event.target.value===''?'':Number(event.target.value)}})}/> hours</span></label><p className="wrs-help">{draft.events[eventKey].enabled?`${draft.events[eventKey].recipientRoles.length} roles selected in ${eventKey==='opened'?'Opened / Off Road':'Marked Idle'} alerts.`:'The corresponding direct alert is off, so these reminders are paused.'}</p></div>
            </div>)}<div className="wrs-note"><strong>When changes take effect</strong><p>Saved rules apply on the next reminder check. Existing overdue requests may immediately qualify. A closed or verified request is no longer eligible.</p></div>
          </>}
          {section==='crm'&&<>
            <div className="wrs-section-heading"><span>04 / CRM REPORTS</span><h3>Your CRM delivery timetable</h3><p>Send a ticket summary, a PDF, or both. The reporting window runs from the previous scheduled slot to the current one.</p></div>
            <div className="wrs-card"><Toggle label="Scheduled CRM reports" description="Default: every day at 08:00, 15:00 and 20:00 IST." checked={draft.crm.enabled} onChange={enabled=>patch('crm',{enabled})}/>
              <div className="wrs-inset"><label className="wrs-field-label">Delivery days</label><div className="wrs-days">{days.map((day,index)=><label key={day}><input type="checkbox" checked={draft.crm.days.includes(index)} onChange={event=>patch('crm',{days:event.target.checked?[...draft.crm.days,index].sort():draft.crm.days.filter(value=>value!==index)})}/><span>{day}</span></label>)}</div>
                <label className="wrs-field-label">Delivery times (IST)</label><div className="wrs-time-slots">{draft.crm.times.map((time,index)=><div key={index}><input type="time" aria-label={`CRM delivery time ${index+1}`} value={time} onChange={event=>patch('crm',{times:draft.crm.times.map((value,item)=>item===index?event.target.value:value)})}/><button type="button" className="wrs-icon-button" aria-label={`Remove CRM time ${index+1}`} onClick={()=>patch('crm',{times:draft.crm.times.filter((_,item)=>item!==index)})}><X size={16}/></button></div>)}<button type="button" className="wrs-outline-button" disabled={draft.crm.times.length>=6} onClick={()=>patch('crm',{times:[...draft.crm.times,'12:00']})}><Plus size={16}/> Add time</button></div><p className="wrs-help">Up to six daily slots. Scheduled reports are checked every minute while background jobs are running.</p>
                <label className="wrs-field-label">Recipient account types</label><div className="wrs-checks">{['Admin','Manager','Super Admin'].map(role=><label key={role}><input type="checkbox" checked={draft.crm.recipientRoles.includes(role)} onChange={event=>patch('crm',{recipientRoles:event.target.checked?[...draft.crm.recipientRoles,role]:draft.crm.recipientRoles.filter(value=>value!==role)})}/>{role}</label>)}</div><p className="wrs-help">Each recipient receives their permitted site scope. Managers need an assigned region or site.</p>
                <label className="wrs-field-label">Report format<select value={draft.crm.format} onChange={event=>patch('crm',{format:event.target.value})}><option value="both">WhatsApp summary + PDF</option><option value="summary">WhatsApp summary only</option><option value="pdf">PDF only</option></select></label>
              </div><Toggle label="Send empty reports" description="Send a zero-count report when there are no matching tickets in the reporting window." checked={draft.crm.sendEmpty} onChange={sendEmpty=>patch('crm',{sendEmpty})}/>
            </div>
          </>}
          {section==='templates'&&<>
            <div className="wrs-section-heading"><span>05 / MESSAGE TEMPLATES</span><h3>A sample for every report and update</h3><p>Choose from 10 ready-made samples for each purpose, or customise one. Includes {SINGLE_REPORT_TEMPLATE_PURPOSES.length} single reports, consolidated bundles, alerts and reminders.</p></div>
            <label className="wrs-field-label">Message purpose<select value={purpose} onChange={event=>setPurpose(event.target.value)}>{purposeGroups.map(group=><optgroup key={group} label={group}>{PURPOSE_OPTIONS.filter(option=>option.group===group).map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</optgroup>)}</select></label>
            {isSingleReportPurpose(purpose)?<p className="wrs-help">This choice applies when this is the only report in a scheduled or event delivery. A delivery containing multiple reports uses the consolidated bundle choice. By default, single reports follow that choice too.</p>:purpose==='consolidatedRequestReport'?<p className="wrs-help">Used for deliveries with multiple reports, and for single reports set to Follow consolidated choice.</p>:null}
            <div className="wrs-template-workbench">
              <div className="wrs-sample-library"><div className="wrs-library-heading"><strong>{choices.length} ready-made samples</strong><span>Choose one to preview</span></div><div className="wrs-template-choices" role="radiogroup" aria-label="Template samples">{displayChoices.map(choice=><label key={choice.variant} className={selection.variant===choice.variant?'is-selected':''}><span className="wrs-sample-top"><input type="radio" name="wrs-template-style" aria-label={choice.label} checked={selection.variant===choice.variant} onChange={()=>patchTemplate({variant:choice.variant,...(choice.variant==='custom'&&!selection.body?{body:editableSample||choices.find(item=>item.variant==='detailed').body}:{})})}/><span>{choices.some(item=>item.variant===choice.variant)?String(choices.findIndex(item=>item.variant===choice.variant)+1).padStart(2,'0'):choice.variant==='inherit'?'Default':'Edit'}</span></span><strong>{choice.label}</strong><small>{choice.description}</small></label>)}</div></div>
              <div className="wrs-preview"><div className="wrs-preview-label"><MessageSquare size={17}/><strong>Message preview</strong><span>Sample data</span></div><p className="wrs-preview-style">{selectedLabel}</p><pre>{preview}</pre><button type="button" className="wrs-outline-button" disabled={selection.variant==='custom'} onClick={()=>patchTemplate({variant:'custom',body:editableSample})}>Customise this sample</button></div>
            </div>
            {selection.variant==='custom'&&<div className="wrs-card wrs-inset"><label className="wrs-field-label">Message wording<textarea rows="9" maxLength="1024" value={body} onChange={event=>patchTemplate({body:event.target.value})}/></label><div className="wrs-character-count">{body.length} / 1,024 characters</div>{validation&&<p className="wrs-inline-error" role="status">{validation}</p>}<p className="wrs-help">Keep every placeholder. The real request or report details replace these values when sending.</p><div className="wrs-placeholders">{TEMPLATE_FIELD_LABELS[baseTemplateKey(purpose)].map((label,index)=><span key={label}><code>{`{{${index+1}}}`}</code> {label}</span>)}</div></div>}
            <div className="wrs-approval"><div><strong>{templateDirty?'Unsaved template choice':templateState?.usingRequested?'Selected wording is active':'Current standard remains active'}</strong><span>{templateDirty?'Save settings before submitting this choice.':`Meta status: ${(templateState?.status||'NOT_CHECKED').replaceAll('_',' ').toLowerCase()}`}</span>{!templateDirty&&templateState?.checkedAt&&<small>Last checked: {new Date(templateState.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</small>}</div><p>New or edited templates need Meta approval. Save your choices, submit them, then refresh approval status. The current standard remains in use until the selected template is approved. Meta can still reject delivery.</p><div className="wrs-template-actions"><button type="button" className="wrs-outline-button" disabled={dirty||!!validation} onClick={()=>sync('submit')}>{busy==='submit'?'Submitting…':'Submit saved template choices'}</button><button type="button" className="wrs-outline-button" disabled={dirty} onClick={()=>sync('refresh')}><RefreshCw size={15}/>{busy==='refresh'?'Refreshing…':'Refresh approval status'}</button></div></div>
            <p className="wrs-help">Templates change WhatsApp wording, not PDF contents or report access. Password reset OTPs retain their authentication template.</p>
          </>}
          </fieldset>
        </main>
      </div>}
      <footer className="wrs-footer"><div><span className={`wrs-state-dot${dirty?' is-dirty':''}`}/>{busy==='load'?'Loading…':dirty?'Unsaved changes':details?.revision?'Saved configuration':'Existing defaults'}{details?.revision&&!dirty&&<small>Updated {new Date(details.revision).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</small>}</div><div className="wrs-footer-actions"><button type="button" className="wrs-reset" disabled={!draft||!!busy} onClick={()=>{change(()=>defaultWhatsAppReportSettings());setNotice('Defaults loaded into the form. Save to apply them.');}}>Load defaults</button><button type="button" className="wrs-outline-button" disabled={!!busy} onClick={close}>Close</button><button type="button" className="wrs-save" disabled={!draft||!dirty||!!busy} onClick={save}><Save size={17}/>{busy==='save'?'Saving…':'Save settings'}</button></div></footer>
    </div>
  </div>,document.body);
}

export default function WhatsAppReportSettingsButton({token}) {
  const [open,setOpen]=useState(false);
  return <><button type="button" className="secondary director-timing-trigger" onClick={()=>setOpen(true)}><Settings2/> Report settings</button>{open&&<WhatsAppReportSettingsDialog token={token} onClose={()=>setOpen(false)}/>}</>;
}
