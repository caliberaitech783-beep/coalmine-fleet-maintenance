import { parseRequestTimelineTimestamp } from "../request-timeline.mjs";
import { displaySiteName } from "../region-scope.mjs";

export function hourlyBreakdownEvents(requests, hours, now = Date.now()) {
  const end = Number(now), start = end - hours * 3600000;
  if (!Number.isInteger(hours) || hours < 1 || hours > 10 || !Number.isFinite(end)) return [];
  return requests.flatMap((request, index) => [
    { direction: "In", value: request.start || request.startedAt || request.createdAt },
    { direction: "Out", value: request.closedAt },
  ].flatMap(({ direction, value }) => {
    const timestamp = parseRequestTimelineTimestamp(value)?.getTime();
    return timestamp != null && timestamp >= start && timestamp <= end ? [{
      key: `${request.ref || index}:${direction}`, site: displaySiteName(request.site || request.currentLocation) || "—",
      door: request.door || "—", direction, timestamp,
      startedAt: parseRequestTimelineTimestamp(request.start || request.startedAt || request.createdAt)?.getTime() ?? null,
      closedAt: parseRequestTimelineTimestamp(request.closedAt)?.getTime() ?? null,
    }] : [];
  })).sort((a, b) => b.timestamp - a.timestamp);
}

export function hourlyBreakdownView(requests, hours, site = "", now = Date.now(), availableSites = []) {
  const events = hourlyBreakdownEvents(requests, hours, now);
  const sites = [...new Set([...availableSites, ...requests.map(row => row.site || row.currentLocation || "—")].map(displaySiteName))].filter(Boolean).sort();
  site = displaySiteName(site);
  const siteCounts = sites.map(name => ({ site: name, count: events.filter(row => row.site === name).length }));
  const rows = site ? events.filter(row => row.site === site) : events;
  const hourCounts = Array.from({ length: 10 }, (_, index) => hourlyBreakdownEvents(requests, index + 1, now).filter(row => !site || row.site === site).length);
  return { rows, siteCounts, hourCounts, total: events.length };
}

export function breakdownElapsed(row, now = Date.now()) {
  if (row.startedAt == null) return "—";
  const end = row.closedAt ?? now;
  if (end < row.startedAt) return "—";
  const seconds = Math.floor((end - row.startedAt) / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
}

export function openHourlyBreakdownTab(requests) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) { window.alert("Please allow pop-ups to open the hourly breakdown report."); return; }
  tab.opener = null;
  const doc = tab.document, capturedAt = Date.now();
  const dark = document.documentElement.dataset.theme === "dark" || document.body.dataset.theme === "dark";
  doc.documentElement.dataset.theme = dark ? "dark" : "light";
  doc.title = "Hourly breakdown activity";
  const el = (tag, text, parent, className) => {
    const node = doc.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    parent?.appendChild(node);
    return node;
  };
  const format = value => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }).format(value);
  el("style", `:root{--bg:#faf5f9;--panel:#fff;--ink:#172b46;--muted:#7c7187;--line:#ead9ec;--soft:#f8f5fb;--purple:#56308f}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px system-ui,sans-serif}main{max-width:1800px;margin:24px auto;padding:20px}h1{font-size:28px;margin:0 0 12px}h2{font-size:18px;margin:0}p{color:var(--muted)}.panel{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:20px;margin-top:20px}.hours{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding-bottom:12px}.hours button{flex:1 0 106px}.sites{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:16px;margin-top:4px}.sites>span{color:var(--muted);font-weight:700;margin-right:20px}button{padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--soft);color:var(--purple);font:600 15px system-ui;white-space:nowrap;cursor:pointer}button:hover,button:focus-visible{outline:2px solid #b99ddd;outline-offset:1px}button[aria-pressed=true]{background:var(--purple);color:#fff}.count{display:inline-block;margin-left:8px;padding:3px 7px;border-radius:5px;background:#8055b52b;font-weight:800}button[aria-pressed=true] .count{background:#ffffff25}.heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--line)}.heading span{color:var(--muted)}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:16px;border-bottom:1px solid var(--line);white-space:nowrap}th{background:var(--soft);color:var(--muted);font-size:13px;text-transform:uppercase}.in{background:#fce0eb;color:#87244b}.out{background:#dcf4e4;color:#186738}.legend{font-size:13px;color:var(--muted)}[data-theme=dark]{--bg:#111827;--panel:#192235;--ink:#e5ebf5;--muted:#c0aecb;--line:#493b58;--soft:#252139;--purple:#9164cf;color-scheme:dark}@media(max-width:600px){main{margin:10px auto;padding:10px}.panel{padding:12px}.hours button{flex-basis:100px}th,td{padding:12px}}`, doc.head);
  const main = el("main", null, doc.body);
  el("h1", "Hourly breakdown activity", main);
  el("p", `Rolling windows ending ${format(capturedAt)} IST. Includes only your visible sites. Reopen this tab for updated data.`, main);
  const filters = el("section", null, main, "panel");
  const box = el("div", null, filters, "hours");
  box.setAttribute("aria-label", "Choose breakdown activity window");
  const sites = el("div", null, filters, "sites");
  sites.setAttribute("aria-label", "Filter breakdown activity by site");
  const report = el("section", null, main, "panel");
  report.setAttribute("aria-label", "Hourly breakdown report");
  report.setAttribute("aria-live", "polite");
  let selectedHours = 1, selectedSite = "";
  const hourButtons = [];
  const badge = (button, label, count) => {
    button.replaceChildren();
    el("span", label, button); el("span", String(count), button, "count");
  };
  const render = () => {
    const view = hourlyBreakdownView(requests, selectedHours, selectedSite, capturedAt);
    hourButtons.forEach((button, index) => {
      badge(button, `${index + 1} ${index ? "hours" : "hour"}`, view.hourCounts[index]);
      button.setAttribute("aria-pressed", String(selectedHours === index + 1));
    });
    sites.replaceChildren();
    el("span", "Site", sites);
    for (const option of [{ site: "", count: view.total }, ...view.siteCounts]) {
      const button = el("button", null, sites);
      button.type = "button";
      badge(button, option.site || "All sites", option.count);
      button.setAttribute("aria-pressed", String(selectedSite === option.site));
      button.onclick = () => { selectedSite = option.site; render(); };
    }
    report.replaceChildren();
    const heading = el("div", null, report, "heading");
    el("h2", `${selectedSite || "All sites"} · Last ${selectedHours} ${selectedHours === 1 ? "hour" : "hours"}`, heading);
    el("span", `${view.rows.length} events`, heading);
    el("p", "Counts include BD In and BD Out events. Pink: BD In · Green: BD Out", report, "legend");
    const table = el("table", null, el("div", null, report, "scroll"));
    const header = el("tr", null, el("thead", null, table));
    for (const label of ["Sites", "Door No", "In/Out", "BD Timing"]) el("th", label, header).scope = "col";
    const body = el("tbody", null, table);
    for (const row of view.rows) {
      const tr = el("tr", null, body);
      el("td", row.site, tr); el("td", row.door, tr); el("td", row.direction, tr);
      el("td", format(row.timestamp), tr, row.direction.toLowerCase());
    }
    if (!view.rows.length) el("td", "No breakdown activity in this time window.", el("tr", null, body)).colSpan = 4;
  };
  for (let hours = 1; hours <= 10; hours++) {
    const button = el("button", `${hours} ${hours === 1 ? "hour" : "hours"}`, box);
    button.type = "button";
    hourButtons.push(button);
    button.onclick = () => { selectedHours = hours; render(); };
  }
  render();
}
