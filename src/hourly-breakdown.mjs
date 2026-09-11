import { parseRequestTimelineTimestamp } from "../request-timeline.mjs";

export function hourlyBreakdownEvents(requests, hours, now = Date.now()) {
  const end = Number(now), start = end - hours * 3600000;
  if (!Number.isInteger(hours) || hours < 1 || hours > 10 || !Number.isFinite(end)) return [];
  return requests.flatMap((request, index) => [
    { direction: "In", value: request.start || request.startedAt || request.createdAt },
    { direction: "Out", value: request.closedAt },
  ].flatMap(({ direction, value }) => {
    const timestamp = parseRequestTimelineTimestamp(value)?.getTime();
    return timestamp != null && timestamp >= start && timestamp <= end ? [{
      key: `${request.ref || index}:${direction}`, site: request.site || request.currentLocation || "—",
      door: request.door || "—", direction, timestamp,
    }] : [];
  })).sort((a, b) => b.timestamp - a.timestamp);
}

export function openHourlyBreakdownTab(requests) {
  const tab = window.open("about:blank", "_blank");
  if (!tab) { window.alert("Please allow pop-ups to open the hourly breakdown report."); return; }
  tab.opener = null;
  const doc = tab.document, capturedAt = Date.now();
  doc.title = "Hourly breakdown activity";
  const el = (tag, text, parent, className) => {
    const node = doc.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    parent?.appendChild(node);
    return node;
  };
  const format = value => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }).format(value);
  el("style", `*{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#172b46;font:16px system-ui,sans-serif}main{max-width:1150px;margin:40px auto;padding:24px}h1{font-size:28px}p{color:#63748b}.hours{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:24px;border:1px solid #d7dfee;border-radius:12px;background:white}button{padding:16px;border:1px solid #d5c9ed;border-radius:8px;background:#f5f0fc;color:#532e90;font:600 16px system-ui;cursor:pointer}button:hover,button:focus-visible{background:#e9defa}button[aria-pressed=true]{background:#532e90;color:white}dialog{width:min(900px,95vw);max-height:85vh;border:1px solid #d7dfee;border-radius:12px;padding:24px}dialog::backdrop{background:#172b4670}.heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #e0e5ef;white-space:nowrap}th{background:#f4f6fb}.in{background:#fce0eb;color:#87244b}.out{background:#dcf4e4;color:#186738}small{display:block;margin-top:8px;color:#63748b}@media(max-width:600px){main{margin:10px auto;padding:12px}.hours{grid-template-columns:repeat(2,minmax(0,1fr));padding:12px}dialog{padding:12px}}`, doc.head);
  const main = el("main", null, doc.body);
  el("h1", "Hourly breakdown activity", main);
  el("p", `Rolling windows ending ${format(capturedAt)} IST. Includes only your visible sites. Reopen this tab for updated data.`, main);
  const box = el("section", null, main, "hours");
  box.setAttribute("aria-label", "Choose breakdown activity window");
  const dialog = el("dialog", null, main);
  dialog.setAttribute("aria-label", "Hourly breakdown report");
  for (let hours = 1; hours <= 10; hours++) {
    const button = el("button", `${hours} ${hours === 1 ? "hour" : "hours"}`, box);
    button.type = "button";
    button.onclick = () => {
      for (const other of box.children) other.setAttribute("aria-pressed", String(other === button));
      dialog.replaceChildren();
      const heading = el("div", null, dialog, "heading");
      el("h2", `Last ${hours} ${hours === 1 ? "hour" : "hours"}`, heading);
      const close = el("button", "Close", heading); close.onclick = () => dialog.close();
      const rows = hourlyBreakdownEvents(requests, hours, capturedAt);
      el("p", `${rows.length} events · Pink: BD In · Green: BD Out`, dialog);
      const scroll = el("div", null, dialog, "scroll"), table = el("table", null, scroll);
      const header = el("tr", null, el("thead", null, table));
      for (const label of ["Sites", "Door No", "In/Out", "BD Timing"]) el("th", label, header).scope = "col";
      const body = el("tbody", null, table);
      for (const row of rows) {
        const tr = el("tr", null, body);
        el("td", row.site, tr); el("td", row.door, tr); el("td", row.direction, tr);
        el("td", format(row.timestamp), tr, row.direction.toLowerCase());
      }
      if (!rows.length) el("td", "No breakdown activity in this time window.", el("tr", null, body)).colSpan = 4;
      dialog.showModal();
    };
  }
}
