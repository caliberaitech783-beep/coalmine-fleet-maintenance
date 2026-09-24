import React, { forwardRef, useState } from "react";

// "2026-09-21" -> "21-09-2026"; "2026-09-21T14:05" -> "21-09-2026 14:05".
export function formatDayFirstInputValue(value, type = "date") {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}(?::\d{2})?))?/.exec(String(value ?? ""));
  if (!match) return "";
  const [, year, month, day, time] = match;
  const date = `${day}-${month}-${year}`;
  return type === "datetime-local" && time ? `${date} ${time}` : date;
}

// Native date inputs render in the browser's locale (mm/dd/yyyy on US systems).
// DateInput keeps the native picker and value format (yyyy-mm-dd) but paints the
// visible text day-first through a ::before overlay fed by data-dmy (date-input.css).
// Chromium's mobile date control is implemented differently across Android builds:
// some versions paint the native segments above generated input content, producing
// multiple dates on top of each other. Keep the overlay desktop-only and let touch
// devices use their reliable native representation.
export function dateInputOverlaySupported(browserNavigator = typeof navigator === "undefined" ? null : navigator) {
  if (!browserNavigator?.userAgentData) return false;
  if (browserNavigator.userAgentData.mobile === true) return false;
  if (browserNavigator.maxTouchPoints > 0) return false;
  return !/Android|Mobile|iPhone|iPad|iPod/i.test(String(browserNavigator.userAgent || ""));
}

const overlaySupported = dateInputOverlaySupported();

const DateInput = forwardRef(function DateInput({ type = "date", className, value, defaultValue, onChange, onClick, ...props }, ref) {
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const display = formatDayFirstInputValue(controlled ? value : uncontrolledValue, type);
  return React.createElement("input", {
    type,
    ...props,
    ref,
    className: overlaySupported ? (className ? `dmy-date-input ${className}` : "dmy-date-input") : className,
    "data-dmy": display || (type === "datetime-local" ? "dd-mm-yyyy --:--" : "dd-mm-yyyy"),
    "data-empty": display ? undefined : "true",
    ...(controlled ? { value } : { defaultValue }),
    onChange: (event) => { if (!controlled) setUncontrolledValue(event.target.value); onChange?.(event); },
    onClick: (event) => {
      onClick?.(event);
      const input = event.currentTarget;
      if (event.defaultPrevented || input.disabled || input.readOnly) return;
      try { input.showPicker?.(); } catch { /* the picker needs a user gesture; ignore */ }
    },
  });
});

export default DateInput;
