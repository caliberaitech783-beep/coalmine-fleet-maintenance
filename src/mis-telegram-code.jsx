import React from 'react';
import {Send} from 'lucide-react';
import {readApiJson} from './api-response.mjs';
import './mis-telegram-code.css';

// MIS sign-in with a 6-digit code sent to the person's own Telegram chat with the Pulse bot,
// used in place of the password on the MIS sign-in page.
export async function requestMisTelegramCode({username,handoff,fetchImpl=fetch}){
  const response=await fetchImpl('/api/mis-login/telegram-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,...handoff})});
  return readApiJson(response,'Could not send the Telegram code.');
}
export async function verifyMisTelegramCode({requestToken,code,remember,handoff,fetchImpl=fetch}){
  const response=await fetchImpl('/api/mis-login/telegram-verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestToken,code,remember:remember===true,...handoff})});
  return readApiJson(response,'Could not sign in to MIS.');
}

export function MisTelegramCodeFields({code,onCodeChange,requested,sending,canSend,onSend}){
  return <>
    <label className="login-label" htmlFor="login-telegram-code">Telegram code</label>
    <div className="login-input">
      <Send aria-hidden="true" />
      <input id="login-telegram-code"
        value={code}
        onChange={event=>onCodeChange(event.target.value.replace(/\D/g,'').slice(0,6))}
        placeholder={requested?'Enter the 6-digit code':'Press "Send code" first'}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        disabled={!requested}
        required
      />
    </div>
    <button type="button" className="mis-telegram-send" onClick={onSend} disabled={!canSend||sending}>
      {sending?'Sending…':requested?'Send a new code':'Send code to my Telegram'}
    </button>
    <small className="mis-telegram-hint">The code goes to your own chat with the Pulse bot. Connect Telegram in Pulse first if you have not.</small>
  </>;
}

export function MisSignInMethodSwitch({codeMode,onChange}){
  return <button type="button" className="mis-signin-switch" onClick={()=>onChange(!codeMode)}>
    {codeMode?'Use my password instead':'Sign in with a Telegram code instead'}
  </button>;
}
