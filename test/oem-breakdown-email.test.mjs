import test from 'node:test';
import assert from 'node:assert/strict';
import {oemEmailDue,oemEmailRecipients,oemEmailRows,buildOemEmail,sendScheduledOemEmails} from '../oem-breakdown-email.mjs';
const contact={email:'person@example.com',oem:'Scania',level:'Level 1',location:'Sasti 2',contact:'Engineer'};
test('IST 7PM and activation anchored 1/3/7/10 day schedule',()=>{
  for(const [level,days] of [['L1',1],['L2',3],['L3',7],['L4',10]]){
    assert.equal(oemEmailDue(level,'2026-10-05',new Date('2026-10-05T13:29:59Z')),false);
    assert.equal(oemEmailDue(level,'2026-10-05',new Date('2026-10-05T13:30:00Z')),true);
    const next=new Date('2026-10-05T13:30:00Z');next.setUTCDate(next.getUTCDate()+days);
    assert.equal(oemEmailDue(level,'2026-10-05',next),true);
    if(days>1)assert.equal(oemEmailDue(level,'2026-10-05',new Date('2026-10-06T13:30:00Z')),false);
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
