import React,{useCallback,useEffect,useState} from 'react';
import {fetchSignInLocationRequired,recordSignInLocation,signInLocationDone} from './sign-in-location.mjs';
import './sign-in-location-gate.css';

// Asks the server whether this sign-in must share its location (owner's rule,
// on hold since 15 Nov 2026 unless SIGN_IN_LOCATION_REQUIRED=1). When it must,
// the app stays closed until the browser answers and a Block keeps it closed;
// otherwise the app opens at once and the location is still asked and recorded.
export function useSignInLocationGate(token){
  const [state,setState]=useState(()=>({token,phase:signInLocationDone(token)?'open':'checking'}));
  const ask=useCallback(async()=>{
    if(!token)return;
    setState({token,phase:'asking'});
    const result=await recordSignInLocation(token);
    setState({token,phase:result.accepted===false?'refused':'open'});
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
  // A new sign-in (new token) is closed until its own answer arrives.
  const phase=!token?'open':state.token===token?state.phase:(signInLocationDone(token)?'open':'checking');
  return {phase,retry:ask};
}

export function SignInLocationScreen({gate,onSignOut}){
  if(gate.phase==='checking')return <main className="sign-in-location-screen"><section className="sign-in-location-card" aria-live="polite"><p>Opening…</p></section></main>;
  const refused=gate.phase==='refused';
  return <main className="sign-in-location-screen"><section className="sign-in-location-card" aria-live="polite">
    <h1>{refused?'Location is blocked':'Allow your location to continue'}</h1>
    {refused?<>
      <p>Pulse cannot open without your location. It is recorded at every sign-in, for attendance and security.</p>
      <ol>
        <li><b>Computer:</b> click the lock or settings icon at the left of the web address, set <b>Location</b> to <b>Allow</b>.</li>
        <li><b>Android phone:</b> tap the icon at the left of the address, then <b>Permissions → Location → Allow</b>. Keep the phone's Location switched on.</li>
        <li><b>iPhone / iPad:</b> Settings → Privacy &amp; Security → Location Services → turn it on and set Safari Websites (or Chrome) to <b>While Using</b>.</li>
      </ol>
      <p>Then press <b>Try again</b>.</p>
      <div className="sign-in-location-actions"><button type="button" className="primary" onClick={()=>void gate.retry()}>Try again</button>{onSignOut&&<button type="button" className="secondary" onClick={onSignOut}>Sign out</button>}</div>
    </>:<>
      <p>Your browser is asking for your location. Press <b>Allow</b> to open Pulse.</p>
      <p className="sign-in-location-note">It is recorded at every sign-in, for attendance and security.</p>
      {onSignOut&&<div className="sign-in-location-actions"><button type="button" className="secondary" onClick={onSignOut}>Sign out</button></div>}
    </>}
  </section></main>;
}
