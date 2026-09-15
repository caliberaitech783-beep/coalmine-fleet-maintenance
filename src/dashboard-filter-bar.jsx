import React, { useEffect, useRef } from "react";
import "./dashboard-filter-bar.css";

export default function DashboardFilterBar({ children, inDialog = false, bannerRef }) {
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
  return <header ref={ref} className={`mine-dashboard-head dashboard-filter-bar${inDialog ? " in-dialog" : ""}`}>
    <div><img className="mine-brandmark" src="/caliber-logo-reverse.png" alt="Caliber Mining and Logistics" /><div><span className="mine-eyebrow">Mining operations</span><h1>Fleet control dashboard</h1><p>Maintenance, availability and site performance command center.</p></div></div>
    <div className="mine-head-actions">{children}</div>
  </header>;
}
