// Equipment master changes (add, edit, delete, import) are approved by one shared OTP sent to the
// authorised mobiles. The same file is used by Pulse and Pulse-II; both servers expose
// POST /api/equipment-master/changes and POST /api/equipment-master/changes/:id/verify.
export const validEquipmentOtp = code => /^\d{6}$/.test(String(code || '').trim());

export function equipmentChangeText(summary = {}) {
  const parts = [['add', 'add'], ['edit', 'edit'], ['delete', 'delete']]
    .filter(([key]) => summary[key]).map(([key, word]) => `${summary[key]} ${word}${summary[key] === 1 ? '' : 's'}`);
  return parts.join(', ') || 'no changes';
}

const post = async (url, token, body) => {
  let response;
  try {
    response = await fetch(url, {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify(body)});
  } catch { throw new Error('Could not reach the server. Nothing was changed; please try again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (HTTP ${response.status}). Nothing was changed.`), {status: response.status});
  return data;
};

const element = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
};

// Requests the OTP for `changes`, asks for the code, and resolves with the applied result.
// Rejects with error.cancelled when the user closes the dialog; nothing is changed then.
export async function approveEquipmentChanges({token, changes}) {
  let pending = await post('/api/equipment-master/changes', token, {changes});
  return new Promise((resolve, reject) => {
    const status = element('p', {role: 'status', style: 'margin:0 0 12px;line-height:1.45'});
    const error = element('p', {role: 'alert', style: 'margin:8px 0 0;color:#b42318;min-height:1.2em'});
    const input = element('input', {type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, placeholder: '6-digit OTP', style: 'font-size:20px;letter-spacing:6px;padding:8px 10px;width:100%;box-sizing:border-box'});
    input.setAttribute('aria-label', 'Equipment master OTP');
    const verify = element('button', {type: 'submit', textContent: 'Verify & apply', style: 'background:#1d4ed8;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer'});
    const resend = element('button', {type: 'button', textContent: 'Resend OTP', style: 'padding:8px 12px;cursor:pointer'});
    const cancel = element('button', {type: 'button', textContent: 'Cancel', style: 'padding:8px 12px;cursor:pointer'});
    const form = element('form', {method: 'dialog'}, [
      element('h2', {textContent: 'Approve Equipment master changes', style: 'margin:0 0 8px;font-size:18px'}),
      status, input, error,
      element('div', {style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap'}, [cancel, resend, verify]),
    ]);
    const dialog = element('dialog', {style: 'max-width:420px;width:calc(100% - 32px);border:1px solid #d0d5dd;border-radius:10px;padding:20px;color:#101828;background:#fff'}, form);
    dialog.setAttribute('aria-label', 'Equipment master OTP');
    let busy = false, timer;
    const describe = () => {
      const left = Math.max(0, Math.round((Date.parse(pending.expiresAt) - Date.now()) / 1000));
      const clock = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left` : 'expired, resend the OTP';
      const to = (pending.sentTo || []).join(', ');
      status.textContent = `One OTP was sent to ${to || 'the authorised mobiles'} for ${equipmentChangeText(pending.summary)}. Enter the code from any approver (${clock}).`;
      if (pending.failures?.length) status.textContent += ` Not delivered: ${pending.failures.length}.`;
    };
    const setBusy = value => { busy = value; for (const button of [verify, resend]) button.disabled = value; };
    const close = () => { clearInterval(timer); dialog.close(); dialog.remove(); };
    cancel.onclick = () => { close(); reject(Object.assign(new Error('Equipment master changes were cancelled. Nothing was changed.'), {cancelled: true})); };
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel.onclick(); });
    resend.onclick = async () => {
      if (busy) return; setBusy(true); error.textContent = '';
      try { pending = await post('/api/equipment-master/changes', token, {changes}); input.value = ''; describe(); input.focus(); }
      catch (cause) { error.textContent = cause.message; } finally { setBusy(false); }
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (busy) return;
      if (!validEquipmentOtp(input.value)) { error.textContent = 'Enter the six-digit OTP.'; return; }
      setBusy(true); error.textContent = '';
      try {
        const result = await post(`/api/equipment-master/changes/${encodeURIComponent(pending.id)}/verify`, token, {otp: input.value.trim()});
        close(); resolve(result);
      } catch (cause) { error.textContent = cause.message; setBusy(false); }
    };
    document.body.append(dialog);
    describe(); timer = setInterval(describe, 1000);
    dialog.showModal(); input.focus();
  });
}

// Builds the change list each Equipment master action needs.
export const equipmentChanges = {
  add: records => records.map(record => ({operation: 'add', record, label: record.door || record.equipmentName || ''})),
  edit: (id, record) => [{operation: 'edit', id, record, label: record.door || record.equipmentName || ''}],
  remove: records => records
    .filter(record => Number.isSafeInteger(Number(record?.id)) && Number(record.id) > 0)
    .map(record => ({operation: 'delete', id: Number(record.id), label: record.door || record.equipmentName || ''})),
};
