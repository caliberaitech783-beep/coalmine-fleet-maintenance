import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Globe, LogOut, Send, Smartphone } from "lucide-react";
import { startVisiblePoll } from "./visible-poll.mjs";
import "./telegram-gate.css";

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

// When an administrator requires Telegram, a signed-in user who has not
// connected it (or who blocked the bot, which disconnects them) cannot use the
// app until they connect. Exempt users and a switched-off requirement never see it.
export default function TelegramGate({ token, logout }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const blocking = Boolean(state?.required && !state?.linked);
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    const check = () => fetch("/api/telegram/me", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.json() : null)
      .then((result) => { if (active && result) setState(result); })
      .catch(() => {});
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
      setMessage("Telegram is opening. Tap Start there. This screen closes by itself once you are connected.");
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
      <header><span><Send /></span><div><small>Required by your administrator</small><h2 id="telegram-gate-title">Connect Telegram to continue</h2></div></header>
      <div className="telegram-gate-body">
        <p>Nerve Center alerts, reports and password OTPs are sent on Telegram. Connect once to keep using the app.</p>
        <ol>
          <li><b>Install Telegram</b> and sign up with your mobile number. Skip this if you already have it.
            <div className="telegram-gate-links">{install.map(([label, href, Icon]) => <a key={href} href={href} target="_blank" rel="noreferrer"><Icon />{label}</a>)}</div>
          </li>
          <li><b>Connect</b> your Nerve Center login:
            <div className="telegram-gate-links"><button type="button" className="telegram-gate-connect" onClick={connect}><Send />Connect Telegram</button></div>
          </li>
          <li>In Telegram, tap <b>Start</b>. This screen closes automatically.</li>
        </ol>
        {message && <p className="telegram-gate-message" role="status">{message}</p>}
      </div>
      <footer><span>Cannot use Telegram? Ask your administrator for an exemption.</span><button type="button" onClick={logout}><LogOut />Sign out</button></footer>
    </section>
  </div>, document.body);
}
