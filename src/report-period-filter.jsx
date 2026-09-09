import React, {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Filter,ChevronLeft,ChevronRight,X,CalendarDays} from 'lucide-react';
import {PERIOD_PRESETS,indiaToday,presetDates,calendarDays,shiftMonth,displayDate,periodBounds,timeParts,timeFromParts} from './report-period-model.mjs';
import './report-period-filter.css';

function TimeField({label,value,onChange}) {
  const parts=timeParts(value);
  const change=(key,next)=>onChange(timeFromParts({...parts,[key]:next}));
  return <fieldset className="report-period-time"><legend>{label}</legend>
    <select aria-label={`${label} hour`} value={parts.hour} onChange={e=>change('hour',e.target.value)}>{Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(hour=><option key={hour}>{hour}</option>)}</select><span>:</span>
    <select aria-label={`${label} minute`} value={parts.minute} onChange={e=>change('minute',e.target.value)}>{Array.from({length:60},(_,i)=>String(i).padStart(2,'0')).map(minute=><option key={minute}>{minute}</option>)}</select>
    <select aria-label={`${label} AM or PM`} value={parts.period} onChange={e=>change('period',e.target.value)}><option>AM</option><option>PM</option></select>
  </fieldset>;
}
export function ReportPeriodDialog({from,to,onApply,onClose}) {
  const today=indiaToday(),id=useId(),dialog=useRef(null);
  const [start,setStart]=useState(from?.slice(0,10)||today),[end,setEnd]=useState(to?.slice(0,10)||today);
  const [startTime,setStartTime]=useState(from?.slice(11,16)||'00:00'),[endTime,setEndTime]=useState(to?.slice(11,16)||'23:59');
  const [month,setMonth]=useState((from||today).slice(0,7)),[preset,setPreset]=useState(''),[pickingEnd,setPickingEnd]=useState(false);
  const bounds=periodBounds(start,end,startTime,endTime);
  useEffect(()=>{
    const element=dialog.current,focus=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    element.showModal();
    return ()=>{element.close();document.body.style.overflow=overflow;if(focus?.isConnected)focus.focus();};
  },[]);
  function choosePreset(key) {
    const dates=presetDates(key,today);
    setStart(dates.start);setEnd(dates.end);setStartTime('00:00');setEndTime('23:59');setMonth(dates.start.slice(0,7));setPreset(key);setPickingEnd(false);
  }
  function chooseDate(date) {
    setPreset('');
    if (!pickingEnd) {setStart(date);setEnd('');setPickingEnd(true);}
    else {setStart(date<start?date:start);setEnd(date<start?start:date);setPickingEnd(false);}
  }
  const monthLabel=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
  return createPortal(<dialog ref={dialog} className="report-period-dialog" aria-labelledby={`${id}-title`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <form onSubmit={e=>{e.preventDefault();if(bounds)onApply(bounds.from,bounds.to);}}>
      <header><h2 id={`${id}-title`}>Filter</h2><button type="button" className="period-icon" aria-label="Close filter" onClick={onClose}><X size={20}/></button></header>
      <div className="report-period-body">
        <div className="report-period-summary"><span>Time Period · IST</span><strong>{displayDate(start)} – {displayDate(end)}<CalendarDays size={17}/></strong></div>
        <div className="report-period-presets" aria-label="Quick time periods">{PERIOD_PRESETS.map(([key,label])=><button type="button" key={key} aria-pressed={preset===key} onClick={()=>choosePreset(key)}>{label}</button>)}</div>
        <div className="report-period-month"><button type="button" className="period-icon" aria-label="Previous month" onClick={()=>setMonth(shiftMonth(month,-1))}><ChevronLeft size={19}/></button><strong aria-live="polite">{monthLabel}</strong><button type="button" className="period-icon" aria-label="Next month" onClick={()=>setMonth(shiftMonth(month,1))}><ChevronRight size={19}/></button></div>
        <div className="report-period-calendar" role="group" aria-label="Select start and end dates">
          {['Mo','Tu','We','Th','Fr','Sa','Su'].map(day=><span className="period-weekday" key={day}>{day}</span>)}
          {calendarDays(month).map((date,index)=>date?<button type="button" key={date} className={`${date>=start&&date<=end?'in-range ':''}${date===start||date===end?'range-edge ':''}${date===today?'today':''}`} aria-label={`${displayDate(date)}${date===start?', start date':''}${date===end?', end date':''}`} aria-pressed={date===start||date===end} aria-current={date===today?'date':undefined} onClick={()=>chooseDate(date)}>{Number(date.slice(-2))}</button>:<span key={`blank-${index}`} />)}
        </div>
        <p className="period-hint" aria-live="polite">{pickingEnd?'Choose the end date.':'Choose a preset or select a start and end date.'}</p>
        <div className="report-period-times">
          <div><TimeField label="Start time" value={startTime} onChange={value=>{setStartTime(value);setPreset('');}}/><label className="period-date">Start date<input aria-label="Start date" type="date" required value={start} onChange={e=>{setStart(e.target.value);if(e.target.value)setMonth(e.target.value.slice(0,7));setPreset('');setPickingEnd(false);}}/></label></div>
          <div><TimeField label="End time" value={endTime} onChange={value=>{setEndTime(value);setPreset('');}}/><label className="period-date">End date<input aria-label="End date" type="date" required value={end} onChange={e=>{setEnd(e.target.value);setPreset('');setPickingEnd(false);}}/></label></div>
        </div>
        {!bounds&&<p className="period-error" role="alert">Select both dates; the end must not be before the start.</p>}
      </div>
      <footer><button type="button" className="period-clear" onClick={()=>onApply('','')}>Clear</button><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="period-apply" disabled={!bounds}>Apply</button></footer>
    </form>
  </dialog>,document.body);
}
export default function ReportPeriodFilter({from,to,onApply}) {
  const [open,setOpen]=useState(false);
  const format=value=>value?`${displayDate(value.slice(0,10))} ${timeParts(value.slice(11,16)).hour}:${timeParts(value.slice(11,16)).minute} ${timeParts(value.slice(11,16)).period}`:'Any time';
  return <div className="report-period-filter"><button type="button" className="secondary" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Filter size={17}/>Filter</button><span aria-live="polite">{from||to?`${format(from)} – ${format(to)} (IST)`:'All dates'}</span>
    {open&&<ReportPeriodDialog from={from} to={to} onClose={()=>setOpen(false)} onApply={(start,end)=>{onApply(start,end);setOpen(false);}}/>}
  </div>;
}
