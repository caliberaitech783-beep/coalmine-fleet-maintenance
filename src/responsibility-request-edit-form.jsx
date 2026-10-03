import React, {useRef, useState} from 'react';
import MaintenanceOemChoice from './maintenance-oem-choice.jsx';

// Project Managers can edit responsibility, not unrelated maintenance fields.
export default function ResponsibilityRequestEditForm({request, close, onSave, Dialog}) {
  const [previous] = useState(request.oemResponsibility || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const closeDialog = () => { if (!lock.current) close(); };
  return <Dialog title={`Edit request ${request.ref}`} close={closeDialog}>
    <form className="form" onSubmit={async event => {
      event.preventDefault();
      if (lock.current) return;
      const value = new FormData(event.currentTarget).get('oemResponsibility');
      if (!value) {setError('Choose OEM or NON OEM.'); return;}
      lock.current = true; setBusy(true); setError('');
      try {await onSave({ref:request.ref,oemResponsibility:value,previousResponsibility:previous});}
      catch (failure) {setError(failure.message || 'Could not save responsibility.');}
      finally {lock.current = false; setBusy(false);}
    }}>
      <div className="formgrid">
        <label>Equipment group<input value={request.equipmentGroup || request.equipment || ''} readOnly /></label>
        <label>Door number<input value={request.door || ''} readOnly /></label>
        <label>Site location<input value={request.site || ''} readOnly /></label>
        <MaintenanceOemChoice request={request} canEdit />
      </div>
      <p>Changes are applied only when you click Save changes.</p>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" onClick={closeDialog} disabled={busy}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></footer>
    </form>
  </Dialog>;
}
