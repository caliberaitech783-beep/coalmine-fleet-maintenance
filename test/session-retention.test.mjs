import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {runSessionRetention} from '../session-retention.mjs';
function fixture({accepted=['anoop.p@cmll.in'],lastRun=null,saveFailure=false,mailFailure=false}={}){
 const events=[];
 const client={async query(sql,params){events.push(sql);
 if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
 if(sql.includes('SELECT value'))return {rows:lastRun?[{value:lastRun}]:[]};
 if(sql.startsWith('SELECT'))return {rows:[sql.includes('auth_sessions')?{session_public_id:'s1',login_name:'user'}:{session_id:'s1'}]};
 return {rows:[],rowCount:1};},release(){events.push('release');}};
 return {events,args:{pool:{connect:async()=>client},storageRoot:'backups',now:new Date('2026-10-21T12:00:00Z'),
 save:async(file,content)=>{if(saveFailure)throw Error('disk full');events.push('saved');const data=JSON.parse(gunzipSync(content));assert.equal(data.cutoff,'2026-10-14T12:00:00.000Z');assert.ok(!JSON.stringify(data).includes('token'));},
 mailer:()=>({config:{user:'sender@example.com'},transporter:{sendMail:async mail=>{events.push('email');assert.equal(mail.to,'anoop.p@cmll.in');if(mailFailure)throw Error('SMTP down');return {accepted};}}})}};
}
test('archive is saved and email accepted before transactional deletion',async()=>{
 const {events,args}=fixture();const result=await runSessionRetention(args);
 assert.equal(result.removed.auth_sessions,1);assert.ok(events.indexOf('saved')<events.indexOf('email'));
 assert.ok(events.indexOf('email')<events.indexOf('BEGIN'));assert.ok(events.includes('COMMIT'));
});
for(const options of [{accepted:[]},{saveFailure:true},{mailFailure:true}])test(`retains records on backup failure ${JSON.stringify(options)}`,async()=>{
 const {events,args}=fixture(options);await assert.rejects(runSessionRetention(args));assert.ok(!events.some(s=>s.startsWith('DELETE')));assert.equal(events.at(-1),'release');
});
test('five-day schedule survives process restarts',async()=>{
 const {events,args}=fixture({lastRun:'2026-10-18T12:00:00Z'});assert.equal((await runSessionRetention(args)).skipped,true);assert.ok(!events.includes('email'));
});
