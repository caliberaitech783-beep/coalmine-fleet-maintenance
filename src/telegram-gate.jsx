import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Globe, LogOut, Send, Smartphone } from "lucide-react";
import { startVisiblePoll } from "./visible-poll.mjs";
import "./telegram-gate.css";
import TelegramSiteGroups from './telegram-site-groups.jsx';
import TelegramMembershipReport from './telegram-membership-report.jsx';

export const TELEGRAM_INSTALL_LINKS = {
  android: "https://play.google.com/store/apps/details?id=org.telegram.messenger",
  iphone: "https://apps.apple.com/app/telegram-messenger/id686449807",
  desktop: "https://desktop.telegram.org/",
  web: "https://web.telegram.org/",
};

export function telegramDevice(userAgent = "") {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iphone";
  return "desktop";
}

// Every signed-in user must verify membership in all allocated site groups.
export default function TelegramGate({ token, logout }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const [adminHelp,setAdminHelp]=useState(false);
  const wasBlocked=useRef(false);
  // A UI-only release can precede the server swap. Keep the prior connection
  // rule until the server returns its authoritative membership decision.
  const blocking = !state || (Object.hasOwn(state,'allowed') ? state.allowed!==true : Boolean(state.required&&!state.linked));
  useEffect(()=>{setState(null);wasBlocked.current=false;setAdminHelp(false);},[token]);
  useEffect(()=>{
    if(state?.allowed===false)wasBlocked.current=true;
    if(state?.allowed===true&&wasBlocked.current)window.location.reload();
  },[state?.allowed]);
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const check = () => fetch("/api/telegram/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {if(!response.ok)throw new Error();return response.json();})
      .then((result) => { if (active && result) setState(result); })
      .catch(() => {if(active){setState(previous=>({...previous,allowed:false}));setMessage('Membership could not be checked. Please retry.');}});
    check();
    // Every few seconds while blocked (to close as soon as Start is tapped), otherwise every minute.
    const stop = startVisiblePoll(check, blocking ? 3000 : 60000);
    return () => { active = false; stop(); };
  }, [token, blocking]);
  if (!blocking) return null;
  const device = telegramDevice(typeof navigator === "undefined" ? "" : navigator.userAgent);
  const connect = async () => {
    const tab = window.open("", "_blank");
    setMessage("");
    try {
      const response = await fetch("/api/telegram/link", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not start the Telegram connection.");
      if (tab) tab.location.href = result.url; else window.location.href = result.url;
      setMessage("Telegram is opening. Tap Start, then join every assigned site group below.");
    } catch (error) {
      tab?.close();
      setMessage(error.message);
    }
  };
  const install = device === "android"
    ? [["Install Telegram (Play Store)", TELEGRAM_INSTALL_LINKS.android, Smartphone]]
    : device === "iphone"
      ? [["Install Telegram (App Store)", TELEGRAM_INSTALL_LINKS.iphone, Smartphone]]
      : [["Download Telegram Desktop", TELEGRAM_INSTALL_LINKS.desktop, Download], ["Or use Telegram Web (no install)", TELEGRAM_INSTALL_LINKS.web, Globe]];
  return createPortal(<div className="telegram-gate-overlay">
    <section className="telegram-gate" role="alertdialog" aria-modal="true" aria-labelledby="telegram-gate-title">
      <header><span><Send /></span><div><small>Required for every user</small><h2 id="telegram-gate-title">Join your site Telegram groups to continue</h2></div></header>
      <div className="telegram-gate-body">
        <p>Connect your own Telegram account and join every required site group to receive updates and reports. Managers follow their managed sites or regions. Office accounts without a mine allocation must join all eight groups. Actual membership must be verified before Pulse access is allowed.</p>
        {!state&&<p role="status">Checking Telegram membership…</p>}
        <ol>
          <li><b>Install Telegram</b> and sign up with your mobile number. Skip this if you already have it.
            <div className="telegram-gate-links">{install.map(([label, href, Icon]) => <a key={href} href={href} target="_blank" rel="noreferrer"><Icon />{label}</a>)}</div>
          </li>
          <li><b>Connect</b> your Caliber Pulse login:
            <div className="telegram-gate-links"><button type="button" className="telegram-gate-connect" onClick={connect}><Send />Connect Telegram</button></div>
          </li>
          <li>In Telegram, tap <b>Start</b>. {state?.linked?'Your account is connected.':'Then return here to join your groups.'}</li>
          <li><b>Join all your assigned site groups:</b>
            {state?.groups?.map(group=><div key={group.site} className="telegram-gate-links"><span>{group.site} — {group.status}</span>{!group.joined&&<a href={group.inviteLink} target="_blank" rel="noreferrer">Join group</a>}</div>)}
            {state?.assignmentRequired&&<p role="alert">No recognized site is allocated to your account. Contact your administrator to correct your site allocation.</p>}
          </li>
        </ol>
        <button type="button" onClick={async()=>{
          setMessage('Verifying membership…');
          try{const response=await fetch('/api/telegram/me?verify=1',{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error();const result=await response.json();setState(result);setMessage(result.allowed?'Verified.':'Membership is still incomplete. Join all listed groups, or contact your administrator if verification is unavailable.');}catch{setMessage('Verification is unavailable. Please retry.');}
        }}>Verify and continue</button>
        {message && <p className="telegram-gate-message" role="status">{message}</p>}
        {state?.adminSetupAllowed&&<details onToggle={event=>setAdminHelp(event.currentTarget.open)}><summary>Administrator: membership report and group setup</summary>{adminHelp&&<><p>This provides Telegram setup and membership review only. Normal Pulse access still requires verified membership.</p><TelegramMembershipReport token={token}/><TelegramSiteGroups token={token}/></>}</details>}
      </div>
      <footer><span>Need help joining? Contact your site administrator.</span><button type="button" onClick={logout}><LogOut />Sign out</button></footer>
    </section>
  </div>, document.body);
}
