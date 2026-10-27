import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installPulseApplicationIdentity,pulseApplicationProfile} from '../pulse-application-identity.mjs';
import {hrProfilePermissions} from '../hr-permissions.mjs';
const routes=new Map();let queries=0;let revoked=false;
const user={login:'directory-test',passwordHash:'not-a-real-password-hash',hrAccess:true,hrDesktopAccess:['Employee Master']};
const credential_version=createHash('sha256').update(`${user.login}:${user.passwordHash}:${JSON.stringify(hrProfilePermissions(user))}`).digest('hex');
const pool={async query(sql,args){queries++;if(sql.includes('FROM application_identity_grants'))return {rows:revoked?[]:[{id:1,record_data:user,credential_version,session_token:'fixture'}]};return {rows:[]};}};
installPulseApplicationIdentity({post:(path,handler)=>routes.set(path,handler),options(){}},{pool,sessionStore:{}});
async function call(grant,origin){let value,code=200;const res={set(){return this;},status(status){code=status;return this;},json(body){value=body;return this;}};await routes.get('/api/integrations/hr/directory')({body:{grant},headers:origin?{origin}:{},method:'POST'},res,error=>{throw error;});return {code,value};}
assert.equal((await call('bad')).code,401);assert.equal(queries,0);
assert.equal((await call('a'.repeat(43),'https://untrusted.example')).code,403);assert.equal(queries,0);
const allowed=await call('a'.repeat(43),'https://hrpulse.cmll.in');assert.equal(allowed.code,200);assert.ok(Array.isArray(allowed.value.rows));
revoked=true;assert.equal((await call('a'.repeat(43))).code,401);
assert.equal(routes.has('/api/integrations/mis/directory'),false);
console.log('Directory route: malformed grants, origin restriction, valid HR grant and revoked sessions passed.');
