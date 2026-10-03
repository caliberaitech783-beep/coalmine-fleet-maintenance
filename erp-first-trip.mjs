import {createHash} from 'node:crypto';
import sharp from 'sharp';

const key=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const stamp=value=>Date.parse(String(value||'').replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(String(value))?'':'+05:30'));
export const erpTripFingerprint=request=>createHash('sha256').update(JSON.stringify([request.ref,request.door,request.site,request.closedAt,request.meterType,request.closingMeterReading,request.closingMeterReadings])).digest('hex');
export function logbookSql(kind){
 if(!['vehicle','equipment'].includes(kind))throw new Error('Invalid log-book source.');
 const table=kind+'logbook',date=table+'date',number=table+'no',start=kind==='vehicle'?'loadingtime':'starttime';
 return `SELECT l.tno AS log_id,l.${number} AS document_no,TO_CHAR(l.${date},'YYYY-MM-DD') AS log_date,
 l.equipmenttno AS equipment_id,e.equipmentid AS door_number,site.locationname AS site_name,l.shiftcode,
 s.shifttimefrom AS shift_from,s.shifttimeto AS shift_to,
 l.openingmeterreading AS opening_kmr,l.closingmeterreading AS closing_kmr,
 l.openingworkinghrs AS opening_hmr,l.closingworkinghrs AS closing_hmr,
 l.ismeteractive AS meter_active,
 (SELECT TO_CHAR(MIN(d.${start}),'YYYY-MM-DD HH24:MI:SS') FROM cmpl.${table}detail d
 WHERE d.tno=l.tno) AS first_operation
 FROM cmpl.${table} l JOIN cmpl.equipment e ON e.tno=l.equipmenttno
 JOIN cmpl.location site ON site.locationcode=l.locationcode JOIN cmpl.shift s ON s.shiftcode=l.shiftcode
 WHERE l.${date}>=TRUNC(TO_DATE(:closed_at,'YYYY-MM-DD HH24:MI:SS'))-1
 AND l.${date}<TRUNC(TO_DATE(:closed_at,'YYYY-MM-DD HH24:MI:SS'))+8
 AND REGEXP_REPLACE(UPPER(site.locationname),'[^A-Z0-9]','')=:site_key
 AND :door_key IN (REGEXP_REPLACE(UPPER(e.equipmentid),'[^A-Z0-9]',''),REGEXP_REPLACE(UPPER(e.dno),'[^A-Z0-9]',''))
 ORDER BY l.${date},l.shiftcode,l.tno`;
}
export function tripLookupBinds(request){
 if(!key(request.door)||!key(request.site)||!Number.isFinite(stamp(request.closedAt)))throw new Error('Door number, site and repair closing time are required.');
 return {door_key:key(request.door),site_key:key(request.site),closed_at:String(request.erpLookupAt||request.closedAt).replace('T',' ').slice(0,19)};
}
export function chooseShiftLog(request,rows,now=Date.now()){
 tripLookupBinds(request);const closed=stamp(request.closedAt);
 if(request.erpLookupAt&&!Number.isFinite(stamp(request.erpLookupAt)))throw new Error('Invalid trip lookup time.');
 const candidates=rows.map(row=>{
  const start=Number(row.SHIFT_FROM),end=Number(row.SHIFT_TO),midnight=stamp(row.LOG_DATE+' 00:00:00');
  if(!/^\d+$/.test(String(row.SHIFT_FROM))||!/^\d+$/.test(String(row.SHIFT_TO))||start>=86400||end>=86400)return null;
  return {...row,shiftStart:midnight+start*1000,shiftEnd:midnight+(end+(end<=start?86400:0))*1000};
 }).filter(row=>row&&row.shiftEnd>closed&&row.shiftEnd<=now)
 .filter(row=>!request.erpLookupAt||(row.shiftStart<=stamp(request.erpLookupAt)&&row.shiftEnd>stamp(request.erpLookupAt)))
 .sort((a,b)=>a.shiftEnd-b.shiftEnd);
 if(!candidates.length)return {status:'pending',message:'Awaiting a completed ERP shift ending after repair closure. Search covers 7 days from the selected trip date or repair closure.'};
 const row=candidates[0];
 if(candidates.filter(item=>item.shiftEnd===row.shiftEnd).length!==1)return {status:'review',message:'Multiple ERP logs match the first completed shift. Resolve duplicate records before verification.'};
 const readings={};const opening={};const repair={...request.closingMeterReadings};
 if(request.meterType&&request.closingMeterReading!==''&&request.closingMeterReading!=null)repair[request.meterType]=request.closingMeterReading;
 for(const meter of ['KMR','HMR']){
  const value=row['CLOSING_'+meter],initial=row['OPENING_'+meter];
  if(value!=null){if(!Number.isFinite(Number(value))||Number(value)<0)return {status:'review',message:`ERP closing ${meter} is invalid.`};readings[meter]=String(value);}
  if(initial!=null)opening[meter]=String(initial);
  if(repair[meter]!=null&&repair[meter]!==''&&value==null)return {status:'review',message:`ERP closing ${meter} is missing.`};
  if(value!=null&&((initial!=null&&Number(value)<Number(initial))||(repair[meter]!=null&&repair[meter]!==''&&Number(value)<Number(repair[meter]))))return {status:'review',message:`ERP closing ${meter} is below its opening or repair-closing reading. Review meter replacement/reset or correct the source record.`};
 }
 if(!readings[request.meterType||'HMR'])return {status:'review',message:'The required closing meter reading is missing from ERP.'};
 if(String(row.METER_ACTIVE||'').trim().toUpperCase()!=='YES')return {status:'review',message:'ERP meter is not marked active. MIS review is required.'};
 const record={source:row.source,logId:String(row.LOG_ID),documentNo:row.DOCUMENT_NO,logDate:row.LOG_DATE,shift:row.SHIFTCODE,door:request.door,site:request.site,equipmentId:String(row.EQUIPMENT_ID),shiftStart:new Date(row.shiftStart).toISOString(),shiftEnd:new Date(row.shiftEnd).toISOString(),firstOperation:row.FIRST_OPERATION,openingReadings:opening,closingReadings:readings};
 return {status:'ready',lookupAt:request.erpLookupAt||null,record,sourceHash:createHash('sha256').update(JSON.stringify(record)).digest('hex'),requestHash:erpTripFingerprint(request),repairReadings:repair,fetchedAt:new Date(now).toISOString()};
}
export async function erpTripImage(evidence,request){
 const r=evidence.record,escape=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const lines=[['BDMS reference',request.ref],['Door / site',`${r.door} / ${r.site}`],['ERP source',r.source],['Document / shift',`${r.documentNo} / ${r.shift}`],['Log-book date',r.logDate],['Shift end (IST)',new Date(r.shiftEnd).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})],['ERP operation date',String(r.firstOperation||'Not recorded').slice(0,10)],['Opening KMR / HMR',`${r.openingReadings.KMR??'N/A'} / ${r.openingReadings.HMR??'N/A'}`],['Closing KMR / HMR',`${r.closingReadings.KMR??'N/A'} / ${r.closingReadings.HMR??'N/A'}`],['Repair closing KMR / HMR',`${evidence.repairReadings.KMR??'N/A'} / ${evidence.repairReadings.HMR??'N/A'}`],['Fetched at (IST)',new Date(evidence.fetchedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})]];
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="850"><rect width="1200" height="850" fill="white"/><g font-family="sans-serif" fill="#222"><text x="40" y="55" font-size="30">IBOSS ERP — SHIFT LOG-BOOK EVIDENCE</text><text x="40" y="95" font-size="19">Generated from ERP data. Not a physical meter photograph.</text>${lines.map(([label,value],i)=>`<text x="40" y="${150+i*48}" font-size="20">${escape(label)}</text><text x="410" y="${150+i*48}" font-size="20">${escape(String(value).slice(0,66))}</text>`).join('')}<text x="40" y="730" font-size="18">Shift closing readings may include operation before repair closure. MIS confirmation required.</text><text x="40" y="775" font-size="15">Source fingerprint: ${evidence.sourceHash}</text></g></svg>`;
 return 'data:image/png;base64,'+(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64');
}
