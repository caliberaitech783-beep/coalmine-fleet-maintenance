import React from "react";

export default function FleetSiteBars({ site, axisMax, showBreakdown = false }) {
  return <span className="mine-fleet-site-bars">
    {[["equipment", "Equipment"], ["vehicles", "Vehicles"]].map(([key, label]) => {
      const total = site[key];
      const breakdown = site.breakdown[key];
      const breakdownShare = total ? breakdown / total * 100 : 0;
      return <span className={`mine-fleet-bar-column ${key}`} key={key}>
        <i className={`mine-fleet-bar ${key}`} style={{ height: `${total / axisMax * 100}%` }} title={showBreakdown ? `${label}: ${total} total, ${breakdown} breakdown, ${total - breakdown} remaining` : `${label}: ${total} total`}>
          <b className="mine-fleet-bar-count">{total.toLocaleString()}</b>
          {showBreakdown && breakdown > 0 && <span className={`mine-fleet-breakdown-segment${breakdown / axisMax < 0.12 ? " small-segment" : ""}`} style={{ height: `${breakdownShare}%` }}>
            <b className="mine-fleet-breakdown-count">{breakdown.toLocaleString()}</b>
          </span>}
        </i>
      </span>;
    })}
  </span>;
}
