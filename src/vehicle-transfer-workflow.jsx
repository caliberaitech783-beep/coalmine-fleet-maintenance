import React, {useEffect, useMemo, useState} from 'react';
import {ArrowRightLeft, CheckCircle2, Clock, MapPin, Plus, RefreshCw, Search, Send, ShieldCheck, Truck, X} from 'lucide-react';
import {formatDisplayDate, formatDisplayDateTime} from '../date-time-format.mjs';
import {canonicalSiteName} from '../site-location.mjs';
import {VEHICLE_TRANSFER_STATUS, VEHICLE_TRANSFER_VIEW, vehicleTransferProgress, vehicleTransferStatus, vehicleTransferViewRecords} from '../vehicle-transfer-workflow.mjs';
import './vehicle-transfer-workflow.css';

const indiaDateInput = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'})
    .formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({type, value: part}) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
};

const equipmentLabel = (record = {}) => [record.door || record.reg || record.equipmentName, record.equipmentName, record.make, record.modelNo || record.model]
  .filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' · ') || 'Unnamed vehicle';

function TransferStatus({record}) {
  const status = vehicleTransferStatus(record);
  return <span className={`vehicle-transfer-status ${status === VEHICLE_TRANSFER_STATUS.COMPLETED ? 'complete' : status === VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE ? 'destination' : status === VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION ? 'mis' : 'source'}`}>
    {status === VEHICLE_TRANSFER_STATUS.COMPLETED ? <CheckCircle2 /> : <Clock />}{status}
  </span>;
}

function TransferProgress({record}) {
  return <ol className="vehicle-transfer-progress" aria-label={`Transfer progress for ${record.transferNo}`}>
    {vehicleTransferProgress(record).map((stage) => <li key={stage.key} className={stage.complete ? 'complete' : ''}>
      <i>{stage.complete ? <CheckCircle2 /> : <Clock />}</i>
      <span><b>{stage.label}</b><small>{stage.detail || (stage.complete ? 'Completed' : 'Pending')}</small></span>
    </li>)}
  </ol>;
}

function TransferForm({Dialog, equipment, sites, token, onClose, onSaved}) {
  const [equipmentId, setEquipmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = equipment.find((record) => String(record.id) === equipmentId);
  const source = String(selected?.currentLocation || selected?.location || selected?.site || '').trim();
  const destinations = sites.filter((site) => canonicalSiteName(site) !== canonicalSiteName(source));
  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch('/api/vehicle-transfers', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({
          transferNo: String(data.get('transferNo') || '').trim(),
          transferDate: data.get('transferDate'),
          equipmentMasterId: Number(data.get('equipmentMasterId')),
          destination: data.get('destination'),
          driver: String(data.get('driver') || '').trim(),
          dieselQty: String(data.get('dieselQty') || '').trim(),
          kmr: String(data.get('kmr') || '').trim(),
          hmr: String(data.get('hmr') || '').trim(),
          remarks: String(data.get('remarks') || '').trim(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not submit the vehicle transfer.');
      onSaved(body);
      onClose();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setSaving(false);
    }
  };
  return <Dialog title="New vehicle transfer request" close={onClose} className="vehicle-transfer-form-modal">
    <form className="vehicle-transfer-form" onSubmit={submit}>
      <div className="vehicle-transfer-form-intro"><Send /><span><b>MIS submits the transfer</b><small>The source-site PM approves dispatch, destination MIS verifies the arrival, then the destination-site PM accepts it.</small></span></div>
      <div className="formgrid">
        <label>Vehicle / equipment *
          <select name="equipmentMasterId" required value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
            <option value="" disabled>Select from Vehicle Master</option>
            {equipment.map((record) => <option key={record.id} value={record.id}>{equipmentLabel(record)} · {record.currentLocation || 'Location missing'}</option>)}
          </select>
        </label>
        <label>Transfer date *<input name="transferDate" type="date" required defaultValue={indiaDateInput()} /></label>
        <label>Transfer number<input name="transferNo" placeholder="Auto-generated if left blank" /></label>
        <label>Current source site<input value={source} readOnly placeholder="Select a vehicle" /></label>
        <label>Destination site *
          <select name="destination" required defaultValue="" disabled={!source}>
            <option value="" disabled>Select destination</option>
            {destinations.map((site) => <option key={site}>{site}</option>)}
          </select>
        </label>
        <label>Driver<input name="driver" placeholder="Driver name" /></label>
        <label>Diesel quantity<input name="dieselQty" inputMode="decimal" placeholder="Quantity at dispatch" /></label>
        <label>KMR<input name="kmr" inputMode="decimal" placeholder="Kilometre reading" /></label>
        <label>HMR<input name="hmr" inputMode="decimal" placeholder="Hour-meter reading" /></label>
        <label className="full">Transfer remarks<textarea name="remarks" rows="3" placeholder="Condition, documents, attachments, or handover notes" /></label>
      </div>
      {selected && <div className="vehicle-transfer-selected"><Truck /><span><b>{equipmentLabel(selected)}</b><small>Chassis: {selected.chassisNo || 'Not recorded'} · Serial: {selected.manufacturerSerialNo || 'Not recorded'}</small></span></div>}
      <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={saving || !source}><Send /> {saving ? 'Submitting…' : 'Send for source approval'}</button></footer>
    </form>
  </Dialog>;
}

export default function VehicleTransferWorkflow({session, Dialog, embedded = false}) {
  const [state, setState] = useState({records: [], equipment: [], sites: [], capabilities: {}, loading: true, error: ''});
  const [query, setQuery] = useState('');
  const [activeView, setActiveView] = useState(VEHICLE_TRANSFER_VIEW.ALL);
  const [showForm, setShowForm] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [notice, setNotice] = useState('');
  const token = session?.token || localStorage.getItem('nerveCenterToken') || '';
  const load = async () => {
    setState((current) => ({...current, loading: true, error: ''}));
    try {
      const response = await fetch(`/api/vehicle-transfers?t=${Date.now()}`, {cache: 'no-store', headers: {Authorization: `Bearer ${token}`}});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not load vehicle transfers.');
      setState({...body, loading: false, error: ''});
    } catch (error) {
      setState((current) => ({...current, loading: false, error: error.message}));
    }
  };
  useEffect(() => { void load(); }, [token]);
  const act = async (record, action) => {
    const verbs = {'source-approval': 'release this vehicle', 'destination-verification': 'verify this vehicle at the destination', 'destination-acceptance': 'accept this vehicle'};
    const verb = verbs[action] || 'update this transfer';
    if (!window.confirm(`${verb[0].toUpperCase()}${verb.slice(1)} for transfer ${record.transferNo}?`)) return;
    setWorkingId(String(record.id));
    try {
      const response = await fetch(`/api/vehicle-transfers/${record.id}/${action}`, {method: 'PATCH', headers: {Authorization: `Bearer ${token}`}});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not update the transfer.');
      setNotice(action === 'source-approval'
        ? 'Vehicle released. The destination-site MIS team has been notified.'
        : action === 'destination-verification'
          ? 'Destination MIS verification completed. The destination Project Manager has been notified.'
          : 'Vehicle accepted. Vehicle Master location has been updated.');
      await load();
    } catch (error) {
      window.alert(error.message);
    } finally {
      setWorkingId('');
    }
  };
  const searchedRecords = useMemo(() => state.records.filter((record) => JSON.stringify(record).toLowerCase().includes(query.trim().toLowerCase())), [state.records, query]);
  const records = useMemo(() => vehicleTransferViewRecords(searchedRecords, activeView), [searchedRecords, activeView]);
  const isProjectManager = Boolean(state.capabilities.canApproveSource || state.capabilities.canAcceptDestination);
  useEffect(() => {
    if (!isProjectManager && activeView !== VEHICLE_TRANSFER_VIEW.ALL) setActiveView(VEHICLE_TRANSFER_VIEW.ALL);
  }, [activeView, isProjectManager]);
  const counts = state.records.reduce((summary, record) => {
    const status = vehicleTransferStatus(record);
    summary.total += 1;
    if (status === VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL) summary.source += 1;
    else if (status === VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION) summary.mis += 1;
    else if (status === VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE) summary.destination += 1;
    else summary.completed += 1;
    return summary;
  }, {total: 0, source: 0, mis: 0, destination: 0, completed: 0});
  const releaseCount = vehicleTransferViewRecords(state.records, VEHICLE_TRANSFER_VIEW.RELEASE).length;
  const acceptCount = vehicleTransferViewRecords(state.records, VEHICLE_TRANSFER_VIEW.ACCEPT).length;
  return <section className={`vehicle-transfer-workflow${embedded ? ' embedded' : ''}`}>
    <header className="vehicle-transfer-heading"><div><span>CONTROLLED VEHICLE MOVEMENT</span><h1>Vehicle transfers</h1><p>MIS submission, source PM approval, destination MIS verification, PM acceptance, and Vehicle Master update in one register.</p></div><div><button type="button" className="secondary" onClick={load} disabled={state.loading}><RefreshCw /> Refresh</button>{state.capabilities.canSubmit && <button type="button" className="primary" onClick={() => setShowForm(true)}><Plus /> New transfer</button>}</div></header>
    <div className="vehicle-transfer-kpis">
      <article><ArrowRightLeft /><span>Total transfers</span><b>{counts.total}</b></article>
      <article className="source"><Clock /><span>Source approval pending</span><b>{counts.source}</b></article>
      <article className="mis"><ShieldCheck /><span>Destination MIS verification</span><b>{counts.mis}</b></article>
      <article className="destination"><MapPin /><span>Destination PM acceptance</span><b>{counts.destination}</b></article>
      <article className="complete"><CheckCircle2 /><span>Accepted and updated</span><b>{counts.completed}</b></article>
    </div>
    {notice && <div className="vehicle-transfer-notice" role="status"><CheckCircle2 /><span>{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><X /></button></div>}
    <div className="vehicle-transfer-guide"><ShieldCheck /><p><b>How acceptance is checked:</b> each row shows all four stages, the responsible person and time. The destination PM button remains locked until destination MIS verification is complete. “Completed” confirms acceptance and the Vehicle Master location update.</p></div>
    {isProjectManager && <div className="vehicle-transfer-tabs" role="tablist" aria-label="Project Manager vehicle transfer work queues">
      <button type="button" role="tab" aria-selected={activeView === VEHICLE_TRANSFER_VIEW.ALL} className={activeView === VEHICLE_TRANSFER_VIEW.ALL ? 'active' : ''} onClick={() => setActiveView(VEHICLE_TRANSFER_VIEW.ALL)}><ArrowRightLeft /> All Transfers <b>{counts.total}</b></button>
      <button type="button" role="tab" aria-selected={activeView === VEHICLE_TRANSFER_VIEW.RELEASE} className={activeView === VEHICLE_TRANSFER_VIEW.RELEASE ? 'active' : ''} onClick={() => setActiveView(VEHICLE_TRANSFER_VIEW.RELEASE)}><Send /> Release Vehicle <b>{releaseCount}</b></button>
      <button type="button" role="tab" aria-selected={activeView === VEHICLE_TRANSFER_VIEW.ACCEPT} className={activeView === VEHICLE_TRANSFER_VIEW.ACCEPT ? 'active' : ''} onClick={() => setActiveView(VEHICLE_TRANSFER_VIEW.ACCEPT)}><CheckCircle2 /> Accept Vehicle <b>{acceptCount}</b></button>
    </div>}
    <div className="vehicle-transfer-toolbar"><label><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transfer, vehicle, site, or approver" /></label><span>{records.length} visible</span></div>
    {state.error ? <div className="vehicle-transfer-empty"><X /><b>{state.error}</b><button type="button" onClick={load}>Try again</button></div> : state.loading && !state.records.length ? <div className="vehicle-transfer-empty"><RefreshCw className="spin" /><b>Loading vehicle transfers…</b></div> : <div className="vehicle-transfer-list">
      {records.length ? records.map((record) => <article className="vehicle-transfer-row" key={record.id}>
        <div className="vehicle-transfer-summary"><div className="vehicle-transfer-id"><Truck /><span><b>{record.transferNo || `Transfer ${record.id}`}</b><small>{record.equipment || record.door || 'Vehicle'} · {record.modelNo || 'Model not recorded'}</small></span></div><div className="vehicle-transfer-route"><span><small>FROM</small><b>{record.source || 'Not recorded'}</b></span><ArrowRightLeft /><span><small>TO</small><b>{record.destination || 'Not recorded'}</b></span></div><div><TransferStatus record={record} /><small className="vehicle-transfer-date">Transfer date: {formatDisplayDate(record.transferDate)}</small></div></div>
        <TransferProgress record={record} />
        <div className="vehicle-transfer-meta"><span>Submitted: <b>{record.submittedBy || 'Imported record'}</b>{record.submittedAt ? ` · ${formatDisplayDateTime(record.submittedAt)}` : ''}</span><span>Chassis: <b>{record.chassisNo || 'Not recorded'}</b></span>{record.vehicleMasterUpdatedAt && <span className="master-updated"><CheckCircle2 /> Vehicle Master updated {formatDisplayDateTime(record.vehicleMasterUpdatedAt)}</span>}</div>
        {(record.canApproveSource || record.canVerifyDestination || record.canAcceptDestination) && <div className="vehicle-transfer-actions">{record.canApproveSource && <button type="button" className="primary" disabled={workingId === String(record.id)} onClick={() => act(record, 'source-approval')}><Send /> {workingId === String(record.id) ? 'Releasing…' : 'Release vehicle'}</button>}{record.canVerifyDestination && <button type="button" className="primary verify" disabled={workingId === String(record.id)} onClick={() => act(record, 'destination-verification')}><ShieldCheck /> {workingId === String(record.id) ? 'Verifying…' : 'Verify at destination'}</button>}{record.canAcceptDestination && <button type="button" className="primary accept" disabled={workingId === String(record.id)} onClick={() => act(record, 'destination-acceptance')}><CheckCircle2 /> {workingId === String(record.id) ? 'Accepting…' : 'Accept vehicle'}</button>}</div>}
      </article>) : <div className="vehicle-transfer-empty"><Search /><b>{activeView === VEHICLE_TRANSFER_VIEW.RELEASE ? 'No vehicles are waiting for release at your sites.' : activeView === VEHICLE_TRANSFER_VIEW.ACCEPT ? 'No vehicles are waiting for acceptance at your sites.' : 'No transfers match this view.'}</b></div>}
    </div>}
    {showForm && Dialog && <TransferForm Dialog={Dialog} equipment={state.equipment || []} sites={state.sites || []} token={token} onClose={() => setShowForm(false)} onSaved={() => { setNotice('Transfer submitted. The source-site PM has been notified.'); void load(); }} />}
  </section>;
}
