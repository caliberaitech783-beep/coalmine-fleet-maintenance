import React from 'react';
import {normalizeHourlyBreakdownSchedule} from '../hourly-breakdown-schedule.mjs';

const timeLabel=value=>{
 if(!value)return 'Not configured';
 const [hour,minute]=value.split(':').map(Number);
 return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;
};

export default function HourlyBreakdownSchedule({value,onChange,sites=[]}){
 const draft=normalizeHourlyBreakdownSchedule(value);
 const update=changes=>onChange(normalizeHourlyBreakdownSchedule({...draft,...changes}));
 return <section className="panel" aria-label="Hourly Breakdown Report schedule" style={{padding:16,margin:'16px 0'}}>
  <h4>Hourly Breakdown Report</h4>
  <p role="status"><strong>Sending paused.</strong> Save your preferences here; this does not start report generation or delivery.</p>
  <label><input type="checkbox" checked={draft.selected} onChange={event=>update({selected:event.target.checked})}/> Include Hourly Breakdown Report in my saved schedule</label>
  <p>Every 2 hours from each site's A shift / Shift 1 start. The first report follows the first complete 2 hours. Each report covers one two-hour block. Closed Lalpeth is excluded.</p>
  <div className="report-schedule-fields">
   <label><span>Last allowed report time (IST)</span><input type="time" max="23:00" value={draft.cutoffTime} onChange={event=>update({cutoffTime:event.target.value})}/></label>
  </div>
  <div role="group" aria-label="Hourly report days" style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day,index)=><label key={day}><input type="checkbox" checked={draft.weekdays.includes(index)} onChange={()=>update({weekdays:draft.weekdays.includes(index)?draft.weekdays.filter(value=>value!==index):[...draft.weekdays,index]})}/>{day}</label>)}</div>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>Permitted site</th><th>A-shift start</th><th>Report times (IST)</th></tr></thead><tbody>{sites.length?sites.map(site=><tr key={site.site}><td>{site.site}</td><td>{timeLabel(site.startTime)}</td><td>{site.warning||site.times.filter(time=>time.slice(0,5)<=draft.cutoffTime).map(timeLabel).join(', ')||'No complete window before cutoff'}</td></tr>):<tr><td colSpan="3">No permitted active sites are assigned to this account.</td></tr>}</tbody></table></div>
  <p>Recipients retain their existing consolidated-report site privileges. For a 4 AM start, the last regular slot before 11 PM is 10 PM.</p>
 </section>;
}
