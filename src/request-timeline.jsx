import React, {useEffect, useState} from "react";
import {formatTimelineDuration} from "../request-timeline.mjs";
import "./request-timeline.css";

const clock = new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false});
const stamp = value => value && Number.isFinite(Date.parse(value)) ? `${clock.format(new Date(value))} IST` : "Not recorded";
const sourceLabel = source => source === "system" ? "System recorded" : source === "user" ? "Form supplied" : "Source not recorded (legacy)";
const actorLabel = event => event.actorName && event.actorLogin ? `${event.actorName} (${event.actorLogin})` : event.actorName || event.actorLogin || "Not recorded";
const stageDefinitions = [
  ["waiting", "Waiting for arrival", "start", "acceptedAt"],
  ["maintenance", "Maintenance interval", "acceptedAt", "closedAt"],
  ["returnToWork", "Return to work", "closedAt", "firstTripAt"],
  ["overall", "Total to first trip", "start", "firstTripAt"],
  ["repairElapsed", "Total to closure", "start", "closedAt"],
  ["verificationLag", "Verification after first trip", "firstTripAt", "verifiedAt"],
];

export function RequestTimelineView({data}) {
  const events = Array.isArray(data.events) ? data.events : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const byEvent = new Map(events.map(event => [event.event,event]));
  const idleApproval = Boolean(data.request?.idealApprovedAt || data.request?.idealApprovedBy);
  return <div className="request-timeline-content">
    <p>Each duration uses the two recorded event times shown below. The three workflow stages do not overlap. Verification is shown separately, not added to the total.</p>
    {idleApproval && <p className="request-timeline-note">This request closed through a manager’s on-road approval. Its closure is not a separately recorded repair-completion time. The maintenance interval can include idle waiting.</p>}
    <div className="request-timeline-stages">
      {stageDefinitions.map(([key,label,start,end]) => <article key={key} className={key === "overall" ? "timeline-total" : ""}>
        <h3>{label}</h3><strong>{formatTimelineDuration(data.durations?.[key] ?? null)}</strong>
        <div><span>From: {byEvent.get(start)?.label || start}</span><time>{stamp(byEvent.get(start)?.eventAt)}</time></div>
        <div><span>To: {byEvent.get(end)?.label || end}</span><time>{stamp(byEvent.get(end)?.eventAt)}</time></div>
      </article>)}
    </div>
    <p className="request-timeline-note">“Not recorded” means an endpoint is missing, invalid or out of order—not zero time. Recording a time does not independently prove when the event happened. Use the existing red flag if the entry is incorrect.</p>
    <h3>Timestamp sources</h3>
    <div className="request-timeline-events">
      {events.filter(event => event.eventAt || ["start","acceptedAt","closedAt","firstTripAt","verifiedAt"].includes(event.event)).map(event => <article key={event.event}>
        <h4>{event.label}</h4><b>{stamp(event.eventAt)}</b>
        <dl><div><dt>Source</dt><dd>{event.eventAt ? sourceLabel(event.source) : "Not recorded"}</dd></div>
          <div><dt>Recorded by</dt><dd>{actorLabel(event)}</dd></div>
          <div><dt>Saved at</dt><dd>{stamp(event.recordedAt)}</dd></div></dl>
        {event.reason && <p>Reason: {event.reason}</p>}
      </article>)}
    </div>
    <h3>Recorded changes and corrections</h3>
    <p>History starts when timestamp tracking was enabled. Older changes cannot be reconstructed from missing evidence. Existing timestamp-edit permissions are unchanged.</p>
    {history.length ? <ol className="request-timeline-history">{history.map((entry,index) => <li key={`${entry.event}-${entry.recordedAt}-${index}`}>
      <b>{byEvent.get(entry.event)?.label || entry.event} · {entry.correction ? "Corrected" : "Recorded"}</b>
      <div>Original: {stamp(entry.oldValue)}</div><div>Saved value: {stamp(entry.newValue)}</div>
      <div>{actorLabel(entry)} · {stamp(entry.recordedAt)} · {sourceLabel(entry.source)}</div>
      {entry.reason && <p>Reason: {entry.reason}</p>}
    </li>)}</ol> : <p>No timestamp-change history is recorded for this entry.</p>}
  </div>;
}

export function RequestTimelineContent({reference,token}) {
  const [state,setState] = useState(null);
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    fetch(`/api/requests/${encodeURIComponent(reference)}/timeline`, {cache:"no-store",signal:controller.signal,headers:{Authorization:`Bearer ${token}`}})
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load this request’s time breakdown.");
        if (body.reference !== reference || !Array.isArray(body.events) || !Array.isArray(body.history) || !body.durations) throw new Error("The time breakdown response is incomplete. Please retry.");
        if (!controller.signal.aborted) setState({reference,token,data:body});
      }).catch(error => {if (!controller.signal.aborted) setState({reference,token,error:error.message});});
    return () => controller.abort();
  },[reference,token,retry]);
  if (state?.reference !== reference || state?.token !== token) return <p role="status">Loading recorded times…</p>;
  if (state.error) return <div><p role="alert">{state.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry time breakdown</button></div>;
  return <RequestTimelineView data={state.data} />;
}

export default function RequestTimelineButton({reference,token,Dialog,label}) {
  const [open,setOpen] = useState(false);
  useEffect(() => setOpen(false),[reference,token]);
  if (!reference) return null;
  return <><button type="button" className="request-timeline-link" title="View time breakdown" aria-label={`View time breakdown for ${reference}`} onClick={() => setOpen(true)}>{label || reference}</button>
    {open && <Dialog title={`Time breakdown · ${reference}`} close={() => setOpen(false)}><RequestTimelineContent reference={reference} token={token} /></Dialog>}</>;
}
