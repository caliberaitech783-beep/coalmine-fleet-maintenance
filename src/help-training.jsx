import React, {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {CheckCircle2, CircleHelp, Languages, PlayCircle, X} from "lucide-react";
import {userGuideStorageKey, userGuideVideo, userGuidesForRoles} from "./help-training.mjs";
import "./help-training.css";

export default function HelpTraining({role = "", roles = []}) {
  const guides = useMemo(() => userGuidesForRoles([role, ...(Array.isArray(roles) ? roles : [roles])]), [role, roles]);
  const [selectedRole, setSelectedRole] = useState("");
  const guide = guides.find((option) => option.role === selectedRole) || guides[0] || null;
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const [showCoachmark, setShowCoachmark] = useState(false);
  const closeButtonRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    if (!guide) return undefined;
    const storageKey = userGuideStorageKey(guide.role);
    let seen = false;
    try { seen = window.localStorage.getItem(storageKey) === "true"; } catch {}
    if (seen) return undefined;
    const timer = window.setTimeout(() => setShowCoachmark(true), 700);
    return () => window.clearTimeout(timer);
  }, [guide]);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    videoRef.current?.load();
  }, [guide?.role, language]);

  if (!guide) return null;

  const dismissCoachmark = () => {
    setShowCoachmark(false);
    try { window.localStorage.setItem(userGuideStorageKey(guide.role), "true"); } catch {}
  };
  const openGuide = () => {
    dismissCoachmark();
    setOpen(true);
  };
  const closeGuide = () => {
    videoRef.current?.pause();
    setOpen(false);
  };
  const videoSource = userGuideVideo(guide, language);

  return <>
    <span className="help-training-entry">
      <button type="button" className="help-training-trigger" onClick={openGuide} title="Open Help & Training" aria-label={`Open ${guide.title}`}>
        <CircleHelp aria-hidden="true" />
        <span>Help &amp; Training</span>
      </button>
      {showCoachmark && <span className="help-training-coachmark" role="status">
        <b>New to Nerve Center?</b>
        <small>Watch your short {guide.role.replace(" User", "")} guide in English or Hindi.</small>
        <span><button type="button" onClick={dismissCoachmark}>Not now</button><button type="button" className="primary" onClick={openGuide}><PlayCircle /> Watch guide</button></span>
      </span>}
    </span>
    {open && createPortal(<div className="help-training-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeGuide(); }}>
      <section className="help-training-dialog" role="dialog" aria-modal="true" aria-labelledby="help-training-title">
        <header>
          <span className="help-training-heading-icon"><CircleHelp /></span>
          <span><h2 id="help-training-title">{guide.title}</h2><p>Watch the complete role guide without leaving your workspace.</p></span>
          <div className="help-training-language" role="group" aria-label="Guide language">
            <Languages aria-hidden="true" />
            <button type="button" className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
            <button type="button" className={language === "hi" ? "active" : ""} aria-pressed={language === "hi"} onClick={() => setLanguage("hi")}>हिन्दी</button>
          </div>
          <button ref={closeButtonRef} type="button" className="help-training-close" onClick={closeGuide} aria-label="Close Help & Training"><X /></button>
        </header>
        {guides.length > 1 && <nav className="help-training-role-tabs" aria-label="Manager guide">
          {guides.map((option) => <button key={option.role} type="button" className={option.role === guide.role ? "active" : ""} aria-pressed={option.role === guide.role} onClick={() => setSelectedRole(option.role)}>{option.role}</button>)}
        </nav>}
        <div className="help-training-body">
          <aside>
            <small>{guide.role.toUpperCase()}</small>
            <h3>What this guide covers</h3>
            <ul>{guide.topics.map((topic) => <li key={topic}><CheckCircle2 /><span>{topic}</span></li>)}</ul>
            <div className="help-training-audio"><Languages /><span><b>{language === "hi" ? "हिन्दी वीडियो" : "English video"}</b><small>{language === "hi" ? "सरल भारतीय हिन्दी" : "Clear Indian English"}</small></span></div>
          </aside>
          <div className="help-training-player">
            <div><span>NOW PLAYING</span><b>{language === "hi" ? `${guide.role} गाइड` : `${guide.role} guide`}</b></div>
            <video ref={videoRef} key={videoSource} controls controlsList="nodownload" preload="metadata" playsInline>
              <source src={videoSource} type="video/mp4" />
              Your browser does not support the training video.
            </video>
            <p>Use play, pause, volume and full-screen controls as needed. You can switch language at any time.</p>
          </div>
        </div>
      </section>
    </div>, document.body)}
  </>;
}

