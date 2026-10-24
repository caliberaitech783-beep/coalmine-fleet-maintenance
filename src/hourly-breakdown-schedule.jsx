import React from 'react';
const timeLabel=value=>{
 if(!value)return 'Not configured';
 const [hour,minute]=value.split(':').map(Number);
 if(hour===24)return '12:00 AM (midnight)';
 return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;
};
const reportTimes=start=>{
 const [h,m,s=0]=start.split(':').map(Number),times=[];
 for(let at=h*3600+m*60+s+7200;at<=86400;at+=7200)times.push(timeLabel(`${String(Math.floor(at/3600)).padStart(2,'0')}:${String(Math.floor(at%3600/60)).padStart(2,'0')}`));
 return times.join(', ');
};
export default function HourlyBreakdownSchedule({sites=[]}){
 return <section className="panel" aria-label="Hourly Breakdown Report schedule" style={{padding:16,margin:'16px 0'}}>
  <h4>Hourly Breakdown Report</h4>
  <p role="status"><strong>Automatic Telegram PDF delivery.</strong> Sent daily to linked PMs, Managers and Directors for their permitted sites.</p>
  <p>Every 2 hours from each site's A shift / Shift 1 start, after the first complete two-hour block, until midnight IST. Closed Lalpeth is excluded. Missing or overlapping A shifts prevent delivery for that site.</p>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>Permitted site</th><th>A-shift start</th><th>Report times (IST)</th></tr></thead><tbody>{sites.length?sites.map(site=><tr key={site.site}><td>{site.site}</td><td>{timeLabel(site.startTime)}</td><td>{!site.startTime?site.warning:reportTimes(site.startTime)}</td></tr>):<tr><td colSpan="3">No permitted active sites are assigned to this account.</td></tr>}</tbody></table></div>
  <p>A 5 AM start sends at 7 AM, 9 AM and every two hours through 11 PM. A 4 AM start includes the final midnight report. A Telegram connection is required; delivery failures are recorded for review.</p>
 </section>;
}
