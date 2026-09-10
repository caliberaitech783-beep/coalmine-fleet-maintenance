import React from "react";
import { fleetBarHeightPercent } from "./fleet-bar-scale.mjs";

const nonNegativeCount = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export default function FleetSiteBars({ site, axisMax, showBreakdown = false, breakdownScaleMax = 25 }) {
  return <span className="mine-fleet-site-bars">
    {[["equipment", "Equipment"], ["vehicles", "Vehicles"]].map(([key, label]) => {
      const total = nonNegativeCount(site?.[key]);
      // These segments represent physical assets, so they cannot exceed the
      // registered total even if an older caller sends request-case counts.
      const breakdown = Math.min(total, nonNegativeCount(site?.breakdown?.[key]));
      const scale = Math.max(1, nonNegativeCount(axisMax), total);
      const totalHeight = fleetBarHeightPercent(total, scale, showBreakdown, breakdownScaleMax);
      const breakdownHeight = fleetBarHeightPercent(breakdown, scale, showBreakdown, breakdownScaleMax);
      const breakdownShare = totalHeight ? breakdownHeight / totalHeight * 100 : 0;
      return <span className={`mine-fleet-bar-column ${key}`} key={key}>
        <i className={`mine-fleet-bar ${key}`} style={{ height: `${totalHeight}%` }} title={showBreakdown ? `${label}: ${total} total, ${breakdown} breakdown, ${total - breakdown} remaining` : `${label}: ${total} total`}>
          <b className="mine-fleet-bar-count">{total.toLocaleString()}</b>
          {showBreakdown && breakdown > 0 && <span className={`mine-fleet-breakdown-segment${breakdown / scale < 0.12 ? " small-segment" : ""}${breakdown < total ? " partial-segment" : ""}`} style={{ height: `${breakdownShare}%` }}>
            <b className="mine-fleet-breakdown-count">{breakdown.toLocaleString()}</b>
          </span>}
        </i>
      </span>;
    })}
  </span>;
}
