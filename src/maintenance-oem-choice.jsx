import React, {useState} from 'react';

export default function MaintenanceOemChoice({request, canEdit = false}) {
  const [selected, setSelected] = useState(request.oemResponsibility || '');
  const [original] = useState(request.oemResponsibility || '');
  const [reason, setReason] = useState('');
  if (!request.acceptedAt) return null;
  return <div className="maintenance-oem-choice"><span>Breakdown responsibility</span>
    {selected && <input type="hidden" name="oemResponsibility" value={selected} />}
    <div role="group" aria-label="OEM responsibility">{['OEM', 'NON OEM'].map(value => <label key={value}><input type="checkbox" value={value} checked={selected === value} disabled={Boolean(request.oemResponsibility) && !canEdit} onChange={() => setSelected(value)} />{value}</label>)}</div>
    {canEdit && original && selected !== original && <label>Reason for changing breakdown responsibility (optional)<textarea name="responsibilityChangeReason" value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} placeholder="Explain why responsibility is changing" /><small>Saved with the responsibility change in history.</small></label>}
  </div>;
}
