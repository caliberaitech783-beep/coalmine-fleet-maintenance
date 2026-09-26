import React, {useEffect, useState} from 'react';
import {
  formatTimeInputValue,
  parseTwelveHourTime,
  TWELVE_HOUR_TIME_PATTERN,
  TWELVE_HOUR_TIME_SECONDS_PATTERN,
} from '../date-time-format.mjs';
import DateInput from './date-input.mjs';
import './twelve-hour-input.css';

const normalizeDateTime = (value, includeSeconds = false) => String(value ?? '')
  .trim()
  .replace(' ', 'T')
  .slice(0, includeSeconds ? 19 : 16);

export function TwelveHourTimeInput({name, value, defaultValue = '', onChange, includeSeconds = false, required = false, readOnly = false, className = '', ...props}) {
  const controlled = value !== undefined;
  const sourceValue = controlled ? value : defaultValue;
  const [displayValue, setDisplayValue] = useState(() => formatTimeInputValue(sourceValue, {includeSeconds}));

  useEffect(() => {
    if (controlled) setDisplayValue(formatTimeInputValue(value, {includeSeconds}));
  }, [controlled, value, includeSeconds]);

  const machineValue = parseTwelveHourTime(displayValue, {includeSeconds});
  const updateDisplay = (event) => {
    const nextDisplay = event.target.value.toUpperCase();
    setDisplayValue(nextDisplay);
    const nextValue = parseTwelveHourTime(nextDisplay, {includeSeconds});
    if (nextValue) onChange?.(nextValue);
  };
  const normalizeDisplay = () => {
    const normalized = parseTwelveHourTime(displayValue, {includeSeconds});
    if (normalized) setDisplayValue(formatTimeInputValue(normalized, {includeSeconds}));
  };

  return <>
    <input
      {...props}
      className={`twelve-hour-time-input ${className}`.trim()}
      type="text"
      inputMode={readOnly ? 'numeric' : 'text'}
      value={displayValue}
      onChange={updateDisplay}
      onBlur={normalizeDisplay}
      placeholder={includeSeconds ? '07:00:00 PM' : '07:00 PM'}
      pattern={includeSeconds ? TWELVE_HOUR_TIME_SECONDS_PATTERN : TWELVE_HOUR_TIME_PATTERN}
      title={includeSeconds ? 'Enter time as h:mm:ss AM/PM' : 'Enter time as h:mm AM/PM'}
      required={required}
      readOnly={readOnly}
      aria-readonly={readOnly || undefined}
      autoComplete="off"
    />
    {name && <input type="hidden" name={name} value={machineValue || String(sourceValue || '')} />}
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
