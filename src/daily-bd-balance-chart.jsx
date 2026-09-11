import React, {useMemo, useState} from 'react';
import {ArrowDown, ArrowRight, ArrowUp, Info, MapPin, RotateCcw} from 'lucide-react';
import {DAILY_BD_METRICS, buildDailyBdBalance, shiftBdDate} from './daily-bd-balance.mjs';
import {recordedBreakdownRangeLength} from './dashboard-breakdown-forecast.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';

const MOVEMENT_BARS = DAILY_BD_METRICS.filter(({key}) => key === 'incoming' || key === 'outgoing');
const signedCount = value => `${value > 0 ? '+' : ''}${value.toLocaleString()}`;

function BalanceChange({row}) {
  const value = row.percent === null ? `+${row.delta} from 0` : `${row.delta > 0 ? '+' : ''}${row.percent.toFixed(1)}%`;
  const explanation = row.percent === null
    ? `Opening BD was 0; ${row.balance} requests remain. Percentage change has no zero baseline.`
    : `(${row.balance} closing − ${row.open} opening) ÷ ${row.open || 1} × 100. ${row.delta > 0 ? 'Increase' : row.delta < 0 ? 'Decrease' : 'No change'} in open BD.`;
  return <span className={`bd-balance-change ${row.direction}`} title={explanation} aria-label={`${value} change in open BD`}>
    {row.delta > 0 ? <ArrowUp aria-hidden="true"/> : row.delta < 0 ? <ArrowDown aria-hidden="true"/> : <span aria-hidden="true">—</span>}{value}
  </span>;
}

export default function DailyBdBalanceChart({records = [], sites = [], scopeLabel = 'All regions', today, ready = true, error = '', stale = false, onRefresh, onInspect}) {
  const [site, setSite] = useState('');
  const [range, setRange] = useState({days: 7, from: '', to: ''});
  const [rangeError, setRangeError] = useState('');
  const activeSite = sites.includes(site) ? site : '';
  const from = range.from || shiftBdDate(today, 1 - range.days), to = range.to || today;
  const scopedRecords = useMemo(() => activeSite ? records.filter(record => recordBelongsToSite(record, activeSite)) : records, [records, activeSite]);
  const ledger = useMemo(() => buildDailyBdBalance(scopedRecords, from, to), [scopedRecords, from, to]);
  // Only daily In/Out are plotted. Opening balances must not flatten their bars.
  const peak = Math.max(0, ...ledger.days.flatMap(day => [day.incoming, day.outgoing]));
  const maximum = Math.max(1, peak <= 20 ? peak : Math.ceil(peak / 5) * 5);
  const inspect = (metric, start = from, end = to) => onInspect?.(metric, start, end, activeSite);
  const preset = days => {setRange({days, from: '', to: ''}); setRangeError('');};
  const changeDate = (bound, value) => {
    if (!value) {preset(7); return;}
    let start = bound === 'from' ? value : from, end = bound === 'to' ? value : to;
    if (start > end) {if (bound === 'from') end = start; else start = end;}
    if (end > today || !recordedBreakdownRangeLength(start, end)) {setRangeError('Choose valid dates up to today, within a ten-year range.'); return;}
    setRange({days: 0, from: start, to: end}); setRangeError('');
  };
  const unavailable = !ready || Boolean(error);
  return <article className="mine-panel daily-bd-balance" aria-label="Daily BD balance chart">
    <header className="bd-balance-header">
      <div><span className="mine-eyebrow">Daily breakdown movement</span><h2>Daily BD balance</h2><p>Opening + BD In − BD Out = Closing <ArrowRight aria-hidden="true"/> Next day’s opening</p></div>
      <div className="bd-balance-controls">
        <label><span><MapPin aria-hidden="true"/> Site</span><select aria-label="Daily BD balance site" value={activeSite} onChange={event => setSite(event.target.value)}><option value="">All sites</option>{sites.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        <label><span>From</span><input aria-label="Daily BD balance from date" type="date" value={from} max={today} onChange={event => changeDate('from', event.target.value)}/></label>
        <label><span>To</span><input aria-label="Daily BD balance to date" type="date" value={to} max={today} onChange={event => changeDate('to', event.target.value)}/></label>
        <div className="mine-trend-period" role="group" aria-label="Daily BD balance period">{[7,14,30].map(days => <button type="button" key={days} aria-pressed={range.days === days} className={range.days === days ? 'active' : ''} onClick={() => preset(days)}>{days}D</button>)}</div>
      </div>
    </header>
    {unavailable ? <div className="bd-balance-empty" role={error ? 'alert' : 'status'}><b>{error ? 'BD movement is unavailable' : 'Loading BD movement…'}</b>{error && <><span>{error}</span><button type="button" onClick={onRefresh}><RotateCcw/> Retry</button></>}</div> : <>
      <div className="bd-balance-context"><span>{activeSite || scopeLabel} · {formatDisplayDate(from)} to {formatDisplayDate(to)}{stale ? ' · Last checked data' : to === today ? ' · Today so far' : ''}</span><span className="bd-balance-context-change">Net change <b>{signedCount(ledger.totals.delta)} open</b><BalanceChange row={ledger.totals}/><span className="bd-balance-help" tabIndex={0} title="Opening includes all earlier requests still open at the start of the selected period. Each day's closing becomes the next day's opening. Change = (closing − opening) ÷ opening × 100. Red means more open BD; green means fewer. Each request is counted once; BD Out uses its actual maintenance closing date. Today's figures are live, not final." aria-label="How BD balance and percentage change are calculated"><Info aria-hidden="true"/></span></span></div>
      {rangeError && <p className="bd-balance-range-error" role="alert">{rangeError}</p>}
      <div className="bd-balance-summary" aria-label="BD movement totals for selected period">{DAILY_BD_METRICS.map(({key,label}) => <button type="button" className={key} key={key} onClick={() => inspect(key)} aria-label={`${label}: ${ledger.totals[key]} requests in selected period`}><span><i/>{label}</span><strong>{ledger.totals[key].toLocaleString()}</strong></button>)}</div>
      <div className="bd-balance-scroll" tabIndex={0} role="region" aria-label="Daily BD In and BD Out bars with opening and closing balances; scroll for more dates">
        <div className="bd-balance-days" style={{gridTemplateColumns: `repeat(${ledger.days.length}, minmax(154px, 1fr))`}}>
          {ledger.days.map(day => <section className={`bd-balance-day${day.date === today ? ' today' : ''}`} key={day.date} aria-label={`BD movement ${formatDisplayDate(day.date)}`}>
            <div className="bd-balance-day-change"><BalanceChange row={day}/></div>
            <button type="button" className="bd-balance-opening" aria-label={`${formatDisplayDate(day.date)}: Opening BD, ${day.open} requests`} title={`Open at the start of ${formatDisplayDate(day.date)} · View requests`} onClick={() => inspect('open', day.date, day.date)}><span>Opening BD</span><b>{day.open.toLocaleString()}</b></button>
            <div className="bd-balance-plot">
              <div className="bd-balance-grid" aria-hidden="true">{[0,25,50,75,100].map(tick => <i key={tick} style={{bottom: `${tick}%`}}/>)}</div>
              <div className="bd-balance-bars">{MOVEMENT_BARS.map(({key,label}) => <button type="button" key={key} className={`bd-balance-bar-button ${key}`} aria-label={`${formatDisplayDate(day.date)}: ${label}, ${day[key]} requests`} title={`${label}: ${day[key]} · ${formatDisplayDate(day.date)} · View requests`} onClick={() => inspect(key, day.date, day.date)}><span className="bd-balance-bar" style={{height: `${day[key] / maximum * 100}%`}}><b>{day[key].toLocaleString()}</b></span></button>)}</div>
            </div>
            <div className="bd-balance-bar-labels" aria-hidden="true"><span>BD In</span><span>BD Out</span></div>
            <button type="button" className={`bd-balance-closing ${day.direction}`} aria-label={`${formatDisplayDate(day.date)}: Closing balance, ${day.balance} requests`} title={`${day.open} opening + ${day.incoming} in − ${day.outgoing} out = ${day.balance}. ${day.date === today ? 'Today so far.' : 'Carries into the next day.'} View requests`} onClick={() => inspect('balance', day.date, day.date)}><span><b>{day.date === today ? 'Balance now' : 'Closing BD'}</b><small>Net {signedCount(day.delta)}</small></span><strong>{day.balance.toLocaleString()}</strong></button>
            <footer className="bd-balance-day-date"><b>{formatDisplayDate(day.date)}</b><small>{day.date === today ? (stale ? 'Today · last checked' : 'Today · live') : new Date(`${day.date}T12:00:00Z`).toLocaleDateString('en-GB', {weekday: 'short', timeZone: 'Asia/Kolkata'})}</small></footer>
          </section>)}
        </div>
      </div>
      {ledger.excluded.length > 0 && <button type="button" className="bd-balance-date-issue" onClick={() => inspect('undated')}>{ledger.excluded.length} requests excluded: start or closing dates need correction. View requests</button>}
    </>}
  </article>;
}
