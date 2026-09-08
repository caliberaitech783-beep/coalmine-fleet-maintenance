import React, {useState} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays, Clock, Plus, Save, Trash2, X} from 'lucide-react';
import {defaultPersonalReportSchedules, personalScheduleValidationError} from '../personal-report-schedules.mjs';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const timeLabel = time => { const [h,m] = time.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; };

export default function PersonalReportSchedulesButton({session}) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(defaultPersonalReportSchedules), [details, setDetails] = useState(null);
  const [error, setError] = useState(''), [savedMessage, setSavedMessage] = useState('');
  const headers = {Authorization: `Bearer ${session?.token || ''}`};
  const load = async () => {
    setOpen(true); setLoading(true); setError(''); setDetails(null); setSavedMessage('');
    try {
      const response = await fetch('/api/me/report-schedules', {headers, cache: 'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load your schedules.');
      setDetails(result); setSettings(result.settings);
    } catch (error) { setError(error.message); }
    finally { setLoading(false); }
  };
  const change = (key, values) => setSettings(current => ({...current, schedules: current.schedules.map(schedule => schedule.key === key ? {...schedule, ...values} : schedule)}));
  const save = async () => {
    if (!details || saving) return;
    const validation = personalScheduleValidationError(settings, details.allowedReports);
    if (validation) {setError(validation); return;}
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/me/report-schedules', {method: 'PUT', headers: {...headers, 'Content-Type': 'application/json'}, body: JSON.stringify(settings)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save your schedules.');
      setSettings(result.settings); setOpen(false);
      setSavedMessage(result.settings.enabled ? 'Your schedules are saved. Delivery starts at the next future time slot.' : 'Your personal report delivery is paused.');
    } catch (error) {setError(error.message);}
    finally {setSaving(false);}
  };
  const close = () => {if (!saving) setOpen(false);};
  return <>
    <button type="button" className="secondary director-timing-trigger" onClick={load}><Clock /> My report schedules</button>
    {savedMessage && <span className="personal-schedule-confirmation" role="status">{savedMessage}</span>}
    {open && createPortal(<div className="overlay" onPointerDown={event => event.target === event.currentTarget && close()}>
      <div className="modal director-timing-modal personal-report-modal" role="dialog" aria-modal="true" aria-label="My report schedules">
        <header><div className="report-schedule-title"><span><CalendarDays /></span><div><h3>My report schedules</h3><p>Choose reports and delivery times for yourself</p></div></div><button type="button" onClick={close} disabled={saving} aria-label="Close my report schedules"><X /></button></header>
        {loading ? <p className="report-schedule-loading">Loading your saved schedules…</p> : <>
          {error && <p className="personal-schedule-error" role="alert">{error} {!details && <button type="button" onClick={load}>Retry</button>}</p>}
          {details && <>
            <div className="personal-schedule-help">
              <p><b>WhatsApp delivery to:</b> {details.recipient.name || session?.name} · {details.recipient.phone || 'Phone number not registered'}</p>
              <p>Choose from reports you can access. Each delivery includes PDF and Excel links with data from your assigned sites. Availability uses the current month; other reports use their usual current data.</p>
              <p>These are additional personal deliveries. Organisation report delivery is controlled in Masters → Hierarchy master. Existing organisation reports and workflow alerts continue separately.</p>
              {!details.recipient.phone && <p className="personal-schedule-error">Ask an administrator to add your WhatsApp number in Users &amp; employees before enabling delivery.</p>}
              {details.unavailableReason && <p className="personal-schedule-error">{details.unavailableReason}</p>}
            </div>
            <div className="report-schedule-toolbar"><label className="report-schedule-switch"><input type="checkbox" checked={settings.enabled} disabled={saving || (!settings.enabled && (!details.recipient.phone || !details.allowedReports.length))} onChange={event => setSettings(current => ({...current, enabled:event.target.checked}))} /><span>Personal delivery active</span></label><span>All times are IST · {settings.enabled ? 'Active after saving' : 'Paused'}</span></div>
            <div className="report-week-grid compact" aria-label="Seven day personal report schedule summary">{[1,2,3,4,5,6,0].map(day => {
              const count = settings.enabled ? new Set(settings.schedules.filter(schedule => schedule.enabled && schedule.reports.length && (schedule.cadence === 'daily' || schedule.weekday === day)).flatMap(schedule => schedule.times)).size : 0;
              return <article key={day} className={count ? 'active' : ''}><b>{days[day].slice(0,3)}</b><span>{count ? `${count} time${count === 1 ? '' : 's'}` : '—'}</span></article>;
            })}</div>
            <div className="report-schedule-editor-list">
              {!settings.schedules.length && <p className="personal-schedule-empty">No personal schedules yet. Add a schedule, choose your reports and set a delivery time.</p>}
              {settings.schedules.map((schedule, number) => <article key={schedule.key}>
                <header><label><input type="checkbox" checked={schedule.enabled} disabled={saving} onChange={event => change(schedule.key, {enabled:event.target.checked})} /><span><b>Schedule {number + 1} · {schedule.cadence === 'weekly' ? 'Weekly' : 'Daily'}</b><small>{schedule.cadence === 'weekly' ? `${days[schedule.weekday]} · ` : 'Every day · '}{schedule.times.map(timeLabel).join(' & ') || 'Choose a time'} IST</small></span></label><button type="button" disabled={saving} onClick={() => setSettings(current => ({...current,schedules:current.schedules.filter(item => item.key !== schedule.key)}))} aria-label={`Delete schedule ${number + 1}`}><Trash2 /></button></header>
                <div className="report-schedule-fields">
                  <label><span>Frequency</span><select value={schedule.cadence} disabled={saving} onChange={event => change(schedule.key,{cadence:event.target.value})}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
                  {schedule.cadence === 'weekly' && <label><span>Day</span><select value={schedule.weekday} disabled={saving} onChange={event => change(schedule.key,{weekday:Number(event.target.value)})}>{days.map((day,index) => <option key={day} value={index}>{day}</option>)}</select></label>}
                  <label className="report-time-field"><span>IST time slots</span><div>{schedule.times.map((time,index) => <span key={index}><input type="time" aria-label={`Schedule ${number + 1} time ${index + 1}`} value={time} disabled={saving} onChange={event => change(schedule.key,{times:schedule.times.map((item,i) => i === index ? event.target.value : item)})} /><button type="button" disabled={saving} onClick={() => change(schedule.key,{times:schedule.times.filter((_,i) => i !== index)})} aria-label={`Remove time ${index + 1}`}><X /></button></span>)}<button type="button" disabled={saving || schedule.times.length >= 6} onClick={() => change(schedule.key,{times:[...schedule.times,'19:00']})}>+ Time</button></div></label>
                </div>
                <details className="report-assignment-picker" open><summary>Choose my reports <b>{schedule.reports.length}</b></summary><div>{details.allowedReports.map(title => <label key={title}><input type="checkbox" disabled={saving} checked={schedule.reports.includes(title)} onChange={event => change(schedule.key,{reports:event.target.checked ? [...schedule.reports,title] : schedule.reports.filter(item => item !== title)})} /><span>{title}</span></label>)}</div></details>
              </article>)}
              <button type="button" className="report-add-schedule" disabled={saving || settings.schedules.length >= 20 || !details.allowedReports.length} onClick={() => setSettings(current => ({...current,enabled:!!details.recipient.phone,schedules:[...current.schedules,{key:crypto.randomUUID(),enabled:true,cadence:'daily',weekday:1,times:['19:00'],reports:[]}]}))}><Plus /> Add my schedule</button>
            </div>
          </>}
        </>}
        <footer><button type="button" onClick={close} disabled={saving}>Cancel</button><button type="button" className="primary" onClick={save} disabled={loading || saving || !details}><Save /> {saving ? 'Saving…' : 'Save my schedules'}</button></footer>
      </div>
    </div>,document.body)}
  </>;
}
