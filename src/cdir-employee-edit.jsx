import React,{useEffect,useRef,useState} from 'react';

export default function CdirEmployeeEdit({person,token,onClose,onSaved}){
  const [data,setData]=useState(null),[record,setRecord]=useState({}),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const lock=useRef(false);
  const dialog=useRef(null);
  useEffect(()=>{
    dialog.current?.focus();
    const controller=new AbortController();
    fetch(`/api/cdir/employees/${encodeURIComponent(person.recordId)}/edit`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load employee details.');if(!controller.signal.aborted){setData(body);setRecord(body.record);}})
      .catch(err=>{if(!controller.signal.aborted)setError(err.message);});
    return()=>controller.abort();
  },[person.recordId,token]);
  return <div className="cdir-drawer-backdrop"><aside ref={dialog} tabIndex={-1} className="cdir-profile-drawer" role="dialog" aria-modal="true" aria-label="Edit employee details" onKeyDown={event=>{
    if(event.key==='Escape'&&!lock.current)onClose();
    if(event.key==='Tab'){
      const focusable=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}>
    <header><div><h2>Edit employee details</h2><p>{person.name} · Employee ID: {data?.empId||person.empId||'Not recorded'}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Close employee editor">×</button></header>
    {error&&<p role="alert">{error}</p>}
    {!data&&!error&&<p role="status">Loading employee details…</p>}
    {data&&<form className="form" onSubmit={async event=>{
      event.preventDefault();if(lock.current)return;lock.current=true;setSaving(true);setError('');
      try{
        const response=await fetch(`/api/cdir/employees/${encodeURIComponent(person.recordId)}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({record,revision:data.revision})});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save employee details.');onSaved();
      }catch(err){setError(err.message);}finally{lock.current=false;setSaving(false);}
    }}>
      <fieldset disabled={saving} style={{border:0,padding:0}}><div className="formgrid">{data.fields.map(field=><label key={field.key}>{field.label}
        {field.options?<select value={record[field.key]||''} onChange={event=>setRecord(current=>({...current,[field.key]:event.target.value}))}>
          {[...new Set(['',...(field.options||[]),record[field.key]||''])].map(value=><option key={value} value={value}>{value||'Select / not recorded'}</option>)}
        </select>:<input type={field.type==='date'?'date':field.key==='email'?'email':'text'} maxLength={500} value={record[field.key]||''} onChange={event=>setRecord(current=>({...current,[field.key]:event.target.value}))}/>}
      </label>)}</div></fieldset>
      <p>Changes apply only when you save. Contact details are shared across placements with the same employee ID.</p>
      <footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?'Saving…':'Save changes'}</button></footer>
    </form>}
  </aside></div>;
}
