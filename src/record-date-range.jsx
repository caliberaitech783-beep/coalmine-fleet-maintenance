import React, { useEffect, useId, useRef, useState } from "react";
import { describeDateRange, encodeDateRange, parseDateRange } from "./date-range-filter.mjs";
import { indiaToday } from "./report-period-model.mjs";
import DateInput from "./date-input.mjs";

export default function RecordDateRange({ label, value = "", onChange, defaultToday = false }) {
  const [draft, setDraft] = useState(() => parseDateRange(value) || { from: "", to: "" });
  const id = useId();
  useEffect(() => { setDraft(parseDateRange(value) || { from: "", to: "" }); }, [value]);
  // Apply the default to the data as well as the inputs, once per mounted filter.
  // Later clears, saved views and user-selected ranges must not be overwritten.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (defaultToday && !value) {
      const today = indiaToday();
      setDraft({ from: today, to: today });
      onChange(encodeDateRange(today, today));
    }
  }, [value, onChange, defaultToday]);
  const invalid = Boolean(draft.from && draft.to && draft.from > draft.to);
  const change = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (!next.from || !next.to || next.from <= next.to) onChange(encodeDateRange(next.from, next.to));
  };
  const applied = parseDateRange(value);
  return <div className="record-date-range" role="group" aria-label={`${label} date range`}>
    <label><span>From</span><DateInput aria-label={`${label} from date`} value={draft.from} max={draft.to || undefined} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} onChange={(event) => change("from", event.target.value)} /></label>
    <label><span>To</span><DateInput aria-label={`${label} to date`} value={draft.to} min={draft.from || undefined} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} onChange={(event) => change("to", event.target.value)} /></label>
    {(draft.from || draft.to || value) && <button type="button" className="record-date-range-clear" onClick={() => { setDraft({ from: "", to: "" }); onChange(""); }}>Clear dates</button>}
    <span id={`${id}-hint`} className="record-date-range-hint" data-empty={!invalid && !applied ? "true" : undefined} role={invalid ? "alert" : "status"}>
      {invalid ? "From must be on or before To. The previous filter is still applied." : applied ? `${describeDateRange(applied)} · inclusive` : ""}
    </span>
  </div>;
}
