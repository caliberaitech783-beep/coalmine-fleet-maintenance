import React, {useEffect, useState} from 'react';
import {
  formatTimeInputValue,
  parseTwelveHourTime,
} from '../date-time-format.mjs';
import DateInput from './date-input.mjs';
import './twelve-hour-input.css';

const HOURS = Array.from({length: 12}, (_, index) => String(index + 1).padStart(2, '0'));
const MINUTES = Array.from({length: 60}, (_, index) => String(index).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

const selectParts = (value, includeSeconds = false) => {
  const display = formatTimeInputValue(value, {includeSeconds});
  const match = display.match(/^(\d{2}):(\d{2})(?::(\d{2}))?\s+(AM|PM)$/);
  return match
    ? {hour: match[1], minute: match[2], second: match[3] || '00', period: match[4]}
    : {hour: '', minute: '', second: '', period: ''};
};

const machineTime = (parts, includeSeconds = false) => {
  if (!parts.hour || !parts.minute || !parts.period || (includeSeconds && !parts.second)) return '';
  const display = `${parts.hour}:${parts.minute}${includeSeconds ? `:${parts.second}` : ''} ${parts.period}`;
  return parseTwelveHourTime(display, {includeSeconds});
};

const normalizeDateTime = (value, includeSeconds = false) => String(value ?? '')
  .trim()
  .replace(' ', 'T')
  .slice(0, includeSeconds ? 19 : 16);

export function TwelveHourTimeInput({name, value, defaultValue = '', onChange, includeSeconds = false, required = false, readOnly = false, className = '', ...props}) {
  const controlled = value !== undefined;
  const sourceValue = controlled ? value : defaultValue;
  const [parts, setParts] = useState(() => selectParts(sourceValue, includeSeconds));

  useEffect(() => {
    if (controlled) setParts(selectParts(value, includeSeconds));
  }, [controlled, value, includeSeconds]);

  const machineValue = machineTime(parts, includeSeconds);
  const updatePart = (key, nextPart) => {
    const nextParts = {...parts, [key]: nextPart};
    setParts(nextParts);
    const nextValue = machineTime(nextParts, includeSeconds);
    if (nextValue) onChange?.(nextValue);
  };
  const groupLabel = props['aria-label'] || (includeSeconds ? 'Time with seconds' : 'Time');
  const selectRequired = required && !readOnly;

  return <>
    <span
      className={`twelve-hour-time-selects ${className}`.trim()}
      role="group"
      aria-label={groupLabel}
      aria-describedby={props['aria-describedby']}
      aria-readonly={readOnly || undefined}
    >
      <select aria-label={`${groupLabel}: hour`} value={parts.hour} required={selectRequired} disabled={readOnly} onChange={(event) => updatePart('hour', event.target.value)}>
        <option value="" disabled>HH</option>
        {HOURS.map((hour) => <option key={hour} value={hour}>{hour}</option>)}
      </select>
      <span className="twelve-hour-time-separator" aria-hidden="true">:</span>
      <select aria-label={`${groupLabel}: minute`} value={parts.minute} required={selectRequired} disabled={readOnly} onChange={(event) => updatePart('minute', event.target.value)}>
        <option value="" disabled>MM</option>
        {MINUTES.map((minute) => <option key={minute} value={minute}>{minute}</option>)}
      </select>
      {includeSeconds && <>
        <span className="twelve-hour-time-separator" aria-hidden="true">:</span>
        <select aria-label={`${groupLabel}: second`} value={parts.second} required={selectRequired} disabled={readOnly} onChange={(event) => updatePart('second', event.target.value)}>
          <option value="" disabled>SS</option>
          {MINUTES.map((second) => <option key={second} value={second}>{second}</option>)}
        </select>
      </>}
      <select className="twelve-hour-period-select" aria-label={`${groupLabel}: AM or PM`} value={parts.period} required={selectRequired} disabled={readOnly} onChange={(event) => updatePart('period', event.target.value)}>
        <option value="" disabled>AM/PM</option>
        {PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
      </select>
    </span>
    {name && <input type="hidden" name={name} value={machineValue} />}
  </>;
}

export function TwelveHourDateTimeInput({name, value, defaultValue = '', onChange, includeSeconds = false, required = false, min = '', max = '', className = ''}) {
  const controlled = value !== undefined;
  const initialValue = normalizeDateTime(controlled ? value : defaultValue, includeSeconds);
  const [localValue, setLocalValue] = useState(initialValue);

  useEffect(() => {
    if (controlled) setLocalValue(normalizeDateTime(value, includeSeconds));
  }, [controlled, value, includeSeconds]);

  const currentValue = controlled ? normalizeDateTime(value, includeSeconds) : localValue;
  const [dateValue = '', timeValue = ''] = currentValue.split('T');
  const commit = (date, time) => {
    const nextValue = date && time ? `${date}T${time}` : date ? `${date}T` : time ? `T${time}` : '';
    if (!controlled) setLocalValue(nextValue);
    onChange?.(nextValue);
  };

  return <span className={`twelve-hour-datetime-input ${className}`.trim()}>
    <DateInput
      value={dateValue}
      min={String(min || '').slice(0, 10) || undefined}
      max={String(max || '').slice(0, 10) || undefined}
      required={required}
      onChange={(event) => commit(event.target.value, timeValue)}
    />
    <TwelveHourTimeInput
      value={timeValue}
      includeSeconds={includeSeconds}
      required={required}
      onChange={(nextTime) => commit(dateValue, nextTime)}
    />
    {name && <input type="hidden" name={name} value={currentValue} />}
  </span>;
}

export default TwelveHourTimeInput;
