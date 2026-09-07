import React from "react";

export default function FleetSiteBars({ site, axisMax, showBreakdown = false }) {
  return <span className="mine-fleet-site-bars">
    {[["equipment", "Equipment"], ["vehicles", "Vehicles"]].map(([key, label]) => {
      const count = showBreakdown ? site.breakdown[key] : site[key];
      return <span className={`mine-fleet-bar-column ${key}`} key={key}>
        <i className={`mine-fleet-bar ${key}${showBreakdown ? " breakdown" : ""}`} style={{ height: `${count / axisMax * 100}%` }} title={`${label}: ${count} ${showBreakdown ? "breakdown" : "total"}`}>
          <b className="mine-fleet-bar-count">{count.toLocaleString()}</b>
        </i>
      </span>;
    })}
  </span>;
}
