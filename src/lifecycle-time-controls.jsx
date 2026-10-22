import React,{useState} from 'react';
import {lifecycleClockValue} from './lifecycle-time-input.mjs';

function clockParts(value){
 if(!value)return {clock:'',period:'AM'};
 const [hour,minute]=value.split(':');
 return {clock:`${String(Number(hour)%12||12).padStart(2,'0')}:${minute}`,period:Number(hour)>=12?'PM':'AM'};
}

export default function LifecycleTimeControls({from='',to='',onApply}){
 const [draft,setDraft]=useState(()=>({from:clockParts(from),to:clockParts(to)}));
 const [error,setError]=useState('');
 const update=(bound,field,value)=>{setDraft(current=>({...current,[bound]:{...current[bound],[field]:value}}));setError('');};
 const apply=()=>{
  const start=lifecycleClockValue(draft.from.clock,draft.from.period),end=lifecycleClockValue(draft.to.clock,draft.to.period);
  if(start===null||end===null){setError('Enter a time such as 01:30 and choose AM or PM.');return;}
  setDraft({from:start?clockParts(start):draft.from,to:end?clockParts(end):draft.to});
  setError('');onApply(start,end);
 };
 return <div className="mine-lifecycle-time-fields" role="group" aria-label="Request lifecycle time filter">
  {['from','to'].map(bound=><label className="mine-lifecycle-time-field" key={bound}>
   <span>{bound==='from'?'From':'To'} time (IST)</span>
   <span className="mine-lifecycle-clock-pair">
    <input className="mine-lifecycle-clock" type="text" inputMode="text" aria-label={`Request lifecycle ${bound} time`} placeholder="hh:mm" maxLength={5} value={draft[bound].clock} onChange={event=>update(bound,'clock',event.target.value)} aria-invalid={Boolean(error)&&lifecycleClockValue(draft[bound].clock,draft[bound].period)===null}/>
    <select aria-label={`Request lifecycle ${bound} AM or PM`} value={draft[bound].period} onChange={event=>update(bound,'period',event.target.value)}><option>AM</option><option>PM</option></select>
   </span>
  </label>)}
  <button type="button" className="mine-lifecycle-time-apply" onClick={apply}>Apply</button>
  {error&&<small className="mine-lifecycle-time-error" role="alert">{error}</small>}
 </div>;
}
