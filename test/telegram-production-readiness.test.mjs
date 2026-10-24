import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../scripts/verify-telegram-membership-readiness.mjs',import.meta.url),'utf8').replace("import {execFileSync} from 'node:child_process';",'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function run(responses){
  const calls=[],output=[],state={env:{},exitCode:0};
  const execFileSync=(_file,args)=>JSON.stringify(args.includes('get-access-token')?{accessToken:'test-arm-token'}:args.includes('list-publishing-credentials')?{publishingUserName:'test-publisher',publishingPassword:'test-password'}:['pulse.scm.azurewebsites.net']);
  const fetch=async(url,options)=>{calls.push({url,options});const response=responses.shift();return {status:response.status||200,ok:(response.status||200)<400,json:async()=>({Output:JSON.stringify(response.result)})};};
  await new AsyncFunction('execFileSync','fetch','process','console',source)(execFileSync,fetch,state,{log:value=>output.push(value),error:value=>output.push(value)});
  return {calls,output,state};
}
test('readiness probes the production runtime and publishes only readiness data',async()=>{
  const result=await run([{result:{source:'production',ready:true,sites:[{site:'Sasti OC',registered:true,botReady:true}]}}]);
  assert.equal(result.state.exitCode,0);
  const request=JSON.parse(result.calls[0].options.body);
  assert.equal(request.dir,'/home/site/wwwroot');
  const encoded=request.command.match(/Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)/)?.[1];
  assert.ok(encoded,'remote source survives Kudu command argument parsing');
  const remote=Buffer.from(encoded,'base64').toString();
  assert.match(remote,/SELECT setting_value FROM app_settings/);
  assert.match(remote,/telegramSiteGroupDetails/);
  assert.match(remote,/createRequire\('\/home\/site\/wwwroot\/server\.mjs'\)/);
  assert.doesNotThrow(()=>new AsyncFunction(remote),'the runtime probe is valid JavaScript');
  assert.doesNotMatch(result.output.join('\n'),/test-arm-token|test-password|test-publisher|DATABASE_URL|TELEGRAM_BOT_TOKEN/);
});
test('missing groups or bot permissions stop deployment',async()=>{
  const result=await run([{result:{source:'production',ready:false,sites:[{site:'Sasti OC',registered:false,botReady:false}]}}]);
  assert.equal(result.state.exitCode,1);
  assert.match(result.output.join('\n'),/Membership release stopped/);
});
test('SCM authentication fallback retains credentials only in memory',async()=>{
  const result=await run([{status:401},{result:{source:'production',ready:true,sites:[]}}]);
  assert.equal(result.calls.length,2);
  assert.match(result.calls[1].options.headers.Authorization,/^Basic /);
  assert.equal(result.state.exitCode,0);
  assert.doesNotMatch(result.output.join('\n'),/test-arm-token|test-password|test-publisher/);
});
test('a denied production probe fails closed',async()=>{
  const result=await run([{status:403}]);
  assert.equal(result.state.exitCode,1);
  assert.equal(result.calls.length,1);
  assert.match(result.output.join('\n'),/preflightFailed/);
});
