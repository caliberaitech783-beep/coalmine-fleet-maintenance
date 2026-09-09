import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const attachmentSource=source.slice(source.indexOf('function readTicketAttachment('),source.indexOf('function TicketCreateForm('));
const codes={};
for(const [name,next] of [['TicketCreateForm','TicketMedia'],['TicketResolutionForm','AdminLockManagement']]){
  const component=source.slice(source.indexOf(`function ${name}(`),source.indexOf(`function ${next}(`));
  codes[name]=(await transformWithOxc(component,`${name}.jsx`,{jsx:{runtime:'classic'}})).code;
}
const Null=()=>null;
const all=(tree,predicate)=>{
  const found=[];
  const visit=node=>{
    if(Array.isArray(node))return node.forEach(visit);
    if(!React.isValidElement(node))return;
    if(predicate(node))found.push(node);
    visit(node.props.children);
  };
  visit(tree);return found;
};
const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):typeof node==='string'||typeof node==='number'?String(node):'';
const button=(tree,label)=>all(tree,node=>node.type==='button'&&text(node).trim()===label)[0];
const form=tree=>all(tree,node=>node.type==='form')[0];
const inlineError=tree=>text(all(tree,node=>node.props.role==='alert')[0]);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const response=(body={reference:'TKT-FIXTURE'},ok=true)=>({ok,json:async()=>body});
const configurations=[
  {name:'TicketCreateForm',path:'/api/tickets',method:'POST',message:'message',audio:'messageAudio',data:'attachmentData',fileName:'attachmentName',fileType:'attachmentType',callback:'onCreated',pending:'Creating…',submit:'Create ticket',defaultError:'Could not create the ticket.'},
  {name:'TicketResolutionForm',path:'/api/tickets/resolve',method:'PATCH',message:'resolutionMessage',audio:'resolutionAudio',data:'resolutionAttachmentData',fileName:'resolutionAttachmentName',fileType:'resolutionAttachmentType',callback:'onResolved',pending:'Resolving…',submit:'Resolve ticket',defaultError:'Could not resolve the ticket.'},
];

// Exercise the actual compiled components with deterministic React hook slots,
// effect cleanup and mocked transport. No browser, real accounts or network.
function harness(config,{fetch:fetchImpl=async()=>response(),readAttachment}={}){
  const slots=[],calls=[],completed=[],order=[];
  let cursor=0,queued=[],dirty=false,mounted=true,stateWrites=0,closed=0;
  let props={session:{token:'local-test-token'},ticket:{reference:'TKT-FIXTURE'},close(){closed++;order.push('close');},[config.callback](row){completed.push(row);order.push('saved');}};
  const useState=initial=>{
    const index=cursor++;
    if(!(index in slots))slots[index]={value:typeof initial==='function'?initial():initial};
    return [slots[index].value,value=>{
      stateWrites++;
      assert.ok(mounted,'No state updates are allowed after unmount');
      const next=typeof value==='function'?value(slots[index].value):value;
      if(!Object.is(next,slots[index].value)){slots[index].value=next;dirty=true;}
    }];
  };
  const useRef=initial=>{
    const index=cursor++;
    if(!(index in slots))slots[index]={ref:{current:initial}};
    return slots[index].ref;
  };
  const useEffect=(effect,deps)=>{
    const index=cursor++,previous=slots[index];
    if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i])))queued.push(()=>{
      previous?.cleanup?.();
      slots[index]={deps:[...deps],cleanup:effect()};
    });
  };
  class FileReader{
    readAsDataURL(file){if(file.failRead)this.onerror();else{this.result=file.data||'data:image/png;base64,dGVzdA==';this.onload();}}
  }
  const readTicketAttachment=readAttachment||new Function('FileReader',`${attachmentSource};return readTicketAttachment;`)(FileReader);
  const scope={React,useState,useRef,useEffect,Modal:Null,EnhancedSpeechComplaint:Null,Send:Null,CheckCircle2:Null,readTicketAttachment,
    alert:()=>assert.fail('Ticket forms must use inline feedback, not native alert'),
    FormData:class {constructor(values){this.values=values;}get(key){return this.values[key]??'';}},
    fetch:async(...args)=>{calls.push(args);return fetchImpl(...args);},
  };
  const Component=new Function(...Object.keys(scope),`${codes[config.name]};return ${config.name};`)(...Object.values(scope));
  const api={calls,completed,order,
    render(changes={}){
      props={...props,...changes};let tree,attempts=0;
      do{assert.ok(++attempts<10,'No render loop');cursor=0;queued=[];dirty=false;tree=Component(props);for(const effect of queued)effect();}while(dirty);
      return tree;
    },
    unmount(){for(const slot of slots)slot?.cleanup?.();mounted=false;},
    get stateWrites(){return stateWrites;},get closed(){return closed;},
    values(extra={}){return {priority:'High',[config.message]:'   Labelled fixture issue   ',[config.audio]:'',...extra};},
    submit(tree,values){return form(tree).props.onSubmit({preventDefault(){},currentTarget:values||api.values()});},
    attach(tree,file){all(tree,node=>node.type==='input'&&node.props.type==='file')[0].props.onChange({target:{files:file?[file]:[]}});return api.render();},
  };
  return api;
}

for(const config of configurations){
  test(`${config.name}: saves original payload, attachment metadata and callbacks without native alert`,async()=>{
    const saved={reference:'TKT-FIXTURE',status:config.method==='POST'?'Open':'Resolved'};
    const app=harness(config,{fetch:async()=>response(saved)});
    const file={name:'labelled-fixture.png',type:'image/png',size:123,data:'data:image/png;base64,dGVzdA=='};
    const tree=app.attach(app.render(),file);
    await app.submit(tree,app.values({[config.audio]:'data:audio/webm;base64,dGVzdA=='}));
    assert.equal(app.calls.length,1);
    const [url,request]=app.calls[0],payload=JSON.parse(request.body);
    assert.equal(url,config.path);assert.equal(request.method,config.method);
    assert.equal(request.headers.Authorization,'Bearer local-test-token');
    assert.equal(payload[config.message],'Labelled fixture issue');
    assert.equal(payload[config.audio],'data:audio/webm;base64,dGVzdA==');
    assert.equal(payload[config.data],file.data);assert.equal(payload[config.fileName],file.name);assert.equal(payload[config.fileType],file.type);
    if(config.method==='POST')assert.equal(payload.priority,'High');else assert.equal(payload.reference,'TKT-FIXTURE');
    assert.deepEqual(app.completed,[saved]);assert.deepEqual(app.order,['saved','close']);
  });

  test(`${config.name}: blank message/audio stays open with inline validation, while audio-only submission remains supported`,async()=>{
    const app=harness(config);
    await app.submit(app.render(),app.values({[config.message]:' \t ',[config.audio]:''}));
    let tree=app.render();
    assert.match(inlineError(tree),/Write.*message.*record/i);
    assert.equal(app.calls.length,0);assert.equal(app.closed,0);assert.equal(button(tree,'Cancel').props.disabled,false);
    await app.submit(tree,app.values({[config.message]:'',[config.audio]:'data:audio/webm;base64,dGVzdA=='}));
    assert.equal(app.calls.length,1);assert.equal(app.closed,1);
  });

  test(`${config.name}: API failure stays open and can retry successfully`,async()=>{
    let attempts=0;
    const app=harness(config,{fetch:async()=>++attempts===1?response({error:'The ticket changed. Please retry.'},false):response()});
    await app.submit(app.render());
    let tree=app.render();
    assert.equal(inlineError(tree),'The ticket changed. Please retry.');
    assert.equal(app.closed,0);assert.equal(app.completed.length,0);assert.equal(button(tree,config.submit).props.disabled,false);
    await app.submit(tree);
    assert.equal(app.calls.length,2);assert.equal(app.completed.length,1);assert.equal(app.closed,1);
    assert.equal(inlineError(app.render()),'');
  });

  test(`${config.name}: transport and unreadable error responses have actionable inline feedback`,async()=>{
    for(const transport of [async()=>{throw Error('Network unavailable.');},async()=>({ok:false,json:async()=>{throw Error('Not JSON');}})]){
      const app=harness(config,{fetch:transport});
      await app.submit(app.render());
      assert.ok(['Network unavailable.',config.defaultError].includes(inlineError(app.render())));
      assert.equal(app.closed,0);assert.equal(app.completed.length,0);
    }
  });

  test(`${config.name}: invalid, oversized and unreadable media never submit and remain retryable`,async()=>{
    for(const file of [{name:'bad.txt',type:'text/plain',size:12},{name:'large.png',type:'image/png',size:10*1024*1024+1},{name:'bad.png',type:'image/png',size:12,failRead:true}]){
      const app=harness(config);
      let tree=app.attach(app.render(),file);await app.submit(tree);tree=app.render();
      assert.match(inlineError(tree),file.failRead?/Could not read/:/up to 10 MB/);
      assert.equal(app.calls.length,0);assert.equal(app.closed,0);assert.equal(button(tree,'Cancel').props.disabled,false);
      tree=app.attach(tree,null);await app.submit(tree);assert.equal(app.calls.length,1);assert.equal(app.closed,1);
    }
  });

  test(`${config.name}: synchronous duplicate submission and pending Cancel/modal X are guarded`,async()=>{
    const pending=deferred(),app=harness(config,{fetch:()=>pending.promise});
    const initial=app.render(),save=app.submit(initial);
    await app.submit(initial);
    initial.props.close();button(initial,'Cancel').props.onClick();
    await tick();
    let tree=app.render();tree.props.close();button(tree,'Cancel').props.onClick();
    assert.equal(app.calls.length,1);assert.equal(app.closed,0);
    assert.equal(button(tree,'Cancel').props.disabled,true);assert.equal(button(tree,config.pending).props.disabled,true);
    pending.resolve(response());await save;
    assert.equal(app.completed.length,1);assert.equal(app.closed,1);
  });

  test(`${config.name}: pending failure releases submission/cancel lock without closing the form`,async()=>{
    const pending=deferred(),app=harness(config,{fetch:()=>pending.promise});
    const save=app.submit(app.render());await tick();
    pending.reject(Error('Temporary network error'));await save;
    const tree=app.render();assert.equal(inlineError(tree),'Temporary network error');assert.equal(app.closed,0);
    button(tree,'Cancel').props.onClick();assert.equal(app.closed,1);assert.equal(app.completed.length,0);
  });

  for(const transition of ['unmount','account change',...(config.method==='PATCH'?['ticket change']:[])]){
    test(`${config.name}: ${transition} suppresses stale success/failure callbacks and state updates`,async()=>{
      for(const ok of [true,false]){
        const pending=deferred(),app=harness(config,{fetch:()=>pending.promise});
        const save=app.submit(app.render());await tick();assert.equal(app.calls.length,1);
        if(transition==='unmount')app.unmount();
        else app.render(transition==='account change'?{session:{token:'new-local-account'}}:{ticket:{reference:'TKT-NEXT'}});
        const before=app.stateWrites;
        pending.resolve(response(ok?{reference:'OLD-TICKET'}:{error:'Old request failure'},ok));await save;
        assert.equal(app.completed.length,0);assert.equal(app.closed,0);assert.equal(app.stateWrites,before);
        if(transition!=='unmount')assert.equal(inlineError(app.render()),'');
      }
    });
  }

  test(`${config.name}: leaving during attachment reading prevents a later fetch with stale identity`,async()=>{
    for(const unmount of [true,false]){
      const media=deferred(),app=harness(config,{readAttachment:()=>media.promise});
      const save=app.submit(app.render());
      if(unmount)app.unmount();else app.render({session:{token:'new-local-account'}});
      const before=app.stateWrites;media.resolve('data:image/png;base64,dGVzdA==');await save;
      assert.equal(app.calls.length,0);assert.equal(app.completed.length,0);assert.equal(app.closed,0);assert.equal(app.stateWrites,before);
    }
  });

  test(`${config.name}: old response cannot unlock or replace a newer account's pending submission`,async()=>{
    const old=deferred(),fresh=deferred();let requests=0;
    const app=harness(config,{fetch:()=>++requests===1?old.promise:fresh.promise});
    const oldSave=app.submit(app.render());await tick();
    const freshSave=app.submit(app.render({session:{token:'new-local-account'}}));await tick();
    old.resolve(response({reference:'OLD'}));await oldSave;
    const tree=app.render();assert.equal(button(tree,config.pending).props.disabled,true);tree.props.close();
    assert.equal(app.closed,0);assert.equal(app.completed.length,0);
    assert.equal(app.calls[1][1].headers.Authorization,'Bearer new-local-account');
    fresh.resolve(response({reference:'NEW'}));await freshSave;
    assert.deepEqual(app.completed,[{reference:'NEW'}]);assert.equal(app.closed,1);
  });
}
