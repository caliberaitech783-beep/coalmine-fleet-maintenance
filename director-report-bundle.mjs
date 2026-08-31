import {equipmentRoadStatus} from './dashboard-equipment-metrics.mjs';
import {elapsedLabel,elapsedMilliseconds} from './report-metrics.mjs';

export const DIRECTOR_REPORT_HOUR=19;
export const DIRECTOR_REPORT_TITLES=[
  'Location wise Open BD report with Category (Prod)',
  'Location wise Closing BD report with Category (Maint.)',
  'MIS Verification Report (MIS)',
  'Report for On Road / Off Road & Idle',
  'Vehicle Transfer Report',
  'Total Equipment / Vehicle Location Wise',
  'Idle Vehicle Report',
  'Recent Breakdown Cases',
  'Off Road to MIS Verift Report - Time taken from Prod to MIS Veri.',
  'Event Open Report - Prod. Open with Maint. Close Time -- TAT',
  'Event close Report - Maint. Closing to MIS Verif.',
  'Idle Time with PM Verification Time',
  'Idle Verification v/s MIS First Trip verification',
];

const INDIA_OFFSET_MS=330*60*1000;
const clean=(value)=>String(value??'').trim();
const cell=(value)=>clean(value)||'-';
const safeFilePart=(value)=>clean(value).toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,80)||'report';
const escapeXml=(value)=>String(value??'').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));
const WHATSAPP_REPORT_LABELS=new Map([
  ['Location wise Open BD report with Category (Prod)','Loc. wise Open BD'],
  ['Location wise Closing BD report with Category (Maint.)','Loc. wise Closing BD'],
  ['MIS Verification Report (MIS)','MIS Verification'],
  ['Report for On Road / Off Road & Idle','Road Status: On / Off / Idle'],
  ['Vehicle Transfer Report','Vehicle Transfer'],
  ['Total Equipment / Vehicle Location Wise','Equipment / Vehicle Location'],
  ['Idle Vehicle Report','Idle Vehicle'],
  ['Recent Breakdown Cases','Recent Breakdown'],
  ['Off Road to MIS Verift Report - Time taken from Prod to MIS Veri.','Off Road to MIS Verification'],
  ['Event Open Report - Prod. Open with Maint. Close Time -- TAT','Event Open TAT'],
  ['Event close Report - Maint. Closing to MIS Verif.','Event Close to MIS'],
  ['Idle Time with PM Verification Time','Idle Time with PM Verification'],
  ['Idle Verification v/s MIS First Trip verification','Idle vs MIS First Trip'],
]);

function indiaParts(date){
  const shifted=new Date(date.getTime()+INDIA_OFFSET_MS);
  return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth(),day:shifted.getUTCDate(),hour:shifted.getUTCHours()};
}

function indiaDate({year,month,day},hour){return new Date(Date.UTC(year,month,day,hour)-INDIA_OFFSET_MS)}

export function directorReportWindow(now=new Date()){
  const local=indiaParts(now);
  let day={year:local.year,month:local.month,day:local.day};
  if(local.hour<DIRECTOR_REPORT_HOUR){
    const previous=new Date(Date.UTC(local.year,local.month,local.day)-86400000);
    day={year:previous.getUTCFullYear(),month:previous.getUTCMonth(),day:previous.getUTCDate()};
  }
  const start=indiaDate(day,0);
  const end=indiaDate(day,DIRECTOR_REPORT_HOUR);
  const slotKey=`${day.year}-${String(day.month+1).padStart(2,'0')}-${String(day.day).padStart(2,'0')}-director-19`;
  return {start,end,endHour:DIRECTOR_REPORT_HOUR,slotKey};
}

export function directorReportDue(now=new Date(),graceMinutes=20){
  const window=directorReportWindow(now);
  const delay=now.getTime()-window.end.getTime();
  return delay>=0&&delay<=graceMinutes*60*1000;
}

function roadStatusLabel(record){
  const status=equipmentRoadStatus(record);
  return status==='onroad'?'On road':status==='offroad'?'Off road':status==='idle'?'Idle':'Status not set';
}

function locationCountRows(records=[]){
  const groups=new Map();
  for(const record of records){
    const location=clean(record.currentLocation||record.location)||'Not assigned';
    const type=['vehicle','vehicles'].includes(clean(record.category).toLowerCase())?'vehicles':'equipment';
    const current=groups.get(location)||{location,equipment:0,vehicles:0,total:0};
    current[type]+=1;
    current.total+=1;
    groups.set(location,current);
  }
  return [...groups.values()].sort((a,b)=>a.location.localeCompare(b.location));
}

function firstTripTimestamp(request){
  return clean(request.firstTripAt)||[request.firstTripDate,request.firstTripTime].map(clean).filter(Boolean).join(' ');
}

function latestTime(request){
  return Date.parse(String(request.start||request.closedAt||request.verifiedAt||0).replace(' ','T'))||0;
}

function enrichRequests(requests=[],equipmentRecords=[]){
  const byReference=new Map();
  const add=(value,record)=>{
    const key=clean(value).toLowerCase();
    if(!key)return;
    if(!byReference.has(key))byReference.set(key,record);
    else if(byReference.get(key)!==record)byReference.set(key,null);
  };
  for(const record of equipmentRecords)[record.manufacturerSerialNo,record.chassisNo,record.door,record.reg,record.equipmentName].forEach((value)=>add(value,record));
  return requests.map((request)=>{
    const equipment=[request.chassis,request.door,request.reg,request.equipment].map((value)=>byReference.get(clean(value).toLowerCase())).find(Boolean)||{};
    return {
      ...request,
      reportEquipment:request.equipment||request.door||equipment.equipmentName||'',
      reportDoor:request.door||equipment.door||'',
      reportMake:request.make||equipment.make||'',
      reportModel:request.model||equipment.model||'',
      reportSite:request.site||equipment.currentLocation||equipment.location||'',
    };
  });
}

function table(title,department,description,columns,rows){
  return {title,department,description,columns,rows:rows.map((row)=>columns.map((column)=>cell(typeof column.value==='function'?column.value(row):row[column.key])))};
}

export function buildDirectorReportTables({requests=[],equipmentRecords=[],transferRecords=[]}={}){
  const reportRequests=enrichRequests(requests,equipmentRecords);
  const openBreakdownRows=reportRequests.filter((request)=>clean(request.status).toLowerCase()!=='closed');
  const closedBreakdownRows=reportRequests.filter((request)=>clean(request.closedAt)||clean(request.status).toLowerCase()==='closed');
  const misVerificationRows=reportRequests.filter((request)=>clean(request.verifiedAt)||clean(request.verifiedBy));
  const idleRequestRows=reportRequests.filter((request)=>clean(request.status).toLowerCase()==='idle'||clean(request.idleReason));
  const elapsedRows=reportRequests.filter((request)=>request.start||request.closedAt||request.verifiedAt);
  const fleetStatusRows=equipmentRecords.map((record,index)=>({
    ...record,reportId:record.id||`${record.equipmentName||record.door||'equipment'}-${index}`,
    reportEquipment:record.equipmentName||record.equipment||record.door||'',reportDoor:record.door||'',
    reportMake:record.make||'',reportModel:record.model||record.modelNo||'',reportSite:record.currentLocation||record.location||'',reportRoadStatus:roadStatusLabel(record),
  }));
  const transferRows=transferRecords.map((record,index)=>({...record,reportId:record.id||`${record.transferNo||'transfer'}-${index}`,reportEquipment:record.equipment||record.equipmentName||record.door||'',reportSite:record.destination||record.currentLocation||record.location||''}));
  const locationWiseRows=locationCountRows(equipmentRecords);
  const recentBreakdownRows=[...reportRequests].sort((a,b)=>latestTime(b)-latestTime(a)).slice(0,250);
  const requestColumns=[
    {key:'reference',label:'Job reference',value:(request)=>request.ref||request.reference},
    {key:'equipment',label:'Equipment / vehicle',value:(request)=>request.reportEquipment},
    {key:'door',label:'Door no.',value:(request)=>request.reportDoor},
    {key:'make',label:'Make',value:(request)=>request.reportMake},
    {key:'model',label:'Model',value:(request)=>request.reportModel},
    {key:'site',label:'Location',value:(request)=>request.reportSite},
    {key:'category',label:'Category',value:(request)=>request.equipmentGroup||request.category||request.type},
    {key:'status',label:'Status',value:(request)=>clean(request.status)||'Open'},
    {key:'createdBy',label:'Production user',value:(request)=>request.owner||request.requesterLogin},
    {key:'started',label:'Opened at',value:(request)=>request.start},
  ];
  const closureColumns=[...requestColumns,{key:'closedBy',label:'Maintenance user',value:(request)=>request.closedBy},{key:'closedAt',label:'Closed at',value:(request)=>request.closedAt}];
  const misColumns=[...closureColumns,{key:'verifiedBy',label:'MIS user',value:(request)=>request.verifiedBy},{key:'verifiedAt',label:'MIS verified at',value:(request)=>request.verifiedAt}];
  const fleetColumns=[
    {key:'equipment',label:'Equipment / vehicle',value:(record)=>record.reportEquipment},
    {key:'door',label:'Door no.',value:(record)=>record.reportDoor},
    {key:'category',label:'Category',value:(record)=>record.category||record.group||record.itemName},
    {key:'make',label:'Make',value:(record)=>record.reportMake},
    {key:'model',label:'Model',value:(record)=>record.reportModel},
    {key:'location',label:'Location',value:(record)=>record.reportSite},
    {key:'roadStatus',label:'Road status',value:(record)=>record.reportRoadStatus},
    {key:'serial',label:'Serial / chassis no.',value:(record)=>record.manufacturerSerialNo||record.chassisNo},
  ];
  const transferColumns=[
    {key:'transferNo',label:'Transfer no.',value:(record)=>record.transferNo},
    {key:'transferDate',label:'Transfer date',value:(record)=>record.transferDate},
    {key:'equipment',label:'Equipment / vehicle',value:(record)=>record.reportEquipment},
    {key:'from',label:'From location',value:(record)=>record.source},
    {key:'to',label:'To location',value:(record)=>record.destination},
    {key:'model',label:'Model',value:(record)=>record.modelNo||record.model},
    {key:'driver',label:'Driver',value:(record)=>record.driver},
    {key:'chassis',label:'Chassis no.',value:(record)=>record.chassisNo||record.manufacturerSerialNo},
  ];
  return [
    table(DIRECTOR_REPORT_TITLES[0],'General','Open production breakdown cases grouped with location and category details.',requestColumns,openBreakdownRows),
    table(DIRECTOR_REPORT_TITLES[1],'General','Closed maintenance breakdown cases with location, category, closure user, and closure time.',closureColumns,closedBreakdownRows),
    table(DIRECTOR_REPORT_TITLES[2],'General','Requests verified by MIS, including maintenance close and MIS verification timestamps.',misColumns,misVerificationRows),
    table(DIRECTOR_REPORT_TITLES[3],'General','Current road status of equipment and vehicles from the Equipment Master.',fleetColumns,fleetStatusRows),
    table(DIRECTOR_REPORT_TITLES[4],'General','Vehicle transfer history with source, destination, equipment, model, driver, and chassis details.',transferColumns,transferRows),
    table(DIRECTOR_REPORT_TITLES[5],'General','Location-wise count of equipment, vehicles, and total fleet records.',[
      {key:'location',label:'Location',value:(row)=>row.location},{key:'equipment',label:'Equipment',value:(row)=>row.equipment},{key:'vehicles',label:'Vehicles',value:(row)=>row.vehicles},{key:'total',label:'Total equipment / vehicle',value:(row)=>row.total},
    ],locationWiseRows),
    table(DIRECTOR_REPORT_TITLES[6],'General','Idle breakdown requests and idle fleet records that need follow-up.',[...requestColumns,{key:'idleReason',label:'Idle reason',value:(request)=>request.idleReason},{key:'closedAt',label:'Maintenance close / idle at',value:(request)=>request.closedAt}],idleRequestRows),
    table(DIRECTOR_REPORT_TITLES[7],'General','Latest breakdown cases by recorded workflow timestamp.',closureColumns,recentBreakdownRows),
    table(DIRECTOR_REPORT_TITLES[8],'Production','Elapsed time from Production off-road marking to MIS verification.',[...misColumns,{key:'prodToMis',label:'Prod to MIS verification',value:(request)=>elapsedLabel(request.start,request.verifiedAt)}],elapsedRows.filter((row)=>row.start&&row.verifiedAt)),
    table(DIRECTOR_REPORT_TITLES[9],'Maintenance','Turnaround time from Production opening to Maintenance close.',[...closureColumns,{key:'tat',label:'TAT',value:(request)=>elapsedLabel(request.start,request.closedAt)}],elapsedRows.filter((row)=>row.start&&row.closedAt)),
    table(DIRECTOR_REPORT_TITLES[10],'Maintenance','Elapsed time from Maintenance close to MIS verification.',[...misColumns,{key:'maintToMis',label:'Maintenance close to MIS verification',value:(request)=>elapsedLabel(request.closedAt,request.verifiedAt)}],elapsedRows.filter((row)=>row.closedAt&&row.verifiedAt)),
    table(DIRECTOR_REPORT_TITLES[11],'Maintenance','Idle cases with maintenance idle time and verification timestamp.',[...misColumns,{key:'idleReason',label:'Idle reason',value:(request)=>request.idleReason},{key:'idleTime',label:'Idle to PM verification time',value:(request)=>elapsedLabel(request.closedAt||request.start,request.verifiedAt)}],idleRequestRows),
    table(DIRECTOR_REPORT_TITLES[12],'Maintenance','Comparison of MIS verification against first-trip confirmation for idle cases.',[...misColumns,{key:'firstTripDone',label:'First trip done',value:(request)=>request.firstTripDone?'Yes':'No'},{key:'firstTrip',label:'First trip verification',value:firstTripTimestamp},{key:'misToFirstTrip',label:'MIS to first trip',value:(request)=>elapsedLabel(request.verifiedAt,firstTripTimestamp(request))}],idleRequestRows.filter((row)=>row.verifiedAt||firstTripTimestamp(row))),
  ];
}

function crc32(bytes){
  let crc=-1;
  for(const byte of bytes)crc=(crc>>>8)^crc32.table[(crc^byte)&0xff];
  return (crc^-1)>>>0;
}
crc32.table=Array.from({length:256},(_,index)=>{
  let value=index;
  for(let bit=0;bit<8;bit+=1)value=value&1?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
const uint16=(value)=>Buffer.from([value&0xff,(value>>>8)&0xff]);
const uint32=(value)=>Buffer.from([value&0xff,(value>>>8)&0xff,(value>>>16)&0xff,(value>>>24)&0xff]);

function zipStoredFiles(files){
  const chunks=[],centralDirectory=[];
  let offset=0;
  for(const {name,content} of files){
    const filename=Buffer.from(name);
    const data=Buffer.from(content);
    const checksum=crc32(data);
    const localHeader=Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),uint16(20),uint16(0),uint16(0),uint16(0),uint16(0),uint32(checksum),uint32(data.length),uint32(data.length),uint16(filename.length),uint16(0)]);
    chunks.push(localHeader,filename,data);
    centralDirectory.push({filename,checksum,size:data.length,offset});
    offset+=localHeader.length+filename.length+data.length;
  }
  const centralStart=offset;
  for(const entry of centralDirectory){
    const header=Buffer.concat([Buffer.from([0x50,0x4b,0x01,0x02]),uint16(20),uint16(20),uint16(0),uint16(0),uint16(0),uint16(0),uint32(entry.checksum),uint32(entry.size),uint32(entry.size),uint16(entry.filename.length),uint16(0),uint16(0),uint16(0),uint16(0),uint32(0),uint32(entry.offset)]);
    chunks.push(header,entry.filename);
    offset+=header.length+entry.filename.length;
  }
  chunks.push(Buffer.concat([Buffer.from([0x50,0x4b,0x05,0x06]),uint16(0),uint16(0),uint16(files.length),uint16(files.length),uint32(offset-centralStart),uint32(centralStart),uint16(0)]));
  return Buffer.concat(chunks);
}

function excelCellReference(columnIndex,rowIndex){
  let column='',value=columnIndex+1;
  while(value){value-=1;column=String.fromCharCode(65+(value%26))+column;value=Math.floor(value/26)}
  return `${column}${rowIndex+1}`;
}

export function buildXlsxWorkbookBuffer(title,columns=[],rows=[]){
  const headings=columns.map((column)=>column.label||column.key||'Column');
  const worksheetRows=[headings,...rows];
  const sheetData=worksheetRows.map((row,rowIndex)=>`<row r="${rowIndex+1}">${row.map((value,columnIndex)=>`<c r="${excelCellReference(columnIndex,rowIndex)}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`).join('')}</row>`).join('');
  const widths=headings.map((label,index)=>{
    const maxLength=Math.max(String(label||'').length,...rows.map((row)=>String(row[index]||'').length));
    return `<col min="${index+1}" max="${index+1}" width="${Math.min(48,Math.max(12,maxLength+2))}" customWidth="1"/>`;
  }).join('');
  const workbookTitle=escapeXml(title||'Nerve Center report');
  return zipStoredFiles([
    {name:'[Content_Types].xml',content:'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'},
    {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'},
    {name:'docProps/core.xml',content:`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${workbookTitle}</dc:title><dc:creator>Nerve Center</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`},
    {name:'docProps/app.xml',content:'<?xml version="1.0" encoding="UTF-8"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Nerve Center</Application></Properties>'},
    {name:'xl/_rels/workbook.xml.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
    {name:'xl/workbook.xml',content:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/worksheets/sheet1.xml',content:`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${sheetData}</sheetData></worksheet>`},
  ]);
}

export function directorReportFilename(title,extension,slotKey){
  return `director-${safeFilePart(title)}-${slotKey}.${extension}`;
}

export function buildDirectorWhatsAppMessage({generatedAt=new Date(),links=[]}={}){
  const byDepartment=links.reduce((groups,link)=>{
    const department=link.department||'General';
    if(!groups.has(department))groups.set(department,[]);
    groups.get(department).push(link);
    return groups;
  },new Map());
  const generated=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).format(generatedAt);
  const lines=['▣ Nerve Center',"Director's Daily Report",'Schedule: Daily 7:00 PM IST',`Generated: ${generated}`,'','Department Wise Report Links:'];
  for(const [department,items] of byDepartment){
    lines.push('',`${department} --`);
    items.forEach((item,index)=>{
      const title=WHATSAPP_REPORT_LABELS.get(item.title)||item.title;
      lines.push('',`${index+1}. ${title}`,'PDF 📄',item.pdfUrl,'Excel 📊',item.xlsxUrl);
    });
  }
  return lines.join('\n').slice(0,4096);
}
