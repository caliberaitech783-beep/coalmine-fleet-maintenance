import React, {useEffect, useState} from "react";
import {formatTimelineDuration,parseRequestTimelineTimestamp} from "../request-timeline.mjs";
import {DailyUpdatesPanel} from "./daily-updates-list.jsx";
import {stageTimingSteps} from "../stage-timing-report.mjs";
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
  ["repairElapsed", "Total to closure", "start", "closedAt"],
  ["returnToWork", "Return to work", "closedAt", "firstTripAt"],
  ["overall", "Total to first trip", "start", "firstTripAt"],
  ["verificationLag", "Verification after first trip", "firstTripAt", "verifiedAt"],
];

// Equipment group, door number and location that identify the machine, shown with the request number everywhere in the time breakdown.
export function requestTimelineIdentity(request = {}) {
  return [request.equipmentGroup || request.equipment, request.door || request.reg, request.site || request.location].map(value => String(value || "").trim()).filter(Boolean).join(" · ");
}

export function RequestTimelineView({data}) {
  const events = Array.isArray(data.events) ? data.events : [];
  const history = Array.isArray(data.history) ? data.history : [];
  const byEvent = new Map(events.map(event => [event.event,event]));
  const request = data.request || {};
  const remarks = (Array.isArray(request.dailyRemarks) ? request.dailyRemarks : []).filter(Boolean);
  const idleApproval = Boolean(data.request?.idealApprovedAt || data.request?.idealApprovedBy);
  const identity = requestTimelineIdentity(request);
  const endpointState = (key) => {
    const event = byEvent.get(key);
    if (event?.eventAt) return stamp(event.eventAt);
    const order = ["start", "acceptedAt", "closedAt", "firstTripAt", "verifiedAt"];
    const laterRecorded = order.slice(order.indexOf(key) + 1).some(next => byEvent.get(next)?.eventAt);
    const closed = Boolean(request.closedAt || request.verifiedAt || /closed|verified/i.test(request.status || ""));
    if (key === "acceptedAt" && request.acceptanceRequired === true && !laterRecorded && !closed) return "Awaiting maintenance acceptance";
    if (key === "closedAt" && !closed && !laterRecorded && /open|accepted|progress|idle/i.test(request.status || "")) return "Not closed yet";
    if (key === "firstTripAt" && !laterRecorded && !request.verifiedAt && request.firstTripDone !== true && !/verified/i.test(request.status || "")) return "First trip pending";
    if (key === "verifiedAt" && !/verified/i.test(request.status || "") && !request.verifiedAt) return "MIS verification pending";
    return `${event?.label || key} time missing`;
  };
  const endpointDetails = (key) => {
    const event = byEvent.get(key) || {};
    const attribution = requestActor(key, request);
    return <div className="timeline-endpoint"><span>{event.label || key}</span><time>{endpointState(key)}</time>
      <small>Time source: {event.eventAt ? sourceLabel(event.source) : "No timestamp available"}</small>
      {attribution && <small>{attribution[0]}: {attribution[1]}</small>}
      {event.eventAt && <small>Audit author: {actorLabel(event)} · Saved: {stamp(event.recordedAt)}</small>}
      {event.reason && <small>Reason: {event.reason}</small>}
    </div>;
  };
  const stageDuration = (key, start, end) => {
    const value = data.durations?.[key];
    if (value != null) return formatTimelineDuration(value);
    if (!byEvent.get(start)?.eventAt) return endpointState(start);
    if (!byEvent.get(end)?.eventAt) return endpointState(end);
    return "Not recorded";
  };
  const steps = stageTimingSteps(request);
  return <div className="request-timeline-content">
    {identity && <p className="request-timeline-identity"><b>{identity}</b><span> · {data.reference}</span></p>}
    <p>Each duration uses the two recorded event times shown below. The three workflow stages do not overlap. Verification is shown separately, not added to the total.</p>
    {idleApproval && <p className="request-timeline-note">This request closed through a manager’s on-road approval. Its closure is not a separately recorded repair-completion time. The maintenance interval can include idle waiting.</p>}
    <h3>Step by step</h3>
    <p>The stages in the order they happened, each with the wait since the stage before it. The longest wait of this request is marked.</p>
    <table className="request-timeline-steps">
      <thead><tr><th>Step</th><th>Stage</th><th>Recorded at</th><th>By</th><th>Wait since previous stage</th></tr></thead>
      <tbody>{steps.map(step => <tr key={step.key} className={step.slowest ? "slowest-step" : undefined}>
        <td>{step.step}</td><td>{step.label}</td><td>{step.at ? stamp(step.at) : "Pending"}</td><td>{step.actor || "Not recorded"}</td>
        <td>{step.gapLabel ? <span className={`stage-gap${step.slowest ? " slowest" : ""}`} title={step.gapLabel}>{step.gap}</span> : "—"}</td>
      </tr>)}</tbody>
    </table>
    <div className="request-timeline-stages">
      {stageDefinitions.map(([key,label,start,end], index) => <article key={key} className={key === "overall" || key === "repairElapsed" ? "timeline-total" : ""}>
        <h3><span className="timeline-stage-number">{index + 1}</span>{label}</h3><strong>{stageDuration(key,start,end)}</strong>
        {key === "repairElapsed" && <small className="timeline-total-formula">Subtotal: 1 + 2</small>}
        {key === "overall" && <small className="timeline-total-formula">Total: 1 + 2 + 4</small>}
        <div>From:{endpointDetails(start)}</div>
        <div>To:{endpointDetails(end)}</div>
        {index < stageDefinitions.length - 1 && <span className={`timeline-sequence-arrow${index % 2 ? " next-row" : ""}`} aria-hidden="true">{index % 2 ? "↙" : "↓"}</span>}
      </article>)}
    </div>
    <p className="request-timeline-note">Pending stages do not yet have a completed duration. A missing timestamp is not zero time: its exact duration cannot be calculated. “Not recorded” indicates an invalid or unavailable duration. Recording a time does not independently prove when the event happened. Use the existing correction or red-flag workflow if the entry is incorrect.</p>
    <p>Days of breakdown measures elapsed time from submission to recorded closure, or to now while still open. It is not arrival waiting time or confirmed hands-on repair time.</p>
    <details className="timeline-source-audit"><summary>Additional timestamp audit details</summary>
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
    </details>
    <h3>Recorded maintenance updates</h3>
    <p>These are saved work and delay remarks, separate from acceptance, closure and timestamp-audit history. An update’s date is not an inferred arrival time.</p>
    {remarks.length ? <div className="request-timeline-updates"><DailyUpdatesPanel remarks={remarks} category={request.category} formatDateTime={stamp} missingLabel="Not recorded" authorLabel={entry => actorLabel({actorName:entry.authorName,actorLogin:entry.authorLogin})} /></div> : <p>No daily maintenance updates are recorded for this entry.</p>}
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

export function RequestTimelineContent({reference,token,onLoaded}) {
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
        if (!controller.signal.aborted) { setState({reference,token,data:body}); onLoaded?.(body.request || {}); }
      }).catch(error => {if (!controller.signal.aborted) setState({reference,token,error:error.message});});
    return () => controller.abort();
  },[reference,token,retry]);
  if (state?.reference !== reference || state?.token !== token) return <p role="status">Loading recorded times…</p>;
  if (state.error) return <div><p role="alert">{state.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry time breakdown</button></div>;
  return <RequestTimelineView data={state.data} />;
}

export default function RequestTimelineButton({reference,token,Dialog,label}) {
  const [open,setOpen] = useState(false);
  const [identity,setIdentity] = useState("");
  useEffect(() => {setOpen(false); setIdentity("");},[reference,token]);
  if (!reference) return null;
  const title = identity ? `Time breakdown · ${reference} · ${identity}` : `Time breakdown · ${reference}`;
  return <><button type="button" className="request-timeline-link" title="View time breakdown" aria-label={`View time breakdown for ${reference}`} onClick={() => setOpen(true)}>{label || reference}</button>
    {open && <Dialog title={title} className="request-timeline-modal" overlayClassName="request-timeline-overlay" close={() => setOpen(false)}><RequestTimelineContent reference={reference} token={token} onLoaded={request => setIdentity(requestTimelineIdentity(request))} /></Dialog>}</>;
}
