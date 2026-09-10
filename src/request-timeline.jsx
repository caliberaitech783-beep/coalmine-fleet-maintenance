import React, {useEffect, useState} from "react";
import {formatTimelineDuration,parseRequestTimelineTimestamp} from "../request-timeline.mjs";
import "./request-timeline.css";

const clock = new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false});
const stamp = value => {
  const parsed = parseRequestTimelineTimestamp(value);
  return parsed ? `${clock.format(parsed)} IST` : "Not recorded";
};
const sourceLabel = source => source === "system" ? "System recorded" : source === "user" ? "Form supplied" : "Source not recorded (legacy)";
const actorLabel = event => event.actorName && event.actorLogin ? `${event.actorName} (${event.actorLogin})` : event.actorName || event.actorLogin || "Not recorded";
const requestActor = (event,request) => {
  if (event === "start" && (request.owner || request.requesterLogin)) return ["Request created by", actorLabel({actorName:request.owner,actorLogin:request.requesterLogin})];
  const fields = {acceptedAt:["Accepted by (request record)","acceptedBy"],closedAt:["Closed by (request record)","closedBy"],firstTripAt:["First trip entered by (request record)","firstTripBy"],verifiedAt:["Verified by (request record)","verifiedBy"],idealRequestedAt:["Idle requested by (request record)","idealRequestedBy"],idealApprovedAt:["On-road approved by (request record)","idealApprovedBy"],inProgressAt:["In progress recorded by (request record)","inProgressBy"]};
  const field = fields[event];
  return field && request[field[1]] ? [field[0],request[field[1]]] : null;
};
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
  const request = data.request || {};
  const remarks = (Array.isArray(request.dailyRemarks) ? request.dailyRemarks : []).filter(Boolean).slice().sort((a,b) => (parseRequestTimelineTimestamp(b.createdAt)?.getTime() || 0) - (parseRequestTimelineTimestamp(a.createdAt)?.getTime() || 0));
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
    <p>Days of breakdown measures elapsed time from submission to recorded closure, or to now while still open. It is not arrival waiting time or confirmed hands-on repair time.</p>
    <h3>Timestamp sources</h3>
    <div className="request-timeline-events">
      {events.filter(event => event.eventAt || ["start","acceptedAt","closedAt","firstTripAt","verifiedAt"].includes(event.event)).map(event => {
        const attribution = requestActor(event.event,request);
        return <article key={event.event}>
        <h4>{event.label}</h4><b>{stamp(event.eventAt)}</b>
        <dl>{attribution && <div><dt>{attribution[0]}</dt><dd>{attribution[1]}</dd></div>}
          <div><dt>Timestamp source</dt><dd>{event.eventAt ? sourceLabel(event.source) : "Not recorded"}</dd></div>
          <div><dt>Timestamp audit author</dt><dd>{actorLabel(event)}</dd></div>
          <div><dt>Timestamp audit saved at</dt><dd>{stamp(event.recordedAt)}</dd></div></dl>
        {attribution && !event.actorName && !event.actorLogin && <p className="request-timeline-record-note">Name saved on the request; timestamp-audit details are not recorded.</p>}
        {event.event === "acceptedAt" && !event.eventAt && <p className="request-timeline-record-note">No separate acceptance time is recorded. This does not mean the vehicle never reached maintenance.{remarks.length > 0 && " Maintenance updates are recorded below, but they do not establish the exact arrival time."}</p>}
        {event.reason && <p>Reason: {event.reason}</p>}
      </article>;})}
    </div>
    <h3>Recorded maintenance updates</h3>
    <p>These are saved work and delay remarks, separate from acceptance, closure and timestamp-audit history. An update’s date is not an inferred arrival time.</p>
    {remarks.length ? <ol className="request-timeline-updates">{remarks.map((entry,index) => <li key={`${entry.createdAt}-${index}`}>
      <time>{stamp(entry.createdAt)}</time>
      <dl><div><dt>Update recorded by</dt><dd>{actorLabel({actorName:entry.authorName,actorLogin:entry.authorLogin})}</dd></div>
        <div><dt>Work reported</dt><dd>{entry.remark || "Not recorded"}</dd></div>
        <div><dt>Reason for delay</dt><dd>{entry.delayReason || "Not recorded"}</dd></div></dl>
    </li>)}</ol> : <p>No daily maintenance updates are recorded for this entry.</p>}
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
