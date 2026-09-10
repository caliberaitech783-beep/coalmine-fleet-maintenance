import React, { useEffect, useId, useState } from "react";
import { describeDateRange, encodeDateRange, parseDateRange } from "./date-range-filter.mjs";

export default function RecordDateRange({ label, value = "", onChange }) {
  const [draft, setDraft] = useState(() => parseDateRange(value) || { from: "", to: "" });
  const id = useId();
  useEffect(() => { setDraft(parseDateRange(value) || { from: "", to: "" }); }, [value]);
  const invalid = Boolean(draft.from && draft.to && draft.from > draft.to);
  const change = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (!next.from || !next.to || next.from <= next.to) onChange(encodeDateRange(next.from, next.to));
  };
  const applied = parseDateRange(value);
  return <div className="record-date-range" role="group" aria-label={`${label} date range`}>
    <span className="record-date-range-basis">{label}</span>
    <label><span>From</span><input type="date" aria-label={`${label} from date`} value={draft.from} max={draft.to || undefined} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} onChange={(event) => change("from", event.target.value)} /></label>
    <label><span>To</span><input type="date" aria-label={`${label} to date`} value={draft.to} min={draft.from || undefined} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint`} onChange={(event) => change("to", event.target.value)} /></label>
    {(draft.from || draft.to || value) && <button type="button" className="record-date-range-clear" onClick={() => { setDraft({ from: "", to: "" }); onChange(""); }}>Clear dates</button>}
    <span id={`${id}-hint`} className="record-date-range-hint" role={invalid ? "alert" : "status"}>
      {invalid ? "From must be on or before To. The previous filter is still applied." : applied ? `${describeDateRange(applied)} · ${label} · inclusive` : "All dates"}
    </span>
  </div>;
}
