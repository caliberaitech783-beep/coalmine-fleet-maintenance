const valid=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
const shift=(day,n)=>{const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const hindiDays=['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'];
export const periodReportKinds=new Set(['summary','own','open','running','closed','firstTrip','mis','verified','updates','ageing','find','pending','idle','ticketClose','firstTripVerification','transfers','todayBd','dateBd','fleet']);
export function bdmsPeriodControls(language='en'){
 return language==='hi'?['आज','कल (बीता दिन)','पिछले 7 दिन','पिछले 30 दिन','तारीखें चुनें','दिन चुनें']:['Today','Yesterday','Last 7 days','Last 30 days','Choose dates','Choose day'];
}
export function bdmsPeriodControl(text){return /^(Today|Yesterday|Last (7|30) days|Choose dates|Choose day|आज|कल \(बीता दिन\)|पिछले (7|30) दिन|तारीखें चुनें|दिन चुनें|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|रविवार|सोमवार|मंगलवार|बुधवार|गुरुवार|शुक्रवार|शनिवार)$/i.test(String(text).trim())||/^\/(period|date)\b/i.test(String(text).trim());}
export function bdmsEffectiveReport(text,context={}){
 return bdmsPeriodControl(text)||/^(Back to results|सूची पर वापस)$/.test(text)?String(context.reportQuery||context.listQuery||'Site summary').slice(0,300):text;
}
export function bdmsResolvePeriod(value,today){
 if(!valid(today))throw new Error('Invalid reporting day');
 if(value?.preset==='yesterday')return {preset:'yesterday',from:shift(today,-1),to:shift(today,-1)};
 if(['7','30'].includes(value?.preset))return {preset:value.preset,from:shift(today,1-Number(value.preset)),to:today};
 if(value?.preset==='custom'&&valid(value.from)&&valid(value.to)&&value.from<=value.to&&value.to<=today)return {preset:'custom',from:value.from,to:value.to};
 return {preset:'today',from:today,to:today};
}
export function bdmsPeriodSelection(text,today){
 const input=String(text).trim();
 if(/^(Choose dates|तारीखें चुनें)$/i.test(input))return {prompt:'dates'};
 if(/^(Choose day|दिन चुनें)$/i.test(input))return {prompt:'day'};
 if(/^(Today|आज)$/i.test(input))return {period:bdmsResolvePeriod({},today)};
 if(/^(Yesterday|कल \(बीता दिन\))$/i.test(input))return {period:bdmsResolvePeriod({preset:'yesterday'},today)};
 const days=input.match(/^(?:Last|पिछले) (7|30) (?:days|दिन)$/i);
 if(days)return {period:bdmsResolvePeriod({preset:days[1]},today)};
 const index=weekdays.findIndex((day,i)=>day.toLowerCase()===input.toLowerCase()||hindiDays[i]===input);
 if(index>=0){const date=shift(today,-((new Date(today+'T00:00:00Z').getUTCDay()-index+7)%7));return {period:bdmsResolvePeriod({preset:'custom',from:date,to:date},today)};}
 const match=input.match(/^\/(?:period|date)\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}-\d{2}-\d{2}))?$/i);
 if(match&&valid(match[1])&&valid(match[2]||match[1])&&match[1]<=(match[2]||match[1])&&(match[2]||match[1])<=today)return {period:{preset:'custom',from:match[1],to:match[2]||match[1]}};
 return {error:true};
}
export function bdmsPeriodHeading(period,language='en'){
 const fmt=day=>new Intl.DateTimeFormat(language==='hi'?'hi-IN':'en-IN',{timeZone:'Asia/Kolkata',weekday:'long',day:'2-digit',month:'short',year:'numeric'}).format(new Date(day+'T12:00:00Z'));
 return `${language==='hi'?'चुनी गई अवधि':'Selected period'}: ${fmt(period.from)}${period.to!==period.from?' → '+fmt(period.to):''} · IST`;
}
export function bdmsRecordDay(value){
 if(!value)return '';
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}(?:$|[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/.test(value))return valid(value.slice(0,10))?value.slice(0,10):'';
 const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(date):'';
}
export function bdmsPeriodRows(rows,period,dateFor){return rows.filter(row=>{const date=bdmsRecordDay(dateFor(row));return date&&date>=period.from&&date<=period.to;});}
export function bdmsRequestDateBasis(kind){
 if(kind==='closed')return {label:'Closure date',hi:'बंद करने की तारीख',date:r=>r.closedAt};
 if(kind==='verified')return {label:'MIS verification date',hi:'MIS सत्यापन तारीख',date:r=>r.verifiedAt};
 if(kind==='running')return {label:'Running BD date',hi:'रनिंग बी डी तारीख',date:r=>r.runningBdAt||r.start};
 if(kind==='idle')return {label:'Idle request date',hi:'आइडल अनुरोध तारीख',date:r=>r.idealRequestedAt||r.closedAt};
 if(['firstTrip','mis','firstTripVerification','pending'].includes(kind))return {label:'On-road / handoff date; current pending status',hi:'ऑन रोड / हैंडऑफ तारीख; वर्तमान लंबित स्थिति',date:r=>r.runningBdAt||r.closedAt||r.start};
 if(kind==='updates')return {label:'Latest repair update date',hi:'नवीनतम मरम्मत अपडेट तारीख',date:r=>r.dailyRemarks?.[0]?.createdAt||r.acceptedAt||r.start};
 return {label:'Request opening date; statuses are current',hi:'अनुरोध खोलने की तारीख; स्थिति वर्तमान है',date:r=>r.start};
}
export function bdmsWeekdayButtons(language){return language==='hi'?hindiDays:weekdays;}
