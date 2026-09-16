import {userSiteScope, reportScopeIncludesSite} from '../region-scope.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {validComplaintMedia,readComplaintMedia,COMPLAINT_MEDIA_LIMIT} from '../complaint-media.mjs';
import {auditSubmittedFields} from '../audit-trail.mjs';
const photo={name:'photo.png',data:'data:image/png;base64,aGVsbG8='};
const video={name:'video.mp4',data:'data:video/mp4;base64,aGVsbG8='};
test('complaint evidence is protected in audit records',()=>{
 assert.equal(auditSubmittedFields({complaintMedia:[photo,video]})[0].after,'[protected]');
});
test('complaint evidence permits optional photo and video with bounded formats and sizes',()=>{
 assert.equal(validComplaintMedia([]),true);
 assert.equal(validComplaintMedia([photo,video]),true);
 for(const items of [null,{},[photo,photo],[photo,video,photo],[{...photo,data:'data:text/html;base64,aGVsbG8='}],[{...photo,data:'data:image/svg+xml;base64,aGVsbG8='}],[{...photo,data:'data:image/png;base64,'+'A'.repeat(Math.ceil((COMPLAINT_MEDIA_LIMIT+3)/3)*4)}]])assert.equal(validComplaintMedia(items),false);
});
test('empty fields preserve text-only requests and oversized video is rejected before reading',async()=>{
 assert.deepEqual(await readComplaintMedia({get:()=>null}),[]);
 await assert.rejects(readComplaintMedia({get:()=>({size:COMPLAINT_MEDIA_LIMIT+1,type:'video/mp4'})}),/5 MB/);
});
test('attachment endpoint checks ownership and site before loading private media',async()=>{
 const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const route=server.slice(server.indexOf("app.get('/api/requests/:reference/complaint-media'"),server.indexOf('const arrivalDelaySql='));
 const body=route.slice(route.indexOf('  try{'),route.lastIndexOf('});'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const handler=new AsyncFunction('req','res','next','pool','currentDashboardAuthorization','reportScopeIncludesSite','managerReportScope','canonicalSiteName','requestProjection','requestTimelineProjection','userSiteScope',body);
 for(const [site,owner,expected] of [['A','alice',200],['B','alice',403],['A','bob',403]]){
  let queries=0,status=200,result;
  const req={params:{reference:'REQ-1'},session:{login:'alice'}};
  const session={role:'normal',assignedRole:'Production User'};
  const pool={query:async()=>{queries++;return {rows:queries===1?[{site,requesterLogin:owner}]:[{complaint_media:[photo]}]};}};
  const res={status:n=>{status=n;return res;},json:x=>{result=x;},set:()=>{}};
  await handler(req,res,error=>{throw error;},pool,async()=>({session,user:{site:'A',login:'alice'}}),reportScopeIncludesSite,()=>({}),x=>x,'projection','timeline',userSiteScope);
  assert.equal(status,expected);assert.equal(queries,expected===200?2:1);
  if(expected===200)assert.deepEqual(result.items,[photo]);
 }
});
