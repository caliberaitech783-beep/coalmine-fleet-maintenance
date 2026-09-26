const TIME_PATTERN=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const TWELVE_HOUR_TIME_PATTERN=/^(0?[1-9]|1[0-2]):(\d{2})(?::(\d{2}))?\s*([AP]M)$/i;
const ISO_DATE_PATTERN=/^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE_PATTERN=/^(\d{2})-(\d{2})-(\d{4})$/;

export const SHIFT_MASTER_DEFAULTS=[
  ['Dhoptala OB (2nd)','Shift A','05:00:00','13:00:00'],
  ['Dhoptala OB (2nd)','Shift B','13:00:00','21:00:00'],
  ['Dhoptala OB (2nd)','Shift C','21:00:00','05:00:00'],
  ['Dudhichua OB','Shift A','05:00:00','13:00:00'],
  ['Dudhichua OB','Shift B','13:00:00','21:00:00'],
  ['Dudhichua OB','Shift C','21:00:00','05:00:00'],
  ['Gauri Pauni OB (2nd)','Shift A','05:00:00','13:00:00'],
  ['Gauri Pauni OB (2nd)','Shift B','13:00:00','21:00:00'],
  ['Gauri Pauni OB (2nd)','Shift C','21:00:00','05:00:00'],
  ['Jayant OB','Shift A','04:00:00','12:00:00'],
  ['Jayant OB','Shift B','12:00:00','20:00:00'],
  ['Jayant OB','Shift C','20:00:00','04:00:00'],
  ['Majri OB','Shift A','05:00:00','13:00:00'],
  ['Majri OB','Shift B','13:00:00','21:00:00'],
  ['Majri OB','Shift C','21:00:00','05:00:00'],
  ['Sasti OB','Shift A','05:00:00','13:00:00'],
  ['Sasti OB','Shift B','13:00:00','21:00:00'],
  ['Sasti OB','Shift C','21:00:00','05:00:00'],
].map(([site,shiftName,startTime,endTime])=>({site,shiftName,startTime,endTime}));

function normalizeTime(value,label){
  const text=String(value||'').trim();
  const twelveHour=text.match(TWELVE_HOUR_TIME_PATTERN);
  const match=twelveHour||text.match(TIME_PATTERN);
  if(!match)throw new Error(`${label} must be a valid time such as 07:00 PM.`);
  let hour=Number(match[1]);
  if(twelveHour){hour%=12;if(match[4].toUpperCase()==='PM')hour+=12;}
  const minute=Number(match[2]),second=Number(match[3]||0);
  if(hour>23||minute>59||second>59)throw new Error(`${label} is not a valid time.`);
  return [hour,minute,second].map((part)=>String(part).padStart(2,'0')).join(':');
}

function normalizeDate(value,label){
  const text=String(value||'').trim();
  if(!text)return '';
  let year,month,day;
  let match=text.match(ISO_DATE_PATTERN);
  if(match)[,year,month,day]=match;
  else{
    match=text.match(DISPLAY_DATE_PATTERN);
    if(!match)throw new Error(`${label} must use DD-MM-YYYY.`);
    [,day,month,year]=match;
  }
  const candidate=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));
  if(candidate.getUTCFullYear()!==Number(year)||candidate.getUTCMonth()!==Number(month)-1||candidate.getUTCDate()!==Number(day))
    throw new Error(`${label} is not a valid date.`);
  return `${year}-${month}-${day}`;
}

function defaultShiftCode(shiftName){
  const suffix=String(shiftName||'').trim().match(/(?:shift\s*)?([a-z0-9]+)$/i)?.[1]||'';
  return suffix.toUpperCase();
}

export function normalizeShiftRecord(record={}){
  const site=String(record.site||record.siteName||'').trim();
  const shiftName=String(record.shiftName||record.shift||'').trim();
  if(!site)throw new Error('Site Name is required.');
  if(!shiftName)throw new Error('Shift is required.');
  const startTime=normalizeTime(record.startTime||record.start,'Start');
  const endTime=normalizeTime(record.endTime||record.end,'End');
  const shiftCode=String(record.shiftCode||defaultShiftCode(shiftName)).trim().toUpperCase();
  if(!shiftCode)throw new Error('Shift Code is required.');
  const effectiveFrom=normalizeDate(record.effectiveFrom,'Effective From');
  const effectiveTo=normalizeDate(record.effectiveTo,'Effective To');
  if(effectiveFrom&&effectiveTo&&effectiveTo<effectiveFrom)
    throw new Error('Effective To cannot be before Effective From.');
  const status=String(record.status||'Active').trim().toLowerCase()==='inactive'?'Inactive':'Active';
  return {
    site,
    shiftName,
    shiftCode,
    startTime,
    endTime,
    effectiveFrom,
    effectiveTo,
    status,
    remarks:String(record.remarks||'').trim(),
  };
}

export function shiftIdentity(record={}){
  return `${String(record.site||'').trim().toLowerCase()}|${String(record.shiftCode||defaultShiftCode(record.shiftName)).trim().toLowerCase()}`;
}

export function shiftDurationMinutes(record={}){
  const toSeconds=(value)=>{
    const match=String(value||'').trim().match(TIME_PATTERN);
    return match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]||0):NaN;
  };
  const start=toSeconds(record.startTime||record.start),end=toSeconds(record.endTime||record.end);
  if(!Number.isFinite(start)||!Number.isFinite(end))return null;
  const duration=(end-start+86400)%86400;
  return duration===0?1440:duration/60;
}
