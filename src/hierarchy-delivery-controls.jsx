import React, {useEffect, useState} from 'react';

// Only Hierarchy master edits these organisation-wide gates. Old values remain
// the fallback until the administrator saves the hierarchy row explicitly.
export default function HierarchyDeliveryControls({row, designationKey, token, value, onChange}) {
  const [recipients, setRecipients] = useState([]), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    onChange(null); setError('');
    fetch('/api/report-schedule-settings', {headers:{Authorization:`Bearer ${token}`}, cache:'no-store'})
      .then(async response => {const details = await response.json(); if (!response.ok) throw Error(details.error || 'Could not load organisation delivery settings.'); return details;})
      .then(details => {
        if (!active) return;
        const previous = details.settings.designations[designationKey];
        if (!previous) throw Error('This designation is not mapped to automatic report delivery.');
        setRecipients(details.recipients[designationKey] || []);
        onChange({deliveryEnabled:row.deliveryEnabled ?? previous.enabled,
          deliveryAllRecipients:row.deliveryAllRecipients ?? previous.allRecipients,
          deliveryRecipientLogins:row.deliveryRecipientLogins ?? previous.recipientLogins});
      }).catch(error => {if(active)setError(error.message);});
    return () => {active = false;};
  },[row.rowKey, designationKey, token, retry, onChange]);
  return <fieldset className="hierarchy-access-editor full hierarchy-recipient-controls">
    <legend>Organisation delivery recipients</legend>
    <p>These controls affect the whole designation. Personal preferences are under Reports → My report schedules.</p>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></p> : !value ? <p>Loading saved delivery controls…</p> : <>
      <label><input type="checkbox" checked={value.deliveryEnabled} onChange={event => onChange({...value,deliveryEnabled:event.target.checked})} /> Organisation delivery active</label>
      <label><input type="checkbox" checked={value.deliveryAllRecipients} onChange={event => onChange({...value,deliveryAllRecipients:event.target.checked})} /> Send to every matching user</label>
      {!value.deliveryAllRecipients && <div className="hierarchy-access-grid">{recipients.length ? recipients.map(recipient => <label key={recipient.login}><input type="checkbox" checked={value.deliveryRecipientLogins.includes(recipient.login)} onChange={event => onChange({...value,deliveryRecipientLogins:event.target.checked ? [...value.deliveryRecipientLogins,recipient.login] : value.deliveryRecipientLogins.filter(login => login !== recipient.login)})} /><span>{recipient.name} · {recipient.login}{!recipient.hasPhone && ' · phone missing'}</span></label>) : <p>No users match this designation.</p>}</div>}
      {!value.deliveryAllRecipients && !value.deliveryRecipientLogins.length && <p>No recipients selected. This designation will not receive organisation report bundles.</p>}
    </>}
  </fieldset>;
}
