import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOemEmailWithAttachments} from '../oem-breakdown-email.mjs';
import {oemExtraSendDue} from '../oem-breakdown-email.mjs';
import {readFile} from 'node:fs/promises';
import {oemEmailDue,oemEmailRecipients,oemEmailRows,buildOemEmail,sendScheduledOemEmails,OEM_TRIAL_CC} from '../oem-breakdown-email.mjs';
const contact={email:'person@example.com',oem:'Scania',level:'Level 1',location:'Sasti 2',contact:'Engineer'};
test('extra batch opens only on October 5 at 7 PM IST and expires at midnight',()=>{
  assert.equal(oemExtraSendDue(new Date('2026-10-05T13:29:59Z')),false);
  assert.equal(oemExtraSendDue(new Date('2026-10-05T13:30:00Z')),true);
  assert.equal(oemExtraSendDue(new Date('2026-10-05T18:29:59Z')),true);
  assert.equal(oemExtraSendDue(new Date('2026-10-05T18:30:00Z')),false);
  assert.equal(oemExtraSendDue(new Date('2026-10-06T13:30:00Z')),false);
});
test('Volvo Trucks includes Volvo tippers but never excavators, loaders, closed or other-site cases',()=>{
  const recipient=oemEmailRecipients([{...contact,oem:'Volvo Trucks'}])[0];
  const equipment=[
    {door:'T1',make:'VOLVO',group:'VOLVO TIPPERS',currentLocation:'Sasti OC'},
    {door:'E1',make:'VOLVO',group:'EXCAVATOR',currentLocation:'Sasti OC'},
    {door:'P1',make:'VOLVO',group:'PAY LOADER',currentLocation:'Sasti OC'},
    {door:'T2',make:'VOLVO',group:'TIPPERS',currentLocation:'Jayant OC'},
    {door:'T3',make:'VOLVO TIPPERS',currentLocation:'Sasti OC'},
  ];
  const requests=equipment.map(asset=>({door:asset.door,site:asset.currentLocation,status:'Accepted',oemResponsibility:'OEM'}));
  assert.deepEqual(oemEmailRows({recipient,equipment,requests}).map(row=>row.door),['T1','T3']);
  assert.equal(oemEmailRows({recipient,equipment,requests:requests.map(row=>({...row,closedAt:'2026-10-05'}))}).length,0);
});
test('extra batch sends every level with active cases exactly once, with attachments, without changing regular cadence',async()=>{
  const claims=new Set(),messages=[];
  const client={release(){},async query(sql,args){
    if(sql.includes('pg_try'))return {rows:[{locked:true}]};
    if(sql.startsWith('SELECT activation'))return {rows:[{activation_date:'2026-10-04'}]};
    if(sql.startsWith('INSERT INTO oem_email_deliveries')){
      const id=args.slice(0,2).join('|');if(claims.has(id))return {rowCount:0};
      claims.add(id);return {rowCount:1};
    }
    return {rows:[],rowCount:1};
  }};
  const options={pool:{connect:async()=>client},loadData:async()=>({
    contacts:[...[1,2,3,4].map(level=>({...contact,level:`Level ${level}`,email:`l${level}@example.com`})),{...contact,oem:'No cases',email:'empty@example.com'}],
    equipment:[{door:'D1',make:'Scania',currentLocation:'Sasti OC'}],
    requests:[{ref:'ACTIVE-1',door:'D1',site:'Sasti OC',status:'Accepted',oemResponsibility:'OEM'}],
  }),mailer:{config:{user:'sender@example.com'},transporter:{sendMail:async message=>{messages.push(message);return {accepted:[message.to],messageId:'test'};}}}};
  await sendScheduledOemEmails({...options,now:new Date('2026-10-05T11:30:00Z')});
  assert.equal(messages.length,2); // Existing regular L1 behaviour, including empty reports, is unchanged.
  await sendScheduledOemEmails({...options,now:new Date('2026-10-05T13:29:59Z')});
  assert.equal(messages.length,2);
  await sendScheduledOemEmails({...options,now:new Date('2026-10-05T13:30:00Z')});
  assert.equal(messages.length,6);
  for(const message of messages.slice(2)){
    assert.match(message.subject,/Additional 7 PM/);assert.match(message.text,/ACTIVE-1/);
    assert.equal(message.attachments.length,2);assert.notEqual(message.to,'empty@example.com');
  }
  await sendScheduledOemEmails({...options,now:new Date('2026-10-05T14:00:00Z')});
  assert.equal(messages.length,6);
  await sendScheduledOemEmails({...options,now:new Date('2026-10-06T13:30:00Z')});
  assert.equal(messages.length,8); // Only regular L1 on the next day, no repeat extra batch.
});
test('PDF and real Excel attachments include every selected case and match website workbook styling',async()=>{
  const rows=Array.from({length:75},(_,i)=>({ref:`CASE-${i}`,door:`D${i}`,site:'Sasti OC',complaint:'Parts pending',start:'2026-10-05 10:00:00'}));
  const report=await buildOemEmailWithAttachments({recipient:oemEmailRecipients([contact])[0],rows,now:new Date('2026-10-05T11:30:00Z')});
  assert.equal(report.attachments.length,2);
  const [xlsx,pdf]=report.attachments;
  assert.equal(xlsx.content.subarray(0,2).toString(),'PK');
  assert.equal(pdf.content.subarray(0,5).toString(),'%PDF-');
  const xml=xlsx.content.toString();
  for(const row of rows)assert.ok(xml.includes(row.ref));
  assert.match(xml,/TableStyleLight15/);
  assert.match(xml,/FF000000/);
  const website=await readFile(new URL('../src/main.jsx',import.meta.url),'utf8');
  const shared=await readFile(new URL('../report-xlsx.mjs',import.meta.url),'utf8');
  const normalize=value=>value.replaceAll('\r\n','\n').trim();
  assert.equal(normalize(shared.slice(shared.indexOf('function escapeExportHtml'),shared.indexOf('\nexport {'))),normalize(website.slice(website.indexOf('function escapeExportHtml'),website.indexOf('function buildXlsxWorkbook('))));
});
test('IST 5PM and activation anchored 1/3/7/10 day schedule',()=>{
  for(const [level,days] of [['L1',1],['L2',3],['L3',7],['L4',10]]){
    assert.equal(oemEmailDue(level,'2026-10-05',new Date('2026-10-05T11:29:59Z')),false);
    assert.equal(oemEmailDue(level,'2026-10-05',new Date('2026-10-05T11:30:00Z')),true);
    const next=new Date('2026-10-05T11:30:00Z');next.setUTCDate(next.getUTCDate()+days);
    assert.equal(oemEmailDue(level,'2026-10-05',next),true);
    if(days>1)assert.equal(oemEmailDue(level,'2026-10-05',new Date('2026-10-06T11:30:00Z')),false);
  }
});
test('recipient validation and consolidation never broadens missing locations',()=>{
  const recipients=oemEmailRecipients([contact,{...contact,location:'Jayant OC'},{...contact,email:'bad'},{...contact,location:''},{...contact,level:'L9'}]);
  assert.equal(recipients.length,1);assert.equal(recipients[0].sites.length,2);
});
test('reports exclude closed, idle, NON OEM, other sites and OEMs',()=>{
  const recipient=oemEmailRecipients([contact])[0];
  const equipment=[{door:'D1',make:'Scania',currentLocation:'Sasti OC'},{door:'D2',make:'Volvo',currentLocation:'Sasti OC'},{door:'D3',make:'Scania',currentLocation:'Jayant OC'}];
  const base={door:'D1',site:'Sasti OC',status:'Accepted',oemResponsibility:'OEM',start:'2026-10-05 10:00:00'};
  const requests=[base,...['Closed','Idle','Ideal'].map(status=>({...base,status})),{...base,oemResponsibility:'NON OEM'},{...base,door:'D2'},{...base,door:'D3',site:'Jayant OC'},{...base,door:'UNKNOWN'}];
  assert.equal(oemEmailRows({recipient,equipment,requests}).length,1);
});
test('email escapes content, includes Shift first and full case details',()=>{
  const recipient=oemEmailRecipients([contact])[0];
  const report=buildOemEmail({recipient,now:new Date('2026-10-05T13:30:00Z'),rows:[{ref:'R1',requestShift:'Shift A',start:'2026-10-05 10:00:00',complaint:'<script>x</script>',dailyRemarks:[{remark:'Parts pending',delayedReason:'Spare parts'}]}]});
  assert.match(report.subject,/L1/);assert.match(report.html,/&lt;script&gt;/);assert.doesNotMatch(report.html,/<script>/);assert.match(report.text,/Shift \| Job Reference/);assert.match(report.text,/Parts pending/);assert.match(report.text,/0d 9h 0m/);
});
test('persistent claims prevent repeat delivery and release scheduler lock',async()=>{
  const claims=new Set();let sends=0,unlocks=0;
  const client={release(){},async query(sql,args){
    if(sql.includes('pg_try'))return {rows:[{locked:true}]};
    if(sql.startsWith('SELECT activation'))return {rows:[{activation_date:'2026-10-05'}]};
    if(sql.startsWith('INSERT INTO oem_email_deliveries')){const id=args.slice(0,2).join('|');if(claims.has(id))return {rowCount:0};claims.add(id);return {rowCount:1};}
    if(sql.includes('pg_advisory_unlock'))unlocks++;
    return {rows:[],rowCount:1};
  }};
  const options={pool:{connect:async()=>client},now:new Date('2026-10-05T13:30:00Z'),loadData:async()=>({contacts:[contact],requests:[],equipment:[]}),mailer:{config:{user:'sender@example.com'},transporter:{sendMail:async()=>{sends++;return {accepted:[contact.email],messageId:'test'};}}}};
  await sendScheduledOemEmails(options);await sendScheduledOemEmails(options);
  assert.equal(sends,1);assert.equal(unlocks,2);
});
test('missing mail configuration fails explicitly without loading or sending records',async()=>{
  let released=false;
  const client={release(){released=true;},async query(sql){return {rows:sql.includes('pg_try')?[{locked:true}]:sql.startsWith('SELECT activation')?[{activation_date:'2026-10-05'}]:[]};}};
  await assert.rejects(sendScheduledOemEmails({pool:{connect:async()=>client},now:new Date('2026-10-05T13:30:00Z'),mailer:{transporter:null},loadData:()=>assert.fail('must not load recipients')}),/SMTP is not configured/);
  assert.equal(released,true);
});
test('another scheduler holding the lock cannot send duplicate reports',async()=>{
  const result=await sendScheduledOemEmails({pool:{connect:async()=>({query:async()=>({rows:[{locked:false}]}),release(){}})},loadData:()=>assert.fail('lock required'),mailer:{transporter:null}});
  assert.deepEqual(result,{skipped:true});
});
test('only the first three reports globally get trial CC and sending confirmations, across restarts',async()=>{
  let used=0;const claims=new Set(),messages=[];
  const client={release(){},async query(sql,args){
    if(sql.includes('pg_try'))return {rows:[{locked:true}]};
    if(sql.startsWith('SELECT activation'))return {rows:[{activation_date:'2026-10-05'}]};
    if(sql.startsWith('INSERT INTO oem_email_deliveries')){const id=args.slice(0,2).join('|');if(claims.has(id))return {rows:[],rowCount:0};claims.add(id);return {rows:[],rowCount:1};}
    if(sql.startsWith('UPDATE oem_email_schedule SET trial_cc_used'))return {rows:used<3?[{trial_cc_used:++used}]:[]};
    return {rows:[],rowCount:1};
  }};
  const options={pool:{connect:async()=>client},loadData:async()=>({contacts:[contact],requests:[],equipment:[]}),mailer:{config:{user:'sender@example.com'},transporter:{sendMail:async message=>{messages.push(message);return {accepted:Array.isArray(message.to)?message.to:[message.to,...message.cc||[]],messageId:'test'};}}}};
  for(let day=5;day<=8;day++){
    const now=new Date(`2026-10-0${day}T11:30:00Z`);
    await sendScheduledOemEmails({...options,now});await sendScheduledOemEmails({...options,now});
  }
  const reports=messages.filter(message=>!message.subject.startsWith('Sending confirmation'));
  const confirmations=messages.filter(message=>message.subject.startsWith('Sending confirmation'));
  assert.equal(reports.length,4);assert.equal(confirmations.length,3);assert.equal(used,3);
  for(const message of messages)assert.equal(message.attachments.length,2);
  for(const report of reports.slice(0,3))assert.deepEqual(report.cc,OEM_TRIAL_CC);
  assert.equal(reports[3].cc,undefined);
  for(const confirmation of confirmations){assert.deepEqual(confirmation.to,OEM_TRIAL_CC);assert.match(confirmation.text,/not confirmation of inbox delivery/);}
});
