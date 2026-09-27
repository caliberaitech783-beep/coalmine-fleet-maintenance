import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as policy from '../request-correction-policy.mjs';
import * as returns from '../request-correction-return.mjs';
import {validateRequestTimelineChange} from '../request-timeline.mjs';

const STATUS=policy.REQUEST_CORRECTION_STATUS;
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
const returned={id:7,status:STATUS.RETURNED,requestedByLogin:' Owner ',correctionType:'onRoad'};
test('only the original requester gains edit and delete on returned cases',()=>{
  assert.equal(policy.canManagePendingCorrection(returned,{login:'owner'}),true);
  assert.equal(policy.canDeletePendingCorrection(returned,{login:'owner'}),true);
  for(const context of [{login:'other',requester:true,inScope:true,allowedTypes:['onRoad']},{login:'admin',administrator:true},{login:'pm',pm:true,inScope:true},{}]){
    assert.equal(policy.canManagePendingCorrection(returned,context),false);
    assert.equal(policy.canDeletePendingCorrection(returned,context),false);
  }
  assert.equal(policy.canDeletePendingCorrection({...returned,status:STATUS.PENDING},{login:'owner',requester:true}),false);
});
test('returned resubmission rejects the same invalid timeline, allows valid repair and caps timeline remarks',()=>{
  const source={start:'2026-09-11 07:00',closedAt:'2026-09-12 08:00',timelineRecordedAt:'2026-09-27 10:00'};
  assert.throws(()=>returns.validateReturnedCorrection(source,{closedAt:'2026-09-10 09:00'},'Fix closure'),/cannot be before production/);
  assert.doesNotThrow(()=>returns.validateReturnedCorrection(source,{closedAt:'2026-09-11 09:00'},'Fix closure'));
  assert.throws(()=>returns.validateReturnedCorrection(source,{closedAt:'2026-09-11 09:00'},'x'.repeat(501)),/500/);
  assert.equal(returns.correctionErrorIsActionable(new Error('database offline')),false);
});

const applySource=server.slice(server.indexOf("  app.patch('/api/request-corrections/:id/apply'"),server.indexOf('\n}\n\nasync function recordRequestTimeline'));
async function apply({invalid=true,stale=false,dbFailure=false,lateFailure=false}={}){
  const correction={...returned,status:STATUS.APPROVED,requestReference:'REQ-7',reason:'Correct closure timestamp',originalValues:{closedAt:'2026-09-12 08:00'},proposedChanges:{closedAt:invalid?'2026-09-10 09:00':'2026-09-11 09:00'}};
  const before={start:'2026-09-11 07:00',closedAt:'2026-09-12 08:00',timelineRecordedAt:'2026-09-27 10:00'};
  const calls=[],notifications=[];let handler,error,response,status=200,released=false;
  const client={async query(sql,args){calls.push({sql,args});
    if(sql.startsWith('SELECT')&&sql.includes('FROM request_corrections'))return {rows:[correction]};
    if(sql.startsWith('SELECT')&&sql.includes('FROM maintenance_requests'))return {rows:[before]};
    if(sql.startsWith('UPDATE maintenance_requests')&&dbFailure)throw new Error('database unavailable');
    return {rows:[{...correction,status:STATUS.APPLIED}]};
  },release(){released=true;}};
  const bindings={app:{patch(path,middleware,fn){handler=fn;}},requireSession(){},pool:{connect:async()=>client},requestCorrectionAccessContext:async()=>({administrator:true}),requestCorrectionProjection:'fixture',requestCorrectionSourceProjection:'fixture',REQUEST_CORRECTION_STATUS:STATUS,
    correctionValuesStillMatch:()=>!stale,validateRequestTimelineChange,...policy,...returns,
    recordRequestTimeline:async()=>{if(lateFailure)throw Object.assign(new Error('Fix timestamp reason'),{code:'TIMELINE_CORRECTION_REASON_REQUIRED',status:400});},
    correctionProjectManagerLogins:async()=>[],addTicketNotificationsBestEffort:async(...args)=>notifications.push(args)};
  new Function(...Object.keys(bindings),applySource)(...Object.values(bindings));
  const req={params:{id:'7'},session:{name:'Admin',login:'admin'}};
  await handler(req,{status(value){status=value;return this;},json(value){response=value;return this;}},problem=>{error=problem;});
  assert.equal(released,true);
  return {calls,notifications,response,status,error,req};
}
test('invalid application persists error and returns only to the original requester without applying changes',async()=>{
  const result=await apply();
  assert.equal(result.error,undefined);
  assert.equal(result.status,409);
  assert.equal(result.response.returned,true);
  assert.match(result.response.error,/cannot be before production/);
  assert.equal(result.calls.some(call=>call.sql.startsWith('UPDATE maintenance_requests')),false);
  const update=result.calls.find(call=>call.sql.startsWith('UPDATE request_corrections'));
  assert.equal(update.args[0],STATUS.RETURNED);
  assert.equal(update.args[3],7);
  assert.deepEqual(result.notifications[0][1],[' Owner ']);
  assert.equal(result.calls.at(-1).sql,'COMMIT');
});
test('stale proposals are returned; late validation rolls back all attempted maintenance changes',async()=>{
  const stale=await apply({stale:true});assert.equal(stale.response.returned,true);
  const result=await apply({invalid:false,lateFailure:true});
  const write=result.calls.findIndex(call=>call.sql.startsWith('UPDATE maintenance_requests'));
  const rollback=result.calls.findIndex(call=>call.sql==='ROLLBACK TO SAVEPOINT correction_apply');
  assert.ok(write>=0&&rollback>write);
  assert.equal(result.response.returned,true);
});
test('infrastructure failures roll back without blaming the requester, valid applications still succeed',async()=>{
  const failed=await apply({invalid:false,dbFailure:true});
  assert.match(failed.error.message,/database/);
  assert.equal(failed.notifications.length,0);
  assert.equal(failed.calls.at(-1).sql,'ROLLBACK');
  const valid=await apply({invalid:false});
  assert.equal(valid.error,undefined);
  assert.equal(valid.response.status,STATUS.APPLIED);
  assert.equal(valid.calls.some(call=>call.sql.includes('ROLLBACK TO')),false);
});

test('Admin rejects only approved corrections and cannot revert a case without an error',async()=>{
  const source=server.slice(server.indexOf("  app.patch('/api/request-corrections/:id/admin-decision'"),server.indexOf("  app.get('/api/request-corrections',"));
  async function run({administrator=true,status=STATUS.APPROVED,applyError='',decision='revert'}={}){
    let handler,error,result;const calls=[];
    const row={...returned,status,applyError,requestReference:'REQ-7'};
    const client={query:async(sql,args)=>{calls.push(sql);return {rows:[sql.startsWith('UPDATE')?{...row,status:args[0]}:row]};},release(){}};
    const bindings={app:{patch(path,middleware,fn){handler=fn;}},requireSession(){},pool:{connect:async()=>client},requestCorrectionAccessContext:async()=>({administrator,login:'admin'}),requestCorrectionProjection:'fixture',...policy,addTicketNotificationsBestEffort:async()=>{}};
    new Function(...Object.keys(bindings),source)(...Object.values(bindings));
    let responseStatus=200;
    await handler({params:{id:'7'},body:{decision,remark:'Invalid correction entry'},session:{name:'Admin'}},{status(value){responseStatus=value;return this;},json(value){result=value;}},problem=>{error=problem;});
    return {result,error,calls,responseStatus};
  }
  assert.equal((await run()).error.status,409);
  assert.equal((await run({administrator:false,applyError:'Error'})).responseStatus,403);
  assert.equal((await run({status:STATUS.APPLIED,applyError:'Old error'})).error.status,409);
  assert.equal((await run({status:STATUS.RETURNED,applyError:'Invalid timeline'})).result.status,STATUS.RETURNED);
  assert.equal((await run({decision:'reject'})).result.status,STATUS.REJECTED);
  assert.equal((await run({decision:'reject',status:STATUS.PENDING})).error.status,409);
});

test('editing returned cases reuses the same ID, resets PM approval and cannot save an invalid timeline',async()=>{
  const source=server.slice(server.indexOf('async function managePendingCorrection'),server.indexOf("  app.patch('/api/request-corrections/:id',"));
  async function run({closedAt='2026-09-11 09:00',method='PATCH',login='owner'}={}){
    const old={...returned,requestReference:'REQ-7',site:'Site A',applyError:'Invalid closure',reason:'Old correction reason',originalValues:{closedAt:'2026-09-12 08:00'},proposedChanges:{closedAt:'2026-09-10 09:00'}};
    const current={start:'2026-09-11 07:00',closedAt:'2026-09-12 08:00',timelineRecordedAt:'2026-09-27 10:00'};
    const calls=[],notifications=[];let error,result;
    const client={async query(sql,args){calls.push({sql,args});
      if(sql.startsWith('SELECT'))return {rows:[sql.includes('maintenance_requests')?current:old]};
      if(sql.startsWith('UPDATE'))return {rows:[method==='DELETE'?{...old,status:args[0]}:{...old,proposedChanges:JSON.parse(args[0]),reason:args[1],originalValues:JSON.parse(args[2]),status:args[3],applyError:''}]};
      return {rows:[]};
    },release(){}};
    const bindings={pool:{connect:async()=>client},requestCorrectionAccessContext:async()=>({login}),requestCorrectionProjection:'fixture',requestCorrectionSourceProjection:'fixture',...policy,...returns,reportScopeIncludesSite:()=>false,correctionBreakdownTypes:async()=>[],correctionProjectManagerLogins:async()=>['pm'],addTicketNotificationsBestEffort:async(...args)=>notifications.push(args)};
    const handler=new Function(...Object.keys(bindings),source+';return managePendingCorrection;')(...Object.values(bindings));
    await handler({params:{id:'7'},method,session:{login},body:{reason:'Corrected closure timestamp',proposedChanges:{closedAt}}},{json(value){result=value;}},problem=>{error=problem;});
    return {calls,notifications,error,result};
  }
  const valid=await run();
  assert.equal(valid.error,undefined);
  assert.equal(valid.result.id,7);
  assert.equal(valid.result.status,STATUS.PENDING);
  assert.equal(valid.result.applyError,'');
  assert.match(valid.calls.find(call=>call.sql.startsWith('UPDATE')).sql,/reviewed_at=NULL/);
  assert.deepEqual(valid.notifications[0][1],['pm']);
  const invalid=await run({closedAt:'2026-09-10 09:00'});
  assert.match(invalid.error.message,/cannot be before/);
  assert.equal(invalid.calls.some(call=>call.sql.startsWith('UPDATE')),false);
  assert.equal((await run({method:'DELETE'})).result.status,STATUS.DELETED);
  assert.equal((await run({method:'DELETE',login:'other'})).error.status,403);
});
