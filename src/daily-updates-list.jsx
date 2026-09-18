import React, { useSyncExternalStore } from "react";
import { DAILY_UPDATES_ORDERS, DEFAULT_DAILY_UPDATES_ORDER, dailyUpdatesCountLabel, readDailyUpdatesOrder, sortDailyUpdates, storeDailyUpdatesOrder } from "./daily-updates-order.mjs";
import { formatDisplayDateTime } from "../date-time-format.mjs";

// The order is one app-wide preference: switching it in any open list switches every list at once.
const listeners = new Set();
const storage = () => (typeof localStorage === "undefined" ? null : localStorage);
const subscribe = (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const currentOrder = () => readDailyUpdatesOrder(storage());
const serverOrder = () => DEFAULT_DAILY_UPDATES_ORDER;

export function setDailyUpdatesOrder(order) {
  storeDailyUpdatesOrder(storage(), order);
  listeners.forEach((listener) => listener());
}

export function useDailyUpdatesOrder() {
  return useSyncExternalStore(subscribe, currentOrder, serverOrder);
}

// The panel shows about this many updates before it scrolls (max-height in daily-updates.css).
const UPDATES_BEFORE_SCROLL = 3;

export default function DailyUpdatesList({ remarks = [], category = "", formatDateTime = formatDisplayDateTime }) {
  const order = useDailyUpdatesOrder();
  const updates = sortDailyUpdates(remarks, order);
  if (!updates.length) return "—";
  const latest = updates.find((update) => update.ordinal === updates.length);
  const countLabel = dailyUpdatesCountLabel(updates.length);
  return <details className="daily-remarks" data-order={order}>
    <summary><b>{countLabel}</b><small>Latest {formatDateTime(latest.createdAt)}</small></summary>
    <div className="daily-remarks-panel">
      <div className="daily-remarks-order" role="group" aria-label="Order of daily updates">
        <span>Show</span>
        {DAILY_UPDATES_ORDERS.map((option) => <button type="button" key={option.value} aria-pressed={order === option.value} title={option.description} onClick={() => setDailyUpdatesOrder(option.value)}>{option.label}</button>)}
      </div>
      <ol className="daily-remarks-list" aria-label={`${countLabel}, ${order === "oldest" ? "oldest" : "newest"} first`}>
        {updates.map((item) => <li key={`${item.ordinal}-${item.createdAt}`}><article>
          <header><i aria-label={`Update ${item.ordinal} of ${updates.length}`}>#{item.ordinal}</i><b>{formatDateTime(item.createdAt)}</b><span>{item.authorName || "Maintenance User"}</span></header>
          <p>{item.remark}</p>
          <small>{category ? `${category} · ` : ""}Delayed reason: {item.delayedReason || item.delayReason || "—"}</small>
        </article></li>)}
      </ol>
      {updates.length > UPDATES_BEFORE_SCROLL && <footer className="daily-remarks-more">Scroll inside the list to see all {updates.length} updates</footer>}
    </div>
  </details>;
}
