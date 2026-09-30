import React, {useState, useRef} from 'react';
import {createPortal} from 'react-dom';

export default function MaintenanceOemChoice({request, onSave, DailyRemarkForm}) {
  const [pending, setPending] = useState(null);
  const [saved, setSaved] = useState(request.oemResponsibility || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveLock = useRef(false);
  if (!request.acceptedAt || !onSave) return null;
  return <div className="maintenance-oem-choice"><span>Breakdown responsibility</span>
    <div role="group" aria-label="OEM responsibility">{['OEM', 'NON OEM'].map(value => <label key={value}><input type="checkbox" checked={(pending || saved) === value} disabled={saving} onChange={() => {setPending(value); setError('');}} />{value}</label>)}</div>
    {pending && createPortal(<><DailyRemarkForm request={request} close={() => {if (!saveLock.current) setPending(null);}} onSave={async payload => {
      if (saveLock.current) return;
      saveLock.current = true;
      setSaving(true); setError('');
      try { await onSave(request.ref, {...payload, oemResponsibility: pending}); setSaved(pending); setPending(null); }
      catch (failure) {setError(failure.message || 'Could not save daily update.');}
      finally {saveLock.current = false; setSaving(false);}
    }} />{error && <div role="alert" className="maintenance-oem-save-error">{error}</div>}</>, document.body)}
  </div>;
}
