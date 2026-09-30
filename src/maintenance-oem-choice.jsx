import React, {useState} from 'react';

export default function MaintenanceOemChoice({request}) {
  const [selected, setSelected] = useState(request.oemResponsibility || '');
  if (!request.acceptedAt) return null;
  return <div className="maintenance-oem-choice"><span>Breakdown responsibility</span>
    <div role="group" aria-label="OEM responsibility">{['OEM', 'NON OEM'].map(value => <label key={value}><input type="checkbox" name="oemResponsibility" value={value} checked={selected === value} onChange={() => setSelected(value)} />{value}</label>)}</div>
  </div>;
}
