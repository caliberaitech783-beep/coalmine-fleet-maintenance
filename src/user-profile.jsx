import React, { useEffect, useRef, useState, useId } from "react";
import { UserRound } from "lucide-react";
import "./user-profile.css";

export default function UserProfile({ session, role, location }) {
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
      <button type="button" onClick={() => setOpen(false)}>Close</button>
    </section>}
  </div>;
}
