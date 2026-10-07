import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenderSession,currentTenderSession,touchTenderSession,endTenderSession} from '../tender-sessions.mjs';
import {createSessionStore} from '../auth-session.mjs';
test('Tender central sessions bind the account and password version and keep BDMS tokens private',async()=>{
 const calls=[];let alive=true;const pool={query:async(q,v)=>{calls.push({q,v});if(q.startsWith('SELECT session_public_id'))return {rows:alive?[{session_public_id:v[0]}]:[]};if(q.startsWith('DELETE'))alive=false;return {rows:[]};}};
 const profile={id:'42',name:'Test',login:'TEST',credentialVersion:'version'};
 const id=await createTenderSession(pool,profile,{deviceId:'browser',ipAddress:'127.0.0.1',userAgent:'test'});
 assert.notEqual(calls[0].v[0],id);assert.equal(JSON.parse(calls[0].v[3]).application,'Tender');
 assert.equal(await currentTenderSession(pool,profile,id),true);assert.deepEqual(calls[1].v,[id,'42','version']);assert.match(calls[1].q,/30 days/);
 assert.equal(await currentTenderSession(pool,profile,''),false);
 await touchTenderSession(pool,profile,id,{deviceId:'browser'});assert.ok(calls.some(c=>c.q.includes('INSERT INTO user_session_activity')));
 await endTenderSession(pool,profile,id);assert.equal(await currentTenderSession(pool,profile,id),false);
});
test('A central Tender tracking token cannot sign into BDMS',async()=>{
 const store=createSessionStore({query:async()=>({rows:[{role:'admin',permissions:{application:'Tender'}}]})});assert.equal(await store.get('private-tracking-token'),null);
});
