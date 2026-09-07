import { breakdownOpenedDate, breakdownClosedDate, normalizedBreakdownType } from "../dashboard-breakdown-movement.mjs";

const controls = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [contenteditable="true"]';

// A card's background opens its full list; its controls and nested selections
// keep their own action, including when SVG/text inside a control is clicked.
export function dashboardListTrigger(open, key, label, enabled = true, role = "button", hit = null) {
  const activate = (event) => {
    if (!enabled || event.defaultPrevented) return;
    const surface = event.currentTarget;
    const target = event.target;
    if (target.closest("[data-dashboard-list]") !== surface) return;
    const control = target.closest(controls);
    if (control && control !== surface && surface.contains(control)) return;
    event.stopPropagation();
    open(hit && !target.closest(hit.selector) ? hit.backgroundKey : key);
  };
  return {
    "data-dashboard-list": key,
    "aria-label": label,
    role,
    tabIndex: enabled ? 0 : -1,
    onClick: activate,
    onKeyDown: (event) => {
      if (!enabled || event.defaultPrevented || event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      open(key);
    },
  };
}

export function movementRequestRows(records, start, end, metric = "all", type = "") {
  if (!start || !end || start > end) return [];
  return records.filter((record) => {
    const opened = breakdownOpenedDate(record), closed = breakdownClosedDate(record);
    if (!opened || (type && normalizedBreakdownType(record.category || record.repairType || record.type) !== type)) return false;
    if (metric === "open") return opened < start && (!closed || closed >= start);
    if (metric === "incoming") return opened >= start && opened <= end;
    if (metric === "outgoing") return closed >= start && closed <= end;
    if (metric === "balance") return opened <= end && (!closed || closed > end);
    return metric === "all" && opened <= end && (!closed || closed >= start);
  });
}

export function allLifecycleRequestRows(events, dateOf, date = "") {
  return [...new Set(Object.entries(events).flatMap(([event, rows]) => date ? rows.filter((record) => dateOf(record, event) === date) : rows))];
}

export function recordedTrendRows(records, days, dateOf, date = "") {
  const dates = new Set(days.filter((day) => day.kind === "actual").map((day) => day.date));
  return records.filter((record) => dates.has(dateOf(record)) && (!date || dateOf(record) === date));
}

export function forecastBasisRows(records, anchor, dateOf) {
  const start = new Date(`${anchor}T12:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  start.setDate(start.getDate() - 55);
  const firstDay = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  return records.filter((record) => dateOf(record) >= firstDay && dateOf(record) <= anchor);
}
