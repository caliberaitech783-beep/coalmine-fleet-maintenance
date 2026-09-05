import React from "react";

export default function FleetSiteBars({ site, axisMax, breakdownOnly = false }) {
  return <span className="mine-fleet-site-bars">
    {[["equipment", "Equipment"], ["vehicles", "Vehicles"]].map(([key, label]) => {
      const total = site[key];
      const breakdown = site.breakdown[key];
      const count = breakdownOnly ? breakdown : total;
      const breakdownShare = count ? breakdown / count * 100 : 0;
      return <span className={`mine-fleet-bar-column ${key}`} key={key}>
        <i className={`mine-fleet-bar ${key}${breakdownOnly ? " breakdown-only" : ""}`} style={{ height: `${count / axisMax * 100}%` }} title={breakdownOnly ? `${label}: ${breakdown} breakdown` : `${label}: ${total} total, ${breakdown} breakdown, ${total - breakdown} remaining`}>
          <b className="mine-fleet-bar-count">{count.toLocaleString()}</b>
          {breakdown > 0 && <span className={`mine-fleet-breakdown-segment${breakdown / axisMax < 0.12 ? " small-segment" : ""}`} style={{ height: `${breakdownShare}%` }}>
            {!breakdownOnly && <b className="mine-fleet-breakdown-count">{breakdown.toLocaleString()}</b>}
          </span>}
        </i>
      </span>;
    })}
  </span>;
}
