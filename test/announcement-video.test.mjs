import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import {PGlite} from '@electric-sql/pglite';
import {ANNOUNCEMENT_VIDEO_MAX_BYTES,announcementVideoError,announcementVideoBinary,announcementValidationError,announcementImageError} from '../announcement.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const mp4=(size=24)=>{const bytes=Buffer.alloc(size);bytes.writeUInt32BE(24);bytes.write('ftyp',4);bytes.write('isom',8);return 'data:video/mp4;base64,'+bytes.toString('base64');};

test('MP4 validation accepts the 10 MB boundary and rejects oversized, non-MP4 and spoofed content',()=>{
  assert.equal(announcementVideoError(''),'');
  assert.equal(announcementVideoError(mp4()),'');
  assert.equal(announcementVideoError(mp4(ANNOUNCEMENT_VIDEO_MAX_BYTES)),'');
  assert.match(announcementVideoError(mp4(ANNOUNCEMENT_VIDEO_MAX_BYTES+1)),/10 MB/);
  for(const value of ['data:video/webm;base64,AAAA','data:text/html;base64,PGgxPg==','data:video/mp4;base64,PGgxPm5vdCB2aWRlbzwvaDE+','data:video/mp4;base64,A'])assert.match(announcementVideoError(value),/MP4/);
  assert.equal(announcementVideoBinary('bad'),null);
  const binary=announcementVideoBinary(mp4());
  assert.equal(binary.contentType,'video/mp4');assert.equal(binary.bytes.subarray(4,8).toString(),'ftyp');
  assert.equal(announcementValidationError('',{hasVideo:true}),'');
  assert.match(announcementValidationError('Text',{hasImage:true,hasVideo:true}),/not both/);
  assert.equal(announcementImageError('data:image/png;base64,iVBORw0KGgo='),'');
});

test('the video storage migration preserves existing text and image announcements',async()=>{
  const db=new PGlite();
  try{
    await db.exec("CREATE TABLE announcements(id int,message text,image_data text); INSERT INTO announcements VALUES (1,'Keep this announcement','data:image/png;base64,iVBORw0KGgo=');");
    const sql=server.match(/ALTER TABLE announcements ADD COLUMN IF NOT EXISTS video_data TEXT NOT NULL DEFAULT '';/)[0];
    await db.exec(sql);await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM announcements')).rows,[{id:1,message:'Keep this announcement',image_data:'data:image/png;base64,iVBORw0KGgo=',video_data:''}]);
  }finally{await db.close();}
});

function route(start,end,bindings){let callback;const app={get:(_path,...handlers)=>{callback=handlers.at(-1);},post:(_path,...handlers)=>{callback=handlers.at(-1);}};new Function('app',...Object.keys(bindings),server.slice(server.indexOf(start),server.indexOf(end,server.indexOf(start))))(app,...Object.values(bindings));return callback;}
const response=()=>({statusCode:200,headers:{},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;},set(key,value){this.headers[key]=value;return this;},type(value){this.contentType=value;return this;},send(value){this.body=value;return this;}});
test('the authenticated video endpoint returns MP4 bytes and handles invalid or missing attachments',async()=>{
  const queries=[];let stored=mp4();
  const handler=route("app.get('/api/announcements/:announcementId/video'","app.patch('/api/announcements/:announcementId/acknowledge'",{requireSession:()=>{},announcementVideoBinary,pool:{query:async(sql,args)=>{queries.push(args);return {rows:stored?[{video_data:stored}]:[]};}}});
  const req=id=>({params:{announcementId:id}});
  let res=response();await handler(req('12'),res,error=>{throw error;});assert.equal(res.contentType,'video/mp4');assert.equal(res.body.subarray(4,8).toString(),'ftyp');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
  res=response();await handler(req('no'),res,error=>{throw error;});assert.equal(res.statusCode,400);assert.equal(queries.length,1);
  stored='';res=response();await handler(req('12'),res,error=>{throw error;});assert.equal(res.statusCode,404);
  assert.match(server,/app\.get\('\/api\/announcements\/:announcementId\/video',requireSession,/);
});

test('video-only announcements persist the attachment; invalid and mixed attachments do not write',async()=>{
  const writes=[];
  const {normalizeAnnouncement}=await import('../announcement.mjs');
  const handler=route("app.post('/api/announcements',","app.patch('/api/announcements/:announcementId/withdraw'",{requireSuper:()=>{},requireAdministrator:()=>{},normalizeAnnouncement,announcementImageError,announcementVideoError,announcementValidationError,pool:{query:async(sql,values)=>{writes.push({sql,values});return {rows:[{id:22,createdAt:'now'}]};}}});
  const send=async body=>{const res=response();await handler({body,session:{login:'admin',name:'Admin'}},res,error=>{throw error;});return res;};
  assert.equal((await send({message:'',video:mp4()})).statusCode,201);assert.equal(writes.length,1);assert.equal(writes[0].values[4],mp4());assert.match(writes[0].sql,/image_data,video_data/);
  for(const body of [{video:'bad'},{video:true},{video:mp4(),image:'data:image/png;base64,iVBORw0KGgo='},{}])assert.equal((await send(body)).statusCode,400);
  assert.equal(writes.length,1);
  for(const name of ['history','pending']){
    const start=server.indexOf(`app.get('/api/announcements/${name}'`),end=server.indexOf('\napp.',start+1),code=server.slice(start,end);
    assert.match(code,/AS "hasVideo"/);assert.doesNotMatch(code,/video_data AS|SELECT \*/);
  }
});

const all=(node,predicate)=>{const result=[];function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!React.isValidElement(value))return;if(predicate(value))result.push(value);visit(value.props.children);}visit(node);return result;};
test('the composer previews MP4, sends it in the payload, supports removal and rejects oversize before reading',async()=>{
  const snippet=source.slice(source.indexOf('function AnnouncementComposer('),source.indexOf('function SessionMessageInbox('));
  const {code}=await transformWithOxc(snippet,'announcement-composer.jsx',{jsx:{runtime:'classic'}});
  let cursor=0,reads=0;const slots=[],posted=[];
  const useState=initial=>{const key=cursor++;if(!(key in slots))slots[key]=typeof initial==='function'?initial():initial;return [slots[key],value=>{slots[key]=typeof value==='function'?value(slots[key]):value;}];};
  const Null=()=>null;
  const scope={React,useState,useRef:value=>useState(()=>({current:value}))[0],useEffect:()=>{},Modal:Null,Users:Null,X:Null,ImagePlus:Null,Send:Null,AnnouncementImage:Null,AnnouncementVideo:Null,authToken:'token',formatTwelveHourDateTime:value=>value,ANNOUNCEMENT_VIDEO_MAX_BYTES,announcementVideoError,readBlobDataUrl:async()=>{reads++;return mp4();},compressImageDataUrl:async()=> 'data:image/png;base64,iVBORw0KGgo=',fetch:async(url,options)=>{posted.push(JSON.parse(options.body));return {ok:true,text:async()=>'{"id":22}'};}};
  const Composer=new Function(...Object.keys(scope),code+';return AnnouncementComposer;')(...Object.values(scope));
  const render=()=>{cursor=0;return Composer({session:{token:'test'},onClose(){}});};
  const picker=tree=>all(tree,node=>node.type==='input'&&node.props.type==='file')[0];
  let tree=render();assert.match(picker(tree).props.accept,/video\/mp4/);
  await picker(tree).props.onChange({target:{files:[{type:'video/mp4',size:24}],value:'file'}});await new Promise(resolve=>setImmediate(resolve));tree=render();
  assert.equal(all(tree,node=>node.type==='video')[0].props.src,mp4());
  await all(tree,node=>node.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(posted[0].video,mp4());assert.equal(posted[0].image,'');
  tree=render();all(tree,node=>node.type==='button'&&all(node,child=>child.type===Null).length>0&&String(React.Children.toArray(node.props.children).at(-1)).includes('Remove video'))[0].props.onClick();tree=render();assert.equal(all(tree,node=>node.type==='video').length,0);
  await picker(tree).props.onChange({target:{files:[{type:'video/mp4',size:ANNOUNCEMENT_VIDEO_MAX_BYTES+1}],value:'file'}});await new Promise(resolve=>setImmediate(resolve));tree=render();assert.equal(reads,1);assert.equal(all(tree,node=>node.type==='video').length,0);assert.match(all(tree,node=>node.props.role==='alert')[0].props.children,/10 MB/);
});
