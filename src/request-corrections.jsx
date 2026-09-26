import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Eye,ImageUp,LockKeyhole,Pencil,RefreshCw,Search,Send,ShieldCheck,Trash2,X} from 'lucide-react';
import {REQUEST_CORRECTION_STATUS,REQUEST_CORRECTION_TYPES,requestCorrectionFields} from '../request-correction-policy.mjs';
import SearchableSelect from './searchable-select.jsx';
import './request-corrections.css';
import DateInput from "./date-input.mjs";

const requestValue=(request,key)=>{
  const aliases={startedAt:'start',superiorName:'superior'};
  return request?.[key]??request?.[aliases[key]]??'';
};
const localInputValue=(value)=>{
  const text=String(value||'').trim();
  if(!text)return '';
  if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)&&!/[zZ]|[+-]\d{2}:?\d{2}$/.test(text))return text.replace(' ','T').slice(0,19);
  const date=new Date(text);
  if(Number.isNaN(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const valueOf=(type)=>parts.find((part)=>part.type===type)?.value||'';
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}T${valueOf('hour')}:${valueOf('minute')}:${valueOf('second')}`;
};
const displayValue=(value,kind)=>{
  if(kind==='boolean')return value===true?'Yes':'No';
  if(kind==='datetime'&&value){
    const date=new Date(value);
    if(!Number.isNaN(date.getTime()))return new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(date).replaceAll('/','-').toUpperCase();
  }
  return String(value??'').trim()||'Not recorded';
};
const statusClass=(value)=>String(value||'').toLowerCase().replaceAll(' ','-');

function CorrectionField({field,value,onChange,options=[]}){
  // Master-driven lists (e.g. Breakdown type). The recorded value stays selectable even if it is no longer in the master.
  if(field.optionsSource&&options.length){
    const current=String(value??'').trim();
    const choices=current&&!options.some((option)=>option.toLowerCase()===current.toLowerCase())?[current,...options]:options;
    return <label><span>{field.label}</span><select value={choices.find((option)=>option.toLowerCase()===current.toLowerCase())??''} onChange={(event)=>onChange(event.target.value)}><option value="" disabled>Select {field.label.toLowerCase()}</option>{choices.map((option)=><option value={option} key={option}>{option}</option>)}</select></label>;
  }
  if(field.kind==='boolean')return <label className="correction-checkbox"><input type="checkbox" checked={value===true} onChange={(event)=>onChange(event.target.checked)} /><span>{field.label}</span></label>;
  if(field.kind==='textarea')return <label><span>{field.label}</span><textarea value={value??''} onChange={(event)=>onChange(event.target.value)} rows="3" /></label>;
  if(field.kind==='select')return <label><span>{field.label}</span><select value={value??''} onChange={(event)=>onChange(event.target.value)}>{field.options.map((option)=><option value={option} key={option||'blank'}>{option||'Not recorded'}</option>)}</select></label>;
  const InputControl=field.kind==='datetime'?DateInput:'input';
  return <label><span>{field.label}</span><InputControl type={field.kind==='datetime'?'datetime-local':field.kind==='meter'?'number':'text'} step={field.kind==='datetime'?1:field.kind==='meter'?'0.01':undefined} value={field.kind==='datetime'?localInputValue(value):value??''} onChange={(event)=>onChange(event.target.value)} /></label>;
}

function EvidenceViewer({record,token,Modal,onClose}){
  const [state,setState]=useState({loading:true,error:'',data:null});
  useEffect(()=>{let live=true;fetch(`/api/request-corrections/${record.id}/evidence`,{headers:{Authorization:`Bearer ${token}`}}).then(async(response)=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not load correction image');if(live)setState({loading:false,error:'',data:body})}).catch((error)=>live&&setState({loading:false,error:error.message,data:null}));return()=>{live=false}},[record.id,token]);
  return <Modal title={`Correction evidence · ${record.requestReference}`} close={onClose}><div className="correction-evidence-view">{state.loading?<p>Loading image…</p>:state.error?<div className="correction-notice error">{state.error}</div>:<><img src={state.data.evidenceData} alt={`Correction evidence ${state.data.evidenceName}`} /><p>{state.data.evidenceName}</p></>}</div></Modal>;
}

function CorrectionCard({record,capabilities,token,Modal,onChanged,fieldOptions={}}){
  const [remark,setRemark]=useState('');
  const [working,setWorking]=useState('');
  const [error,setError]=useState('');
  const [showEvidence,setShowEvidence]=useState(false);
  const [editing,setEditing]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const [values,setValues]=useState({});
  const [reason,setReason]=useState('');
  const type=REQUEST_CORRECTION_TYPES[record.correctionType];
  const fields=requestCorrectionFields(record.correctionType).filter((field)=>Object.prototype.hasOwnProperty.call(record.proposedChanges||{},field.key));
  const requestAction=async(action,payload={})=>{
    setWorking(action);setError('');
    try{
      const response=await fetch(`/api/request-corrections/${record.id}${['edit','delete'].includes(action)?'':`/${action}`}`,{method:action==='delete'?'DELETE':'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'The correction could not be updated.');
      setRemark('');setEditing(false);setConfirmDelete(false);await onChanged();
    }catch(problem){setError(problem.message)}finally{setWorking('')}
  };
  return <article className="correction-card">
    <header><div><span>#{record.id} · {record.site}</span><h3>{record.requestReference}</h3><p>{type?.label||record.correctionType}</p></div><b className={`correction-status ${statusClass(record.status)}`}>{record.status}</b></header>
    {record.canManage&&!editing&&!confirmDelete&&<div className="correction-manage"><button type="button" className="secondary" disabled={!!working} onClick={()=>{setValues({...record.originalValues,...record.proposedChanges});setReason(record.reason);setError('');setEditing(true)}}><Pencil /> Edit</button><button type="button" className="secondary danger" disabled={!!working} onClick={()=>{setError('');setConfirmDelete(true)}}><Trash2 /> Delete</button></div>}
    {editing&&<form className="correction-create" onSubmit={(event)=>{event.preventDefault();void requestAction('edit',{proposedChanges:values,reason})}}><b>Edit pending correction</b><p>Changes still require PM approval. The existing evidence image is retained.</p><fieldset disabled={!!working}><div className="correction-form-grid">{requestCorrectionFields(record.correctionType).map((field)=><CorrectionField key={field.key} field={field} value={values[field.key]} options={fieldOptions[field.optionsSource]||[]} onChange={(value)=>setValues((current)=>({...current,[field.key]:value}))} />)}</div><label><span>Reason for correction *</span><textarea required minLength={10} maxLength={1000} rows="3" value={reason} onChange={(event)=>setReason(event.target.value)} /></label></fieldset><div className="correction-manage"><button type="button" className="secondary" disabled={!!working} onClick={()=>{setEditing(false);setError('')}}>Cancel</button><button type="submit" className="primary" disabled={!!working||reason.trim().length<10}>{working==='edit'?'Saving…':'Save changes'}</button></div></form>}
    {confirmDelete&&<div className="correction-delete-confirm" role="alert"><b>Delete correction #{record.id} for {record.requestReference}?</b><p>This removes the pending correction from the approval queue. The maintenance request stays unchanged and the correction remains in history.</p><div className="correction-manage"><button type="button" className="secondary" disabled={!!working} onClick={()=>{setConfirmDelete(false);setError('')}}>Cancel</button><button type="button" className="secondary danger" disabled={!!working} onClick={()=>requestAction('delete')}><Trash2 /> {working==='delete'?'Deleting…':'Confirm delete'}</button></div></div>}
    <div className="correction-meta"><span>Requested by <b>{record.requestedByName}</b></span><span>Reason <b>{record.reason}</b></span></div>
    <div className="correction-comparison">{fields.map((field)=><div key={field.key}><span>{field.label}</span><del>{displayValue(record.originalValues?.[field.key],field.kind)}</del><strong>{displayValue(record.proposedChanges?.[field.key],field.kind)}</strong></div>)}</div>
    <button type="button" className="correction-evidence-button" onClick={()=>setShowEvidence(true)}><Eye /> View evidence image · {record.evidenceName}</button>
    {record.reviewedAt&&<div className="correction-review"><ShieldCheck /><div><b>{record.reviewedByName}</b><p>{record.reviewRemark}</p></div></div>}
    {record.appliedAt&&<div className="correction-review applied"><CheckCircle2 /><div><b>Applied by {record.appliedByName}</b><p>The approved values are now in the maintenance request.</p></div></div>}
    {!editing&&!confirmDelete&&capabilities.canReview&&record.status===REQUEST_CORRECTION_STATUS.PENDING&&<div className="correction-decision"><label><span>PM verification remark *</span><textarea value={remark} onChange={(event)=>setRemark(event.target.value)} placeholder="Confirm what you checked before approving or rejecting." rows="2" /></label><div><button type="button" className="secondary danger" disabled={working||remark.trim().length<5} onClick={()=>requestAction('review',{decision:'reject',remark})}><X /> Reject</button><button type="button" className="primary" disabled={working||remark.trim().length<5} onClick={()=>requestAction('review',{decision:'approve',remark})}><ShieldCheck /> {working==='review'?'Saving…':'Approve correction'}</button></div></div>}
    {capabilities.canApply&&<div className="correction-apply">{record.status===REQUEST_CORRECTION_STATUS.APPROVED?<button type="button" className="primary" disabled={working} onClick={()=>requestAction('apply')}><CheckCircle2 /> {working==='apply'?'Applying…':'Apply approved correction'}</button>:record.status===REQUEST_CORRECTION_STATUS.PENDING?<span><LockKeyhole /> Locked until PM approval</span>:null}</div>}
    {error&&<div className="correction-notice error">{error}</div>}
    {showEvidence&&<EvidenceViewer record={record} token={token} Modal={Modal} onClose={()=>setShowEvidence(false)} />}
  </article>;
}

function NewCorrectionForm({requests,token,onSaved,allowedTypes=[],fieldOptions={}}){
  const [reference,setReference]=useState('');
  const correctionTypes=allowedTypes.filter((key)=>REQUEST_CORRECTION_TYPES[key]);
  const [type,setType]=useState(correctionTypes[0]||'offRoad');
  const [values,setValues]=useState({});
  const [reason,setReason]=useState('');
  const [evidence,setEvidence]=useState(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');
  const selected=requests.find((request)=>request.ref===reference);
  const fields=requestCorrectionFields(type);
  const requestOptions=useMemo(()=>requests.map((request)=>({value:request.ref,label:`${request.ref} · ${request.door||request.equipment||'Vehicle not recorded'}`,description:`${request.site||'Site not recorded'} · ${request.equipment||'Equipment not recorded'}`,keywords:[request.ref,request.site,request.door,request.equipment,request.chassisNo,request.reg].filter(Boolean).join(' ')})),[requests]);
  useEffect(()=>{if(correctionTypes.length&&!correctionTypes.includes(type))setType(correctionTypes[0])},[allowedTypes.join('|'),type]);
  useEffect(()=>{
    if(!selected){setValues({});return}
    setValues(Object.fromEntries(fields.map((field)=>[field.key,field.kind==='boolean'?requestValue(selected,field.key)===true:requestValue(selected,field.key)])));
  },[reference,type]);
  const readEvidence=async(file)=>{
    setError('');
    if(!file){setEvidence(null);return}
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>5*1024*1024){setEvidence(null);setError('Upload a JPG, PNG, or WebP image up to 5 MB.');return}
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read the selected image.'));reader.readAsDataURL(file)});
    setEvidence({data,name:file.name,type:file.type});
  };
  const submit=async(event)=>{
    event.preventDefault();setWorking(true);setError('');
    try{
      const response=await fetch('/api/request-corrections',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({requestReference:reference,correctionType:type,proposedChanges:values,reason,evidenceData:evidence?.data||'',evidenceName:evidence?.name||'',evidenceType:evidence?.type||''})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||'Could not submit the correction.');
      setReference('');setReason('');setEvidence(null);setValues({});await onSaved();
    }catch(problem){setError(problem.message)}finally{setWorking(false)}
  };
  return <form className="correction-create" onSubmit={submit}>
    <div className="correction-form-heading"><div><Pencil /><span><b>Request a correction</b><small>The live record remains unchanged until PM approval and final Admin correction.</small></span></div><b>Department manager request</b></div>
    <div className="correction-form-grid top"><SearchableSelect label="Maintenance request" options={requestOptions} value={reference} onChange={setReference} required placeholder="Search request, door, equipment, chassis, or site" emptyText="No matching maintenance request found." /><label><span>Correction type *</span><select value={type} onChange={(event)=>setType(event.target.value)}>{correctionTypes.map((key)=><option key={key} value={key}>{REQUEST_CORRECTION_TYPES[key].label}</option>)}</select></label></div>
    {selected&&<><div className="correction-request-summary"><b>{selected.ref}</b><span>{selected.site}</span><span>{selected.equipment} · {selected.door}</span><span>Status: {selected.status}</span></div><div className="correction-form-grid">{fields.map((field)=><CorrectionField key={field.key} field={field} value={values[field.key]} options={fieldOptions[field.optionsSource]||[]} onChange={(value)=>setValues((current)=>({...current,[field.key]:value}))} />)}</div></>}
    <label><span>Reason for correction * (minimum 10 characters)</span><textarea rows="3" value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Explain the error, the correct value, and why the record must be changed." required /></label>
    <label className="correction-upload"><ImageUp /><span><b>{evidence?.name||'Upload correction evidence *'}</b><small>JPG, PNG, or WebP · maximum 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>readEvidence(event.target.files?.[0])} required={!evidence} /></label>
    {error&&<div className="correction-notice error">{error}</div>}
    <div className="correction-submit"><button type="submit" className="primary" disabled={working||!selected||!evidence||reason.trim().length<10}><Send /> {working?'Sending…':'Request PM approval'}</button></div>
  </form>;
}

export default function RequestCorrections({session,requests=[],Dialog}){
  const token=session?.token||'';
  const [state,setState]=useState({records:[],capabilities:{},loading:true,error:''});
  const [status,setStatus]=useState('Open');
  const [query,setQuery]=useState('');
  const load=async()=>{
    setState((current)=>({...current,loading:true,error:''}));
    try{const response=await fetch('/api/request-corrections',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not load corrections');setState({records:body.records||[],capabilities:body.capabilities||{},fieldOptions:body.fieldOptions||{},loading:false,error:''})}
    catch(error){setState((current)=>({...current,loading:false,error:error.message}))}
  };
  useEffect(()=>{void load()},[token]);
  const visible=useMemo(()=>{const needle=query.trim().toLowerCase();return state.records.filter((record)=>(status==='All'||(status==='Open'?[REQUEST_CORRECTION_STATUS.PENDING,REQUEST_CORRECTION_STATUS.APPROVED].includes(record.status):record.status===status))&&(!needle||JSON.stringify(record).toLowerCase().includes(needle)))},[state.records,status,query]);
  const pending=state.records.filter((record)=>record.status===REQUEST_CORRECTION_STATUS.PENDING).length;
  const approved=state.records.filter((record)=>record.status===REQUEST_CORRECTION_STATUS.APPROVED).length;
  return <section className="request-corrections-page">
    <header className="correction-page-head"><div><span>CONTROLLED DATA CORRECTION</span><h1>{state.capabilities.canReview?'Correction approvals':state.capabilities.canCreate?'Request correction':'Admin correction'}</h1><p>The department manager requests with evidence, the assigned PM approves or rejects, and Admin applies only an approved correction. Every step is recorded in the Audit Trail.</p></div><button type="button" className="secondary" onClick={load} disabled={state.loading}><RefreshCw className={state.loading?'spin':''} /> Refresh</button></header>
    <div className="correction-kpis"><div><span>Awaiting PM</span><b>{pending}</b></div><div><span>Ready for Admin</span><b>{approved}</b></div><div><span>Total corrections</span><b>{state.records.length}</b></div></div>
    {state.capabilities.canCreate&&<NewCorrectionForm requests={requests} token={token} onSaved={load} allowedTypes={state.capabilities.allowedTypes||[]} fieldOptions={state.fieldOptions||{}} />}
    <div className="correction-list-tools"><label><Search /><input type="search" data-smart-search value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search request, user, site, reason, or status" /></label></div>
    <div className="correction-list-head"><div className="mobile-tabs" role="tablist">{['Open',REQUEST_CORRECTION_STATUS.PENDING,REQUEST_CORRECTION_STATUS.APPROVED,REQUEST_CORRECTION_STATUS.REJECTED,REQUEST_CORRECTION_STATUS.APPLIED,REQUEST_CORRECTION_STATUS.DELETED,'All'].map((value)=><button type="button" key={value} className={status===value?'active':''} onClick={()=>setStatus(value)}>{value}</button>)}</div><span>{visible.length} shown</span></div>
    {state.error&&<div className="correction-notice error">{state.error}</div>}
    <div className="correction-list">{state.loading&&!state.records.length?<div className="correction-empty">Loading corrections…</div>:visible.length?visible.map((record)=><CorrectionCard key={record.id} record={record} capabilities={state.capabilities} fieldOptions={state.fieldOptions||{}} token={token} Modal={Dialog} onChanged={load} />):<div className="correction-empty"><ShieldCheck /><b>No corrections in this view</b><span>Approved and rejected decisions remain available in history.</span></div>}</div>
  </section>;
}
