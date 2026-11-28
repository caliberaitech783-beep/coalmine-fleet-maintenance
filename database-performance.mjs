import {createHash} from 'node:crypto';

// Do not log SQL text or bind values: both can contain credentials and user data.
export function observeDatabaseQueries(pool,{name,thresholdMs=1000,now=()=>performance.now(),log=event=>console.warn(JSON.stringify(event))}={}){
  const query=pool.query;
  pool.query=function(...args){
    const started=now(),waitingAtStart=pool.waitingCount||0;
    const text=typeof args[0]==='string'?args[0]:args[0]?.text||'';
    const record=error=>{
      const durationMs=now()-started;
      if(durationMs<thresholdMs)return;
      log({event:'slow_database_query',pool:name,queryId:createHash('sha256').update(text).digest('hex').slice(0,16),
        operation:/^\s*([a-z]+)/i.exec(text)?.[1]?.toUpperCase()||'UNKNOWN',
        durationMs:Math.round(durationMs),waitingAtStart,waitingAtEnd:pool.waitingCount||0,errorCode:error?.code||null});
    };
    const last=args.length-1;
    if(typeof args[last]==='function'){
      const callback=args[last];
      args[last]=function(error,...values){record(error);return callback.call(this,error,...values);};
    }else{
      try{
        const result=query.apply(this,args);
        if(result?.then)result.then(()=>record(),error=>record(error));
        return result;
      }catch(error){record(error);throw error;}
    }
    return query.apply(this,args);
  };
  return pool;
}

export function requestWorkDuration(durationMs,notificationWaitMs=0){
  return Math.max(0,durationMs-notificationWaitMs);
}
