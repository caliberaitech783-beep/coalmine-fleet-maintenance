import React, {useEffect, useState} from 'react';
import {canViewBdAgeingReport} from '../bd-ageing-report.mjs';
import {formatDisplayDateTime} from '../date-time-format.mjs';

const columns = [
  {key:'ref',label:'Request',value:row=>row.ref},
  {key:'site',label:'Site',value:row=>row.site},
  {key:'door',label:'Door number',value:row=>row.door},
  {key:'equipmentGroup',label:'Equipment group',value:row=>row.equipmentGroup},
  {key:'status',label:'Status',value:row=>row.status},
  {key:'start',label:'Breakdown started (IST)',value:row=>formatDisplayDateTime(row.start)},
  {key:'age',label:'BD age',value:row=>row.age},
  {key:'complaint',label:'Reason of BD',value:row=>row.complaint},
];

export default function BdAgeingReport({session, ReportSection, onBack}) {
  const allowed = canViewBdAgeingReport(session);
  const [data,setData] = useState(null);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    (async () => {
      try {
        const response = await fetch('/api/reports/bd-ageing', {headers:{Authorization:`Bearer ${session.token}`},cache:'no-store',signal:controller.signal});
        if (!response.ok) throw new Error(response.status === 403 ? 'You do not have access to BD Ageing Report.' : 'Could not load BD Ageing Report. Please retry.');
        const result = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  },[allowed,session?.token,refresh]);
  if (!allowed) return <section className="panel"><h1>Access denied</h1><p>You do not have access to BD Ageing Report.</p></section>;
  return <section className="reports-page panel pagepanel">
    <header><div><h1>BD Ageing Report</h1><p>Currently open breakdowns · elapsed time from breakdown start · under 2 days excluded.</p></div>
      <div className="reports-header-actions"><button type="button" onClick={onBack}>Back to reports</button><button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>{loading?'Loading…':'Refresh'}</button></div>
    </header>
    {error && <p role="alert">{error}</p>}
    {loading && <p role="status">Loading open breakdowns…</p>}
    {data && <><p>{data.total} requests · {data.scope?.label || 'Assigned sites'} · Updated {formatDisplayDateTime(data.generatedAt)} IST</p>
      {data.groups.map(group=><ReportSection key={group.id} title={`BD Ageing Report — ${group.label}`} description={`${group.description} · ${group.rows.length} requests`} rows={group.rows} columns={columns} rowKey={row=>row.ref} emptyMessage="No open breakdowns in this ageing group." />)}
    </>}
  </section>;
}
