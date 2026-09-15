import React from "react";
import { createPortal } from "react-dom";
import "./oem-breakdown.css";

const PLOT_HEIGHT = 260;

const tooltipAttributes = (id, oem, count, site) => ({
  "data-oem-tooltip": id,
  "data-oem-name": oem.label,
  "data-oem-color": oem.color,
  "data-oem-count": count,
  "data-oem-site": site,
  "aria-describedby": id,
});

function allOemsSummary(oems) {
  const colors = [...new Set(oems.map(oem => oem.color))];
  return {
    label: "All OEMs",
    color: colors.length > 1 ? `linear-gradient(90deg, ${colors.map((color, index) => `${color} ${index / colors.length * 100}% ${(index + 1) / colors.length * 100}%`).join(", ")})` : colors[0] || "#64748b",
  };
}

// Keep the tooltip outside the scrolling plot so edge sites and tiny segments
// get the same readable details without enlarging their coloured hit targets.
function OemChartSurface({ chart, children }) {
  const [tooltip, setTooltip] = React.useState(null);
  const candidates = React.useRef({ hover: null, focus: null });
  const tooltipRef = React.useRef(null);
  const update = (kind, target) => {
    candidates.current[kind] = target;
    const anchor = target || candidates.current.hover || candidates.current.focus;
    setTooltip(current => current?.anchor === anchor ? current : anchor ? { anchor, ...anchor.dataset } : null);
  };
  const targetOf = event => event.target.closest?.("button[data-oem-tooltip]");

  React.useEffect(() => {
    const dismiss = () => { candidates.current = { hover: null, focus: null }; setTooltip(null); };
    const onKeyDown = event => { if (event.key === "Escape") dismiss(); };
    dismiss();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [chart]);

  React.useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const anchor = tooltip.anchor.getBoundingClientRect();
    const popup = tooltipRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - popup.width / 2, window.innerWidth - popup.width - 8));
    const above = anchor.top - popup.height - 8;
    const top = Math.max(8, Math.min(above >= 8 ? above : anchor.bottom + 8, window.innerHeight - popup.height - 8));
    tooltipRef.current.style.left = `${left}px`;
    tooltipRef.current.style.top = `${top}px`;
  }, [tooltip]);

  return <div className="mine-oem-dashboard" id="oem-breakdown-plot" aria-label="OEM breakdown dashboard" style={{ "--mine-oem-plot-height": `${PLOT_HEIGHT}px` }}
    onMouseOver={event => update("hover", targetOf(event))}
    onMouseOut={event => { if (!targetOf(event)?.contains(event.relatedTarget)) update("hover", null); }}
    onFocus={event => update("focus", targetOf(event))}
    onBlur={event => { if (!targetOf(event)?.contains(event.relatedTarget)) update("focus", null); }}>
    {children}
    {tooltip && createPortal(<div ref={tooltipRef} className="mine-oem-tooltip" id={tooltip.oemTooltip} role="tooltip">
      <div className="mine-oem-tooltip-heading"><i aria-hidden="true" style={{ background: tooltip.oemColor }} /><strong>{tooltip.oemName}</strong></div>
      <div className="mine-oem-tooltip-count"><b>{Number(tooltip.oemCount).toLocaleString()}</b> breakdown {Number(tooltip.oemCount) === 1 ? "asset" : "assets"}</div>
      <div className="mine-oem-tooltip-site">{tooltip.oemSite}</div>
    </div>, document.body)}
  </div>;
}

export default function OemBreakdownChart({ chart, from, to, error, onSelect, onReset }) {
  const inspect = (event, selection) => { event.stopPropagation(); onSelect(selection); };
  const oemTotals = new Map();
  chart.rows.forEach(row => oemTotals.set(row.oemKey, (oemTotals.get(row.oemKey) || 0) + 1));
  const visibleOems = chart.oems.filter(oem => oemTotals.has(oem.key));
  const hasOemFilter = Boolean(chart.selectedOem && chart.selectedOem !== "all");
  const selectedOem = hasOemFilter ? chart.oems.find(oem => oem.key === chart.selectedOem) || { label: chart.selectedOem, color: "#64748b" } : null;
  const totalOem = selectedOem || allOemsSummary(visibleOems);
  const siteScope = chart.sites.length === 1 ? chart.sites[0].name : "Sites matching current filters";
  return <OemChartSurface chart={chart}>
    <div className="mine-oem-summary">
      <div><h3>Site-wise OEM breakdown</h3><p>{from || to ? "Fleet with a breakdown during the selected dates, including carried-over breakdowns." : "Current breakdown fleet across all selected sites."} Select a segment, site total or OEM to view details. Hover or focus a segment, legend entry or total for its name and count.</p></div>
      <div className="mine-oem-actions"><button type="button" className="secondary" onClick={event => { event.stopPropagation(); onReset?.(); }}>Reset filters</button><button type="button" className="secondary" title="View all breakdown assets matching the current dashboard filters" {...tooltipAttributes("oem-breakdown-tooltip-full-list", totalOem, chart.rows.length, siteScope)} onClick={event => inspect(event, {})}>View full list <b>{chart.rows.length.toLocaleString()}</b></button></div>
    </div>
    {error ? <p className="mine-oem-error" role="alert">{error}</p> : <>
      <div className="mine-oem-legend" aria-label="OEM breakdown totals">
        {visibleOems.map((oem, index) => <button type="button" key={oem.key} {...tooltipAttributes(`oem-breakdown-tooltip-legend-${index}`, oem, oemTotals.get(oem.key), siteScope)} onClick={event => inspect(event, { oem: oem.key })} aria-label={`${oem.label}: ${oemTotals.get(oem.key)} breakdown assets, view details`}><i aria-hidden="true" style={{ background: oem.color }} /><span>{oem.label}</span><b>{oemTotals.get(oem.key).toLocaleString()}</b></button>)}
        <button type="button" className="mine-oem-all" title="Open the full list with the current dashboard filters" {...tooltipAttributes("oem-breakdown-tooltip-all", totalOem, chart.rows.length, siteScope)} aria-label={`All total breakdown: ${chart.rows.length} breakdown assets, view full list with current filters`} onClick={event => inspect(event, {})}><span>All total breakdown</span><b>{chart.rows.length.toLocaleString()}</b></button>
      </div>
      {!chart.rows.length && <p className="mine-empty" role="status">No OEM breakdowns match the selected filters.</p>}
      <div className="mine-oem-chart-layout">
        <div className="mine-oem-axis" aria-hidden="true"><b>BD count</b>{chart.ticks.map((tick) => <span key={tick}>{tick}</span>)}</div>
        <div className="mine-oem-scroll" tabIndex="0" role="region" aria-label="Site-wise OEM chart, scroll horizontally for more sites">
          <div className="mine-oem-sites" style={{ minWidth: `${Math.max(1, chart.sites.length) * 144}px` }}>
            <div className="mine-oem-grid" aria-hidden="true">{chart.ticks.map((tick) => <i key={tick} />)}</div>
            {chart.sites.map((site, siteIndex) => <section className="mine-oem-site" key={`${site.region}:${site.name}`} aria-label={`${site.name} OEM breakdowns`}>
              <div className="mine-oem-bar-track">
                <div className="mine-oem-stack" style={{ height: `${site.total / chart.axisMax * 100}%` }}>
                  <button type="button" className="mine-oem-total" title={`${site.name}: view ${site.total.toLocaleString()} ${selectedOem ? `${selectedOem.label} ` : ""}breakdown assets`} {...tooltipAttributes(`oem-breakdown-tooltip-total-${siteIndex}`, selectedOem || allOemsSummary(site.segments), site.total, site.name)} onClick={event => inspect(event, { site: site.name })} aria-label={`${site.name}: ${site.total} breakdown assets, ${hasOemFilter ? "view details" : "view all OEMs"}`}><b>{site.total.toLocaleString()}</b></button>
                  {site.segments.map((segment, segmentIndex) => {
                    const height = segment.rows.length / chart.axisMax * PLOT_HEIGHT;
                    const tooltipId = `oem-breakdown-tooltip-${siteIndex}-${segmentIndex}`;
                    return <button type="button" key={segment.key} className="mine-oem-segment" style={{ height: `${segment.rows.length / site.total * 100}%`, background: segment.color }}
                      {...tooltipAttributes(tooltipId, segment, segment.rows.length, site.name)}
                      aria-label={`${site.name} · ${segment.label}: ${segment.rows.length} breakdown assets, view details`}
                      onClick={event => inspect(event, { site: site.name, oem: segment.key })}>
                      {height >= 20 && <span className="mine-oem-segment-label" aria-hidden="true"><span>{segment.label}</span>{height >= 36 && <b>{segment.rows.length.toLocaleString()}</b>}</span>}
                    </button>;
                  })}
                </div>
              </div>
              <div className="mine-oem-site-caption"><button type="button" className="mine-oem-site-label" title={`${site.name}: ${selectedOem ? `view ${selectedOem.label} breakdown details` : "view all OEM breakdowns"}`} {...tooltipAttributes(`oem-breakdown-tooltip-site-${siteIndex}`, selectedOem || allOemsSummary(site.segments), site.total, site.name)} onClick={event => inspect(event, { site: site.name })}><b>{site.name}</b><small>{site.region}</small></button></div>
            </section>)}
          </div>
        </div>
      </div>
      <div className="mine-fleet-chart-x">Region and site · Breakdown fleet by OEM</div>
    </>}
  </OemChartSurface>;
}
