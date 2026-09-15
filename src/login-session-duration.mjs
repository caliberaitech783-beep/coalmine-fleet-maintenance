export function sessionTimeSummary(sessions=[],from,to) {
  const lower=Date.parse(from),upper=Date.parse(to);
  const intervals=[];
  const durations=sessions.map(session=>{
    const start=Date.parse(session.createdAt),end=Date.parse(session.lastSeenAt);
    if(![lower,upper,start,end].every(Number.isFinite)||upper<lower||end<start)return null;
    const clippedStart=Math.max(lower,start),clippedEnd=Math.min(upper,end);
    if(clippedEnd<=clippedStart)return 0;
    intervals.push([clippedStart,clippedEnd]);
    return clippedEnd-clippedStart;
  });
  intervals.sort((a,b)=>a[0]-b[0]);
  let total=0,start=null,end=null;
  for(const [nextStart,nextEnd] of intervals){
    if(start===null){start=nextStart;end=nextEnd;}
    else if(nextStart<=end)end=Math.max(end,nextEnd);
    else{total+=end-start;start=nextStart;end=nextEnd;}
  }
  if(start!==null)total+=end-start;
  return {durations,total};
}

export function formatSessionDuration(milliseconds){
  if(milliseconds===null||!Number.isFinite(milliseconds))return 'Not recorded';
  const seconds=Math.floor(Math.max(0,milliseconds)/1000);
  return `${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s`;
}
