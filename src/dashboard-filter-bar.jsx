import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./dashboard-filter-bar.css";

// collapsedAction: shown beside the eye toggle while the banner is collapsed (the whole-dashboard Export).
export default function DashboardFilterBar({ children, inDialog = false, bannerRef, collapsedAction = null }) {
  const [collapsed, setCollapsed] = useState(false);
  const localRef = useRef(null);
  const ref = bannerRef || localRef;
  useEffect(() => {
    if (inDialog) return;
    const headers = [...document.querySelectorAll('.top, .normal > header')];
    const update = () => {
      const bottom = headers.reduce((bottom, header) => {
        const style = getComputedStyle(header);
        return ["sticky", "fixed"].includes(style.position)
          ? Math.max(bottom, (parseFloat(style.top) || 0) + header.getBoundingClientRect().height) : bottom;
      }, 0);
      ref.current?.style.setProperty("--dashboard-sticky-top", `${bottom}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    headers.forEach(header => observer.observe(header));
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [inDialog]);
  return <header ref={ref} data-collapsed={!inDialog && collapsed ? "true" : undefined} className={`mine-dashboard-head dashboard-filter-bar${inDialog ? " in-dialog" : ""}`}>
    <div><img className="mine-brandmark" src="/caliber-logo-reverse.png" alt="Caliber Mining and Logistics" /><div><span className="mine-eyebrow">Mining operations</span><h1>Fleet control dashboard</h1></div></div>
    <div className="mine-head-actions">{children}</div>
    {!inDialog && collapsed && collapsedAction && <span className="dashboard-banner-action">{collapsedAction}</span>}
    {!inDialog && <button type="button" className="dashboard-banner-toggle" aria-expanded={!collapsed} aria-label={collapsed ? "Show dashboard banner" : "Hide dashboard banner"} title={collapsed ? "Show dashboard banner" : "Hide dashboard banner"} onClick={() => setCollapsed(value => !value)}>{collapsed ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>}
  </header>;
}
