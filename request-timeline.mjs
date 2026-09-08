const sequence=['start','acceptedAt','closedAt','firstTripAt','verifiedAt'];
export const REQUEST_TIMELINE_FIELDS=[...sequence,'expectedCompletionAt','idealRequestedAt','idealApprovedAt','inProgressAt'];
const labels={start:'Production submission',acceptedAt:'Maintenance acceptance',closedAt:'Maintenance closure',firstTripAt:'First trip',verifiedAt:'MIS verification',expectedCompletionAt:'Expected completion (planned)',idealRequestedAt:'Idle requested',idealApprovedAt:'Manager on-road approval',inProgressAt:'Maintenance in progress'};

export function parseRequestTimelineTimestamp(value){
  if(value instanceof Date)return Number.isFinite(value.getTime())?new Date(value.getTime()):null;
  const match=String(value??'').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s*(?:·|Â·)\s*| )([0-2]\d):([0-5]\d)(?::([0-5]\d)(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if(!match)return null;
  const [,year,month,day,hour,minute,second='00',fraction='',zone='+05:30']=match;
  const calendar=new Date(0);calendar.setUTCFullYear(Number(year),Number(month)-1,Number(day));calendar.setUTCHours(Number(hour),Number(minute),Number(second),0);
  if(calendar.getUTCFullYear()!==Number(year)||calendar.getUTCMonth()!==Number(month)-1||calendar.getUTCDate()!==Number(day)||Number(hour)>23)return null;
  const parsed=new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zone}`);
  return Number.isFinite(parsed.getTime())?parsed:null;
}

const epoch=value=>parseRequestTimelineTimestamp(value)?.getTime()??null;
const error=(message,code='INVALID_REQUEST_TIMELINE')=>Object.assign(new Error(message),{status:400,code});
export function requestExpectedCompletionValue(before,value){
  const old=parseRequestTimelineTimestamp(before),next=parseRequestTimelineTimestamp(value);
  // Existing forms expose ETC to the minute. Resubmitting that displayed
  // minute must not erase legacy seconds or manufacture a correction.
  if(old&&next&&/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/.test(String(value).trim())&&Math.floor(old.getTime()/60000)===Math.floor(next.getTime()/60000))return old;
  return next;
}
export function validateRequestTimelineChange(before={},changes={}, {now=new Date(),userEntered=[]}={}){
  const next={...before,...changes};
  const changed=Object.keys(changes).filter(key=>REQUEST_TIMELINE_FIELDS.includes(key)&&epoch(before[key])!==epoch(changes[key]));
  for(const key of Object.keys(changes).filter(key=>REQUEST_TIMELINE_FIELDS.includes(key))){
    if(changes[key]!=null&&changes[key]!==''&&epoch(changes[key])===null)throw error(`Enter a valid ${labels[key].toLowerCase()} date and time.`);
  }
  const current=epoch(now);
  for(const key of changed){
    if(key!=='expectedCompletionAt'&&userEntered.includes(key)&&epoch(next[key])!==null&&epoch(next[key])>current)throw error(`${labels[key]} cannot be in the future.`);
  }
  // Only a pair involving a changed event is checked. Unrelated legacy
  // inconsistencies do not prevent an ETC, remark or other normal update.
  for(let left=0;left<sequence.length;left++)for(let right=left+1;right<sequence.length;right++){
    const earlier=sequence[left],later=sequence[right];
    if(!changed.includes(earlier)&&!changed.includes(later))continue;
    const start=epoch(next[earlier]),end=epoch(next[later]);
    if(start!==null&&end!==null&&start>end)throw error(`${labels[later]} cannot be before ${labels[earlier].toLowerCase()}.`);
  }
  return next;
}

export function buildRequestTimelineChanges(before={},after={}, {events=REQUEST_TIMELINE_FIELDS,sources={},now=new Date(),actorLogin='',actorName='',reason='',requireCorrectionReason=[]}={}){
  const history=[];
  for(const event of events){
    if(!REQUEST_TIMELINE_FIELDS.includes(event))continue;
    const oldAt=parseRequestTimelineTimestamp(before[event]),newAt=parseRequestTimelineTimestamp(after[event]);
    if((oldAt?.getTime()??null)===(newAt?.getTime()??null))continue;
    const correction=Boolean(oldAt);
    const remark=String(reason||'').trim();
    if(correction&&requireCorrectionReason.includes(event)&&!remark)throw error(`Explain why the existing ${labels[event].toLowerCase()} time is being changed.`,'TIMELINE_CORRECTION_REASON_REQUIRED');
    if(remark.length>500)throw error('Keep the timestamp correction reason within 500 characters.','TIMELINE_CORRECTION_REASON_REQUIRED');
    history.push({event,oldValue:oldAt?.toISOString()??null,newValue:newAt?.toISOString()??null,source:['system','user'].includes(sources[event])?sources[event]:'unknown',recordedAt:parseRequestTimelineTimestamp(now)?.toISOString()??null,actorLogin:String(actorLogin||''),actorName:String(actorName||''),reason:remark,correction});
  }
  return history;
}

export function requestTimelineDurations(request={}){
  const elapsed=(from,to)=>{
    const start=epoch(request[from]),end=epoch(request[to]);
    return start===null||end===null||end<start?null:end-start;
  };
  return {waiting:elapsed('start','acceptedAt'),maintenance:elapsed('acceptedAt','closedAt'),returnToWork:elapsed('closedAt','firstTripAt'),overall:elapsed('start','firstTripAt'),repairElapsed:elapsed('start','closedAt'),verificationLag:elapsed('firstTripAt','verifiedAt')};
}

export function formatTimelineDuration(milliseconds){
  if(milliseconds==null||!Number.isFinite(milliseconds)||milliseconds<0)return 'Not recorded';
  const seconds=Math.floor(milliseconds/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  return [days?`${days}d`:'',hours?`${hours}h`:'',minutes?`${minutes}m`:'',`${seconds%60}s`].filter(Boolean).join(' ');
}

export function requestTimelineEvents(request={},history=[]){
  return REQUEST_TIMELINE_FIELDS.map(event=>{
    const at=parseRequestTimelineTimestamp(request[event]);
    const recorded=[...history].reverse().find(item=>item.event===event&&epoch(item.newValue)===(at?.getTime()??null));
    const managerClosure=event==='closedAt'&&at&&epoch(request.idealApprovedAt)===at.getTime();
    return {event,label:managerClosure?'Manager on-road closure':labels[event],eventAt:at?.toISOString()??null,source:recorded?.source||'unknown',recordedAt:recorded?.recordedAt??null,actorLogin:recorded?.actorLogin||'',actorName:recorded?.actorName||'',reason:recorded?.reason||'',correction:recorded?.correction===true};
  });
}
