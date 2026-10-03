import React, {useState} from 'react';

export default function MaintenanceOemChoice({request}) {
  const [selected, setSelected] = useState(request.oemResponsibility || '');
  if (!request.acceptedAt) return null;
  return <div className="maintenance-oem-choice"><span>Breakdown responsibility</span>
    {selected && <input type="hidden" name="oemResponsibility" value={selected} />}
    <div role="group" aria-label="OEM responsibility">{['OEM', 'NON OEM'].map(value => <label key={value}><input type="checkbox" value={value} checked={selected === value} disabled={Boolean(request.oemResponsibility)} onChange={() => setSelected(value)} />{value}</label>)}</div>
  </div>;
}
