import React,{useCallback,useEffect,useRef,useState} from 'react';
import {fetchSignInLocationRequired,recordSignInLocation,signInLocationDone,forgetSignInLocation,SIGN_IN_LOCATION_REQUIRED_EVENT} from './sign-in-location.mjs';
import './sign-in-location-gate.css';

/**
 * Which screen follows an answer. A refusal keeps the app closed. When the server
 * could not be asked (accepted null) the app opens as before, unless the server has
 * already refused this sign-in with 428: then it stays on the location screen with
 * Try again, so a failing report cannot bounce between the app and this screen.
 */
export function signInLocationPhase(accepted,{held=false}={}){
  if(accepted===false)return 'refused';
  if(accepted===null&&held)return 'unconfirmed';
  return 'open';
}

// Asks the server whether this sign-in must share its location (owner's rule,
// on hold since 15 Nov 2026 unless SIGN_IN_LOCATION_REQUIRED=1). When it must,
// the app stays closed until the browser answers and a Block keeps it closed;
// otherwise the app opens at once and the location is still asked and recorded.
// If the server later answers 428 (a tab opened on an older page, or a report
// that never arrived), the app comes back here and asks again.
export function useSignInLocationGate(token){
  const [state,setState]=useState(()=>({token,phase:signInLocationDone(token)?'open':'checking'}));
  const held=useRef({token:'',value:false});
  const busy=useRef(false);
  const ask=useCallback(async()=>{
    if(!token||busy.current)return;
    busy.current=true;
    setState({token,phase:'asking'});
    try{
      const result=await recordSignInLocation(token);
      setState({token,phase:signInLocationPhase(result.accepted,{held:held.current.token===token&&held.current.value})});
    }finally{busy.current=false;}
  },[token]);
  useEffect(()=>{
    if(!token)return undefined;
    if(signInLocationDone(token)){setState({token,phase:'open'});return undefined;}
    let active=true;
    setState({token,phase:'checking'});
    void fetchSignInLocationRequired(token).then(required=>{
      if(!active)return;
      if(required===true){void ask();return;}
      // Not required (or the server could not say): open now, record in the background.
      setState({token,phase:'open'});
      void recordSignInLocation(token);
    });
    return()=>{active=false;};
  },[token,ask]);
  useEffect(()=>{
    if(!token||typeof window==='undefined')return undefined;
    const onHold=event=>{
      if(event?.detail?.token!==token)return;
      held.current={token,value:true};
      forgetSignInLocation(token);
      void ask();
    };
    window.addEventListener(SIGN_IN_LOCATION_REQUIRED_EVENT,onHold);
    return ()=>window.removeEventListener(SIGN_IN_LOCATION_REQUIRED_EVENT,onHold);
  },[token,ask]);
  // A new sign-in (new token) is closed until its own answer arrives.
  const phase=!token?'open':state.token===token?state.phase:(signInLocationDone(token)?'open':'checking');
  return {phase,retry:ask};
}

export function SignInLocationScreen({gate,onSignOut}){
  if(gate.phase==='checking')return <main className="sign-in-location-screen"><section className="sign-in-location-card" aria-live="polite"><p>Opening…</p></section></main>;
  const refused=gate.phase==='refused';
  const unconfirmed=gate.phase==='unconfirmed';
  const actions=<div className="sign-in-location-actions"><button type="button" className="primary" onClick={()=>void gate.retry()}>Try again</button>{onSignOut&&<button type="button" className="secondary" onClick={onSignOut}>Sign out</button>}</div>;
  return <main className="sign-in-location-screen"><section className="sign-in-location-card" aria-live="polite">
    <h1>{refused?'Location is blocked':unconfirmed?'Location not confirmed yet':'Allow your location to continue'}</h1>
    {refused?<>
      <p>Pulse cannot open without your location. It is recorded at every sign-in, for attendance and security.</p>
      <ol>
        <li><b>Computer:</b> click the lock or settings icon at the left of the web address, set <b>Location</b> to <b>Allow</b>. On Windows also turn on Settings → Privacy &amp; security → <b>Location services</b>.</li>
        <li><b>Android phone:</b> tap the icon at the left of the address, then <b>Permissions → Location → Allow</b>. Keep the phone's Location switched on.</li>
        <li><b>iPhone / iPad:</b> Settings → Privacy &amp; Security → Location Services → turn it on and set Safari Websites (or Chrome) to <b>While Using</b>.</li>
      </ol>
      <p>Then press <b>Try again</b>.</p>
      {actions}
    </>:unconfirmed?<>
      <p>Pulse could not save your location for this sign-in. Check the internet connection and press <b>Try again</b>.</p>
      <p className="sign-in-location-note">It is recorded at every sign-in, for attendance and security.</p>
      {actions}
    </>:<>
      <p>Your browser is asking for your location. Press <b>Allow</b> to open Pulse.</p>
      <p className="sign-in-location-note">It is recorded at every sign-in, for attendance and security.</p>
      {onSignOut&&<div className="sign-in-location-actions"><button type="button" className="secondary" onClick={onSignOut}>Sign out</button></div>}
    </>}
  </section></main>;
}
