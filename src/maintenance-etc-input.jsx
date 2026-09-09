import React, {useState} from 'react';
import './maintenance-etc-input.css';

export function etcParts(value = '') {
  const [date = '', time = ''] = value.split('T');
  const [hour = '', minute = ''] = time.split(':');
  return {date, hour: hour === '' ? '' : String(Number(hour) % 12 || 12).padStart(2, '0'), minute, period: hour === '' ? '' : Number(hour) >= 12 ? 'PM' : 'AM'};
}

export function etcValue({date, hour, minute, period}) {
  if (!date || !hour || minute === '' || !period) return '';
  return `${date}T${String(Number(hour) % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}

export default function MaintenanceEtcInput({value, onChange}) {
  const [parts, setParts] = useState(() => etcParts(value));
  function change(key, next) {
    const updated = {...parts, [key]: next};
    setParts(updated);
    onChange(etcValue(updated));
  }
  return <fieldset className="full etc-field maintenance-etc-input">
    <legend>ETC (Expected Time For Completion) *</legend>
    <div className="maintenance-etc-controls">
      <label>Date<input type="date" required value={parts.date} onChange={e => change('date', e.target.value)} /></label>
      <label>Hour<select required value={parts.hour} onChange={e => change('hour', e.target.value)}><option value="">Hour</option>{Array.from({length:12}, (_, i) => String(i + 1).padStart(2, '0')).map(hour => <option key={hour}>{hour}</option>)}</select></label>
      <label>Minute<select required value={parts.minute} onChange={e => change('minute', e.target.value)}><option value="">Minute</option>{Array.from({length:60}, (_, i) => String(i).padStart(2, '0')).map(minute => <option key={minute}>{minute}</option>)}</select></label>
      <label>AM/PM<select required value={parts.period} onChange={e => change('period', e.target.value)}><option value="">AM/PM</option><option>AM</option><option>PM</option></select></label>
    </div>
    <input type="hidden" name="expectedCompletionAt" value={etcValue(parts)} />
    <small>Select a 12-hour time with AM/PM. Planned time entered by Maintenance—not the actual completion time.</small>
  </fieldset>;
}
