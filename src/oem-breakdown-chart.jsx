import React from "react";
import "./oem-breakdown.css";

export default function OemBreakdownChart({ chart, from, to, error, onSelect, onReset }) {
  const inspect = (event, selection) => { event.stopPropagation(); onSelect(selection); };
  return <div className="mine-oem-dashboard" id="oem-breakdown-plot" aria-label="OEM breakdown dashboard">
    <div className="mine-oem-summary">
      <div><h3>Site-wise OEM breakdown</h3><p>{from || to ? "Fleet with a breakdown during the selected dates, including carried-over breakdowns." : "Current breakdown fleet across all selected sites."} Select a bar or OEM to view the complete list.</p></div>
      <div className="mine-oem-actions"><button type="button" className="secondary" onClick={onReset}>Reset filters</button><button type="button" className="secondary" onClick={event => inspect(event, {})}>View full list <b>{chart.rows.length.toLocaleString()}</b></button></div>
    </div>
    {error ? <p className="mine-oem-error" role="alert">{error}</p> : <>
      <div className="mine-oem-legend" aria-label="OEM breakdown totals">{chart.oems.filter((oem) => chart.rows.some((row) => row.oemKey === oem.key)).map((oem) => <button type="button" key={oem.key} onClick={event => inspect(event, { oem: oem.key })} aria-label={`${oem.label}: ${chart.rows.filter((row) => row.oemKey === oem.key).length} breakdown assets, view details`}><i style={{ background: oem.color }} /><span>{oem.label}</span><b>{chart.rows.filter((row) => row.oemKey === oem.key).length.toLocaleString()}</b></button>)}</div>
      {!chart.rows.length && <p className="mine-empty" role="status">No OEM breakdowns match the selected filters.</p>}
      <div className="mine-oem-chart-layout">
        <div className="mine-oem-axis" aria-hidden="true"><b>BD count</b>{chart.ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
        <div className="mine-oem-scroll" tabIndex="0" role="region" aria-label="Site-wise OEM chart, scroll horizontally for more sites">
          <div className="mine-oem-sites" style={{ minWidth: `${Math.max(1, chart.sites.length) * 130}px` }}>
            <div className="mine-oem-grid" aria-hidden="true">{chart.ticks.map((tick) => <i key={tick} />)}</div>
            {chart.sites.map((site) => <section className="mine-oem-site" key={`${site.region}:${site.name}`} aria-label={`${site.name} OEM breakdowns`}>
              <div className="mine-oem-bar-track">
                <div className="mine-oem-stack" style={{ height: `${site.total / chart.axisMax * 100}%` }}>
                  <button type="button" className="mine-oem-total" onClick={event => inspect(event, { site: site.name })} aria-label={`${site.name}: ${site.total} breakdown assets, view all OEMs`}>{site.total.toLocaleString()}</button>
                  {site.segments.map((segment) => <button type="button" key={segment.key} className="mine-oem-segment" style={{ height: `${segment.rows.length / site.total * 100}%`, background: segment.color }} title={`${site.name} · ${segment.label}: ${segment.rows.length} breakdown assets`} aria-label={`${site.name} · ${segment.label}: ${segment.rows.length} breakdown assets, view details`} onClick={event => inspect(event, { site: site.name, oem: segment.key })}>{segment.rows.length / chart.axisMax >= .07 && <b>{segment.rows.length}</b>}</button>)}
                </div>
              </div>
              <button type="button" className="mine-oem-site-label" onClick={event => inspect(event, { site: site.name })}><b>{site.name}</b><small>{site.region}</small></button>
            </section>)}
          </div>
        </div>
      </div>
      <div className="mine-fleet-chart-x">Region and site · Breakdown fleet by OEM</div>
    </>}
  </div>;
}
