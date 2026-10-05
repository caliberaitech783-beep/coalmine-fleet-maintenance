import React,{useState} from 'react';
export default function ReopenBreakdownForm({requests,onSave,close}){
  const [reference,setReference]=useState(''),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
  return <form onSubmit={async event=>{event.preventDefault();if(saving)return;setSaving(true);setError('');try{await onSave(reference,{reason});close();}catch(problem){setError(problem.message||'Could not reopen breakdown.');}finally{setSaving(false);}}}>
    <p>Correct a vehicle mistakenly made on road. The same request will return to maintenance. Verified cases, first trips, and newer vehicle requests require additional review.</p>
    <label>Closed request<select required disabled={saving} value={reference} onChange={event=>setReference(event.target.value)}><option value="">Select request</option>{requests.map(row=><option key={row.ref} value={row.ref}>{row.ref} · {row.door||row.equipment} · {row.site}</option>)}</select></label>
    <label>Correction reason<textarea required maxLength={500} disabled={saving} value={reason} onChange={event=>setReason(event.target.value)} /></label>
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving||!reference||!reason.trim()}>{saving?'Reopening…':'Confirm reopen breakdown'}</button>
  </form>;
}
