import React, {useState} from 'react';
import './maintenance-etc-input.css';

const INDIA_OFFSET_MS = 330 * 60_000;
const MINUTE_MS = 60_000;

export function etcParts(value = '') {
  const [date = '', time = ''] = value.split('T');
  const [hour = '', minute = ''] = time.split(':');
  return {date, hour: hour === '' ? '' : String(Number(hour) % 12 || 12).padStart(2, '0'), minute, period: hour === '' ? '' : Number(hour) >= 12 ? 'PM' : 'AM'};
}

export function etcValue({date, hour, minute, period}) {
  if (!date || !hour || minute === '' || !period) return '';
  return `${date}T${String(Number(hour) % 12 + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute}`;
}

export function etcMinimum(value = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  const nextMinute = Math.floor(safeTimestamp / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  return new Date(nextMinute + INDIA_OFFSET_MS).toISOString().slice(0, 16);
}

export function isEtcBackdated(value, minimum = etcMinimum()) {
  return Boolean(value && minimum && value < minimum);
}

export function etcMinimumLabel(minimum) {
  const match = String(minimum || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return '';
  const hour24 = Number(match[4]);
  return `${match[3]}-${match[2]}-${match[1]} ${String(hour24 % 12 || 12).padStart(2, '0')}:${match[5]} ${hour24 >= 12 ? 'PM' : 'AM'} IST`;
}

export function etcPeriodDisabled(date, period, minimum) {
  if (!date || !period || !minimum) return false;
  return `${date}T${period === 'AM' ? '11' : '23'}:59` < minimum;
}

export function etcHourDisabled({date, period}, hour, minimum) {
  if (!date || !period || !hour || !minimum) return false;
  return isEtcBackdated(etcValue({date, period, hour, minute: '59'}), minimum);
}

export function etcMinuteDisabled(parts, minute, minimum) {
  return isEtcBackdated(etcValue({...parts, minute}), minimum);
}

export default function MaintenanceEtcInput({value, onChange, now = Date.now()}) {
  const initialValue = String(value || '').slice(0, 16);
  const initialMinimum = etcMinimum(now);
  const [parts, setParts] = useState(() => etcParts(value));
  const [editing, setEditing] = useState(() => !isEtcBackdated(initialValue, initialMinimum));
  const minimum = etcMinimum(now);
  const currentValue = etcValue(parts);
  function change(key, next) {
    let updated = {...parts, [key]: next};
    if (key === 'date' && next < minimum.slice(0, 10)) return;
    if (isEtcBackdated(etcValue(updated), minimum)) {
      if (key === 'date') updated = {date: next, hour: '', minute: '', period: ''};
      if (key === 'period') updated = {...updated, hour: '', minute: ''};
      if (key === 'hour') updated = {...updated, minute: ''};
      if (key === 'minute') updated = {...updated, minute: ''};
    }
    setParts(updated);
    onChange(etcValue(updated));
  }
  function replacePastEtc() {
    const blank = {date: minimum.slice(0, 10), hour: '', minute: '', period: ''};
    setEditing(true);
    setParts(blank);
    onChange('');
  }
  const hours = Array.from({length:12}, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({length:60}, (_, i) => String(i).padStart(2, '0'));
  return <fieldset className="full etc-field maintenance-etc-input">
    <legend>ETC (Expected Time For Completion) *</legend>
    <div className="maintenance-etc-controls">
      <label>Date<input type="date" required min={minimum.slice(0, 10)} value={parts.date} disabled={!editing} onChange={e => change('date', e.target.value)} /></label>
      <label>AM/PM<select required value={parts.period} disabled={!editing} onChange={e => change('period', e.target.value)}><option value="">AM/PM</option>{['AM', 'PM'].map(period => <option key={period} disabled={etcPeriodDisabled(parts.date, period, minimum)}>{period}</option>)}</select></label>
      <label>Hour<select required value={parts.hour} disabled={!editing || !parts.period} onChange={e => change('hour', e.target.value)}><option value="">Hour</option>{hours.map(hour => <option key={hour} disabled={etcHourDisabled(parts, hour, minimum)}>{hour}</option>)}</select></label>
      <label>Minute<select required value={parts.minute} disabled={!editing || !parts.period || !parts.hour} onChange={e => change('minute', e.target.value)}><option value="">Minute</option>{minutes.map(minute => <option key={minute} disabled={etcMinuteDisabled(parts, minute, minimum)}>{minute}</option>)}</select></label>
    </div>
    <input type="hidden" name="expectedCompletionAt" value={currentValue} />
    {!editing && <button type="button" className="etc-replace-button" onClick={replacePastEtc}>Change to a future ETC</button>}
    <small>{editing ? `Past dates and times are disabled. Earliest allowed: ${etcMinimumLabel(minimum)}.` : 'This existing ETC is retained for history. Choose Change to a future ETC to replace it.'}</small>
  </fieldset>;
}
