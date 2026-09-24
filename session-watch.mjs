// Live session watch: relays rrweb screen events from a signed-in user's
// browser to administrators who are watching, and keeps a bounded in-memory
// backlog so a viewer who joins mid-session can rebuild the screen.
//
// Transport is a WebSocket on SESSION_WATCH_PATH. The first message from
// every socket must be {type:'auth', token} — the token never travels in the
// URL, so it stays out of proxy and server logs.

import {WebSocketServer} from 'ws';
import {auditDeviceDetails} from './device-details.mjs';

export const SESSION_WATCH_PATH='/ws/session-watch';
export const SESSION_WATCH_LIMITS={
  maxBacklogEvents:6000,
  maxBacklogBytes:8*1024*1024,
  maxEventBytes:2*1024*1024,
  endedRetentionMs:2*60*60*1000,
  maxEndedSessions:40,
  heartbeatMs:30*1000,
};

const RRWEB_FULL_SNAPSHOT=2;
const RRWEB_META=4;

export function canWatchSessions(session={}){
  return session?.role==='super'&&session?.permissions?.adminLevel!=='Manager';
}

export function sessionWatchIdentity(session={}){
  return {
    login:String(session?.login||'').trim(),
    name:String(session?.name||'').trim(),
    role:String(session?.permissions?.adminLevel||session?.assignedRole||session?.userType||session?.role||'').trim(),
    accountType:String(session?.role||'').trim(),
  };
}

// Keep only what a late viewer needs: the last meta + full snapshot and the
// incremental events after it. Older history is dropped as soon as the
// recorder checks out with a fresh snapshot, which bounds memory per session.
export function trimBacklog(events,limits=SESSION_WATCH_LIMITS){
  let lastSnapshot=-1;
  for(let index=events.length-1;index>=0;index-=1){
    if(events[index]?.type===RRWEB_FULL_SNAPSHOT){lastSnapshot=index;break;}
  }
  let start=0;
  if(lastSnapshot>0){
    start=lastSnapshot;
    if(events[lastSnapshot-1]?.type===RRWEB_META)start=lastSnapshot-1;
  }
  let trimmed=start?events.slice(start):events;
  if(trimmed.length>limits.maxBacklogEvents){
    // Without a snapshot inside the window the backlog cannot be replayed, so
    // keep the head (meta + snapshot) and the most recent tail.
    const head=trimmed.slice(0,2);
    trimmed=[...head,...trimmed.slice(trimmed.length-(limits.maxBacklogEvents-head.length))];
  }
  return trimmed;
}

export function createSessionWatch({authenticate,limits=SESSION_WATCH_LIMITS,now=()=>Date.now(),logger=console}={}){
  if(typeof authenticate!=='function')throw new Error('createSessionWatch requires an authenticate(token) function.');
  const live=new Map();   // sessionId -> live session
  const ended=[];         // most recent first
  const viewers=new Set();// sockets of administrators (list subscribers)
  let idCounter=0;

  const send=(socket,message)=>{
    if(socket.readyState!==socket.OPEN)return;
    try{socket.send(JSON.stringify(message));}catch{}
  };

  const publicSession=(entry)=>({
    id:entry.id,
    login:entry.identity.login,
    name:entry.identity.name,
    role:entry.identity.role,
    accountType:entry.identity.accountType,
    device:entry.device,
    page:entry.page,
    url:entry.url,
    viewport:entry.viewport,
    startedAt:entry.startedAt,
    lastSeenAt:entry.lastSeenAt,
    endedAt:entry.endedAt||null,
    events:entry.events.length,
    bytes:entry.bytes,
    watchers:[...entry.watchers].map((viewer)=>viewer.identity.name||viewer.identity.login),
    live:!entry.endedAt,
  });

  const snapshotList=()=>({
    live:[...live.values()].map(publicSession),
    recent:ended.map(publicSession),
  });

  const broadcastList=()=>{
    const message={type:'sessions',...snapshotList()};
    for(const viewer of viewers)send(viewer,message);
  };

  const pruneEnded=()=>{
    const cutoff=now()-limits.endedRetentionMs;
    while(ended.length&&(ended.length>limits.maxEndedSessions||ended[ended.length-1].endedAt<cutoff))ended.pop();
  };

  const notifyWatchers=(entry)=>{
    const names=[...entry.watchers].map((viewer)=>viewer.identity.name||viewer.identity.login).filter(Boolean);
    send(entry.socket,{type:'watchers',watchers:names});
  };

  const endSession=(entry)=>{
    if(!live.has(entry.id))return;
    live.delete(entry.id);
    entry.endedAt=now();
    entry.socket=null;
    ended.unshift(entry);
    pruneEnded();
    for(const viewer of entry.watchers)send(viewer,{type:'ended',sessionId:entry.id});
    broadcastList();
  };

  const stopWatching=(viewer)=>{
    const entry=viewer.watching;
    if(!entry)return;
    entry.watchers.delete(viewer);
    viewer.watching=null;
    if(!entry.endedAt&&entry.socket)notifyWatchers(entry);
    broadcastList();
  };

  const findSession=(sessionId)=>live.get(sessionId)||ended.find((entry)=>entry.id===sessionId)||null;

  const handleRecorderMessage=(socket,message)=>{
    const entry=socket.recording;
    if(!entry)return;
    if(message.type==='hello'){
      entry.device=auditDeviceDetails(String(message.userAgent||''));
      entry.page=String(message.page||'').slice(0,120);
      entry.url=String(message.url||'').slice(0,300);
      entry.viewport={width:Number(message.width)||0,height:Number(message.height)||0};
      entry.lastSeenAt=now();
      broadcastList();
      return;
    }
    if(message.type==='page'){
      entry.page=String(message.page||'').slice(0,120);
      entry.url=String(message.url||'').slice(0,300);
      entry.lastSeenAt=now();
      broadcastList();
      return;
    }
    if(message.type==='events'&&Array.isArray(message.events)){
      const incoming=message.events.filter((event)=>event&&typeof event==='object'&&Number.isFinite(event.type));
      if(!incoming.length)return;
      entry.events.push(...incoming);
      entry.events=trimBacklog(entry.events,limits);
      entry.bytes=Buffer.byteLength(JSON.stringify(entry.events));
      if(entry.bytes>limits.maxBacklogBytes){
        // Ask the recorder for a fresh snapshot so the backlog can shrink.
        send(socket,{type:'checkout'});
      }
      entry.lastSeenAt=now();
      for(const viewer of entry.watchers)send(viewer,{type:'events',sessionId:entry.id,events:incoming});
    }
  };

  const handleViewerMessage=(socket,message)=>{
    if(message.type==='list'){send(socket,{type:'sessions',...snapshotList()});return;}
    if(message.type==='watch'){
      const entry=findSession(String(message.sessionId||''));
      if(!entry){send(socket,{type:'error',error:'That session is no longer available.'});return;}
      stopWatching(socket);
      socket.watching=entry;
      entry.watchers.add(socket);
      send(socket,{type:'backlog',sessionId:entry.id,session:publicSession(entry),events:entry.events});
      if(!entry.endedAt&&entry.socket)notifyWatchers(entry);
      broadcastList();
      return;
    }
    if(message.type==='unwatch'){stopWatching(socket);return;}
  };

  const attachAuthenticated=(socket,session)=>{
    const identity=sessionWatchIdentity(session);
    if(socket.requestedRole==='viewer'){
      if(!canWatchSessions(session)){
        send(socket,{type:'error',error:'Only administrators can watch live sessions.'});
        socket.close(4403,'forbidden');
        return;
      }
      socket.identity=identity;
      socket.watching=null;
      viewers.add(socket);
      send(socket,{type:'ready',role:'viewer'});
      send(socket,{type:'sessions',...snapshotList()});
      socket.on('message',(raw)=>{
        const message=parse(raw,limits);
        if(message)handleViewerMessage(socket,message);
      });
      socket.on('close',()=>{stopWatching(socket);viewers.delete(socket);});
      return;
    }
    idCounter+=1;
    const entry={
      id:`${now().toString(36)}-${idCounter.toString(36)}`,
      identity,
      socket,
      device:{type:'Unknown',platform:'Unknown',browser:'Unknown'},
      page:'',url:'',viewport:{width:0,height:0},
      startedAt:now(),lastSeenAt:now(),endedAt:null,
      events:[],bytes:0,
      watchers:new Set(),
    };
    socket.recording=entry;
    live.set(entry.id,entry);
    send(socket,{type:'ready',role:'recorder',sessionId:entry.id});
    socket.on('message',(raw)=>{
      const message=parse(raw,limits);
      if(message)handleRecorderMessage(socket,message);
    });
    socket.on('close',()=>endSession(entry));
    broadcastList();
  };

  const handleConnection=(socket)=>{
    socket.isAlive=true;
    socket.on('pong',()=>{socket.isAlive=true;});
    const authTimer=setTimeout(()=>{if(!socket.identity&&!socket.recording)socket.close(4401,'auth timeout');},10*1000);
    socket.once('message',async(raw)=>{
      clearTimeout(authTimer);
      const message=parse(raw,limits);
      if(!message||message.type!=='auth'){socket.close(4400,'auth required');return;}
      socket.requestedRole=message.role==='viewer'?'viewer':'recorder';
      let session=null;
      try{session=await authenticate(String(message.token||''));}
      catch(error){logger.error?.('Session watch authentication failed.',error);}
      if(!session){send(socket,{type:'error',error:'Your sign-in has expired. Please sign in again.'});socket.close(4401,'unauthorized');return;}
      attachAuthenticated(socket,session);
    });
    socket.on('error',()=>{});
  };

  const wss=new WebSocketServer({noServer:true,maxPayload:limits.maxEventBytes});
  wss.on('connection',handleConnection);
  const heartbeat=setInterval(()=>{
    for(const socket of wss.clients){
      if(socket.isAlive===false){socket.terminate();continue;}
      socket.isAlive=false;
      try{socket.ping();}catch{}
    }
  },limits.heartbeatMs);
  heartbeat.unref?.();

  return {
    attach(httpServer){
      httpServer.on('upgrade',(request,socket,head)=>{
        const pathname=new URL(request.url||'/','http://localhost').pathname;
        if(pathname!==SESSION_WATCH_PATH)return;
        wss.handleUpgrade(request,socket,head,(ws)=>wss.emit('connection',ws,request));
      });
      return httpServer;
    },
    handleConnection,
    sessions:snapshotList,
    close(){clearInterval(heartbeat);wss.close();},
  };
}

function parse(raw,limits){
  try{
    const text=typeof raw==='string'?raw:raw.toString('utf8');
    if(text.length>limits.maxEventBytes)return null;
    const message=JSON.parse(text);
    return message&&typeof message==='object'?message:null;
  }catch{return null;}
}
