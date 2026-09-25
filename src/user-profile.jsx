import React, { useEffect, useRef, useState, useId } from "react";
import { Send, UserRound } from "lucide-react";
import "./user-profile.css";

// Links this login to the user's Telegram so they receive their alerts there.
// The server issues a one-time link; tapping Start in Telegram completes it.
function TelegramConnect({ token }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState("");
  const headers = { Authorization: `Bearer ${token}` };
  const load = () => fetch("/api/telegram/me", { headers })
    .then((response) => response.ok ? response.json() : null)
    .then(setState).catch(() => setState(null));
  useEffect(() => { if (token) load(); }, [token]);
  if (!state?.available) return null;
  const connect = async () => {
    // Open the tab inside the click so pop-up blockers allow it.
    const tab = window.open("", "_blank");
    setMessage("");
    try {
      const response = await fetch("/api/telegram/link", { method: "POST", headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not start the Telegram connection.");
      if (tab) tab.location.href = result.url; else window.location.href = result.url;
      setMessage("In Telegram, tap Start. Then reopen this panel to see Connected.");
    } catch (error) {
      tab?.close();
      setMessage(error.message);
    }
  };
  const disconnect = async () => {
    await fetch("/api/telegram/link", { method: "DELETE", headers }).catch(() => null);
    load();
  };
  return <div className="user-profile-telegram">
    <span className="telegram-label">Telegram alerts</span>
    <strong className="telegram-state">{state.linked ? `Connected${state.username ? ` (@${state.username})` : ""}` : "Not connected"}</strong>
    {state.linked
      ? <button type="button" className="telegram-disconnect" onClick={disconnect}>Disconnect</button>
      : <button type="button" className="telegram-connect" onClick={connect}><Send />Connect Telegram</button>}
    {message && <small role="status">{message}</small>}
  </div>;
}

export default function UserProfile({ session, role, location, apiToken }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div className="user-profile" ref={root}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="header-login-icon" aria-label="Show my user details"
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}><UserRound /></button>
    {open && <section id={id} className="user-profile-panel" aria-label="My user details">
      <strong>User details</strong>
      <dl>{[["Name", session?.name], ["Username", session?.login], ["Role", role], ["Location", location || session?.location]].map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value || "Not assigned"}</dd></div>)}</dl>
      <TelegramConnect token={apiToken} />
      <button type="button" onClick={() => setOpen(false)}>Close</button>
    </section>}
  </div>;
}
