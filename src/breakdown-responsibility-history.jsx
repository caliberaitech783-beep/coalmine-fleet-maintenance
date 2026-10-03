import React, {useEffect, useRef, useState} from 'react';
import {canEditBreakdownResponsibility} from '../breakdown-responsibility.mjs';

export function responsibilityHistoryText(request, formatDate = value => value) {
  const history = request.oemResponsibilityHistory || [];
  return history.length ? history.map(entry => `${entry.from || 'Not assigned'} → ${entry.to} · ${entry.changedBy || entry.login} · ${formatDate(entry.changedAt)}`).join('\n')
    : request.oemResponsibility ? `${request.oemResponsibility} · No recorded changes` : 'Not assigned';
}

export default function BreakdownResponsibilityHistory({request, session, Dialog, formatDate, onSaved}) {
  const [saved, setSaved] = useState(request);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [previous, setPrevious] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => { setSaved(request); }, [request]);
  const editable = canEditBreakdownResponsibility(session) && saved.acceptedAt && !saved.verifiedAt && !saved.closedAt && !['Closed','Idle','Ideal'].includes(saved.status);
  const close = () => { if (!lock.current) setOpen(false); };
  return <div className="responsibility-history-cell">
    <span>{saved.oemResponsibility || 'Not assigned'}</span>{' '}
    <button type="button" onClick={() => {setSelected(saved.oemResponsibility || ''); setPrevious(saved.oemResponsibility || ''); setError(''); setOpen(true);}}>History{editable ? ' / Edit' : ''}</button>
    {open && <Dialog title={`Breakdown responsibility history · ${saved.ref}`} close={close}>
      <p>Current responsibility: <b>{saved.oemResponsibility || 'Not assigned'}</b></p>
      <div style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{responsibilityHistoryText(saved, formatDate)}</div>
      {editable && <form className="form" onSubmit={async event => {
        event.preventDefault();
        if (lock.current || !selected || selected === saved.oemResponsibility) return;
        lock.current = true; setBusy(true); setError('');
        try {
          const response = await fetch(`/api/requests/${encodeURIComponent(saved.ref)}/breakdown-responsibility`, {
            method:'PATCH', headers:{'Content-Type':'application/json', Authorization:`Bearer ${session?.token || ''}`},
            body:JSON.stringify({oemResponsibility:selected, previousResponsibility:previous})
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'Could not save responsibility. Refresh and check the current value before retrying.');
          setSaved(result); setOpen(false); onSaved?.();
        } catch (failure) {setError(failure.message || 'Could not save responsibility.');}
        finally {lock.current = false; setBusy(false);}
      }}>
        <label>Breakdown responsibility<select aria-label="Breakdown responsibility" value={selected} disabled={busy} required onChange={event => setSelected(event.target.value)}>
          <option value="" disabled>Select responsibility</option><option value="OEM">OEM</option><option value="NON OEM">NON OEM</option>
        </select></label>
        <p>Changes are applied only when you click Save changes.</p>
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="primary" disabled={busy || !selected || selected === saved.oemResponsibility}>{busy ? 'Saving…' : 'Save changes'}</button></footer>
      </form>}
      {!editable && <footer><button type="button" onClick={close}>Close</button></footer>}
    </Dialog>}
  </div>;
}
