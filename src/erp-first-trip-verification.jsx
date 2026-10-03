import {useEffect,useRef,useState} from 'react';

export function ErpFirstTripVerification({request,close,onSave,Modal,token,DateInput,TwelveHourTimeInput,maintenanceText}){
 const [evidence,setEvidence]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[reviewed,setReviewed]=useState(false),[saving,setSaving]=useState(false);
 const active=useRef(true),busy=useRef(false),saveLock=useRef(false),controller=useRef(null),formRef=useRef(null);
 async function fetchEvidence(){
  if(busy.current||saveLock.current)return;
  busy.current=true;setLoading(true);setReviewed(false);setEvidence(null);setError('');
  controller.current=new AbortController();
  try{
   const fields=formRef.current?new FormData(formRef.current):null;
   const response=await fetch(`/api/requests/${encodeURIComponent(request.ref)}/erp-first-trip`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({firstTripDate:fields?.get('firstTripDate'),firstTripTime:fields?.get('firstTripTime')}),signal:controller.current.signal});
   if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('ERP service did not return data. Please retry.');
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not fetch ERP log-book data.');
   if(active.current)setEvidence(body);
  }catch(e){if(active.current&&e.name!=='AbortError')setError(e.message);}
  finally{busy.current=false;if(active.current)setLoading(false);}
 }
 useEffect(()=>{active.current=true;fetchEvidence();const timer=setInterval(()=>{if(!saveLock.current)fetchEvidence();},600000);return()=>{active.current=false;controller.current?.abort();clearInterval(timer);};},[request.ref,token]);
 const record=evidence?.status==='ready'?evidence.record:null;
 return <Modal title={`Verify closed request ${request.ref}`} close={()=>{if(!saveLock.current)close();}}>
  <form ref={formRef} className="form" onChange={event=>{if(["firstTripDate","firstTripTime"].includes(event.target.name))setReviewed(false);}} onSubmit={async event=>{
   event.preventDefault();if(saveLock.current)return;
   if(!record||!reviewed||loading)return setError('Fetch ERP evidence and confirm your review first.');
   const form=new FormData(event.currentTarget);saveLock.current=true;setSaving(true);setError('');
   try{
    const firstTripDate=form.get('firstTripDate'),firstTripTime=form.get('firstTripTime');
    await onSave({firstTripDone:true,firstTripDate,firstTripTime,firstTripCardImage:evidence.image,closingMeterReadings:record.closingReadings,closingMeterReading:record.closingReadings[request.meterType||'HMR']||'',erpReviewed:true,erpSourceHash:evidence.sourceHash,firstTripRemark:String(form.get('firstTripRemark')||''),correctionReason:String(form.get('correctionReason')||'')});
   }catch(e){if(active.current){setError(e.message||'Verification failed.');setReviewed(false);}}
   finally{saveLock.current=false;if(active.current)setSaving(false);}
  }}>
   <p><b>{request.door}</b> · {request.site}<br/>Repair closed: {request.closedAt}</p>
   {maintenanceText}<p>ERP shift closing KMR/HMR and the generated log-book image are fetched automatically. No separate meter photograph is required. MIS confirmation remains mandatory.</p>
   <button type="button" onClick={fetchEvidence} disabled={loading||saving}>{loading?'Fetching ERP log book…':'Recheck ERP log book'}</button>
   <small>Rechecks every 10 minutes while this window is open. Reviewing new data requires confirmation again.</small>
   {evidence&&!record&&<p role="status">{evidence.message}</p>}
   {record&&<>
    <dl><dt>ERP document / shift</dt><dd>{record.documentNo} / {record.shift}</dd><dt>ERP log date</dt><dd>{record.logDate}</dd><dt>Shift closing KMR / HMR</dt><dd>{record.closingReadings.KMR??'N/A'} / {record.closingReadings.HMR??'N/A'}</dd></dl>
    <img className="trip-card-preview" style={{maxWidth:'100%',height:'auto'}} src={evidence.image} alt="Generated ERP shift log-book evidence"/>
    <label><input type="checkbox" checked={reviewed} disabled={saving} onChange={event=>setReviewed(event.target.checked)}/> I reviewed the ERP shift log, closing readings and post-repair operation and confirm MIS first-trip verification.</label>
   </>}
   <label>Actual first-trip date (IST)<DateInput name="firstTripDate" required/></label>
   <label>Actual first-trip time (IST)<TwelveHourTimeInput name="firstTripTime" includeSeconds required/></label>
   <small>ERP shift totals do not establish the exact trip time. Enter the actual post-repair first trip, then recheck ERP to fetch that shift.</small>
   {request.firstTripAt&&<label>Reason for correcting the existing first-trip time<textarea name="correctionReason" required maxLength={500}/></label>}
   <label>Verification remark (optional)<textarea name="firstTripRemark" maxLength={2000} defaultValue={request.firstTripRemark||''}/></label>
   {error&&<p role="alert" className="hierarchy-save-error">{error}</p>}
   <footer><button type="button" disabled={saving} onClick={()=>{if(!saveLock.current)close();}}>Cancel</button><button className="primary" disabled={!record||!reviewed||loading||saving}>{saving?'Verifying…':'Verify request'}</button></footer>
  </form>
 </Modal>;
}
