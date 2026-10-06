import React, { useState } from "react";

export function RequestDeleteReview({ records, onDelete, onClose, Modal, formatDateTime }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirm = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true); setError("");
    try { await onDelete(records.map(row => row.ref), reason.trim()); onClose(); }
    catch (failure) { setError(failure.message || "Could not delete the selected requests."); }
    finally { setBusy(false); }
  };
  return <Modal title={`Review ${records.length} selected request${records.length === 1 ? "" : "s"}`} close={() => !busy && onClose()} className="delete-selected-modal">
    <div className="delete-selected-review">
      <div className="delete-selected-warning" role="alert"><div><strong>Are you sure you want to delete all of the records listed below?</strong><span>This permanently deletes these requests and their linked daily remarks, corrections and WhatsApp dispatch records, including closed, verified or idle requests. This cannot be undone. Equipment Master records remain available.</span></div></div>
      <ol className="delete-selected-list" aria-label="Requests selected for deletion">{records.map(row => <li key={row.ref}><b>{row.ref} · {row.door || row.equipmentGroup || row.equipment || "Equipment not specified"}</b><span>{[row.equipmentGroup && `Equipment: ${row.equipmentGroup}`, row.site && `Site: ${row.site}`, row.status && `Status: ${row.status}`, row.start && `Started: ${formatDateTime(row.start)}`, row.closedAt && `Closed: ${formatDateTime(row.closedAt)}`, row.verifiedAt && `Verified: ${formatDateTime(row.verifiedAt)}`, row.complaint && `Reason: ${row.complaint}`].filter(Boolean).join(" · ")}</span></li>)}</ol>
      <label className="delete-selected-reason">Reason for deletion *<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength="500" disabled={busy} placeholder="Enter the reason recorded in the Audit Trail" /></label>
      {error && <p className="delete-selected-error" role="alert">{error}</p>}
      <footer className="delete-selected-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary delete-selected-confirm" disabled={busy || !reason.trim()} onClick={confirm}>{busy ? "Deleting selected records..." : "Yes, delete selected"}</button></footer>
    </div>
  </Modal>;
}
