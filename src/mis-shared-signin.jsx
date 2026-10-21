import {useEffect,useState} from 'react';
let configuration;
const config=()=>configuration||=(fetch('/api/mis-sso/config',{cache:'no-store'}).then(r=>r.ok?r.json():{mode:'off'}).catch(()=>{configuration=null;return {mode:'off'};}));

export function useMisSharedSignIn(session){
  const [status,setStatus]=useState({mode:'off',error:''});
  useEffect(()=>{
    let stopped=false;
    const start=async()=>{
      const {mode}=await config();if(stopped)return;
      setStatus({mode,error:''});
      const query=new URLSearchParams(window.location.search);
      if(mode==='issuer'&&session?.token){
        const response=await fetch('/api/mis-sso/remember',{method:'POST',headers:{Authorization:`Bearer ${session.token}`}});
        if(stopped||!response.ok)return;
        if(query.get('misSignIn')==='1'){
          const state=query.get('state'),challenge=query.get('code_challenge');
          if(!/^[A-Za-z0-9_-]{43}$/.test(state||'')||!/^[A-Za-z0-9_-]{43}$/.test(challenge||''))throw Error('Invalid MIS sign-in request.');
          window.location.replace('/api/mis-sso/authorize?'+new URLSearchParams({state,code_challenge:challenge}));
        }
      }
      if(mode==='client'&&!session?.token){
        if(query.get('misSsoReady')==='1'){
          const response=await fetch('/api/mis-sso/session',{cache:'no-store'});
          const result=await response.json();if(stopped)return;
          window.history.replaceState(null,'','/');
          if(!response.ok||!result.token)throw Error('Pulse sign-in could not be completed. Please retry.');
          window.dispatchEvent(new CustomEvent('mis-shared-signin',{detail:result}));
        }else window.location.replace('/api/mis-sso/start');
      }
    };
    void start().catch(()=>{if(!stopped)setStatus(current=>({...current,error:'Shared sign-in is temporarily unavailable. Please retry.'}));});
    return()=>{stopped=true;};
  },[session?.token]);
  return status;
}

export function MisSharedLogin({error}){
  return <main className="boot-status"><section className="boot-card"><h1>Caliber MIS</h1><p>{error||'Opening your Pulse sign-in…'}</p><a href="/api/mis-sso/start">Sign in with Pulse</a></section></main>;
}
