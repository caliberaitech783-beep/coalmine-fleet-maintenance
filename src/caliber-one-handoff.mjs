// Caliber One, one sign-in (owner, 28 Nov 2026). Pulse-II MIS sends a signed-out person to
// /?login=mis&misState=…&misChallenge=…, HR Pulse to /?hrSignIn=1&state=…&code_challenge=….
// A person already signed in to Pulse goes straight on, without a second password; anyone else
// gets the sign-in they had before (Pulse's MIS sign-in form, HR Pulse's own form).
const misOrigin = 'https://pulse-ll.cmll.in';
export const hrOrigin = 'https://hrpulse.cmll.in';
const isProof = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

// "Sign in another way" adds misManual=1 and shows the MIS sign-in form.
export function isMisContinue(search) {
  const query = new URLSearchParams(search);
  return query.get('login') === 'mis' && query.get('misManual') !== '1' &&
    isProof(query.get('misState')) && isProof(query.get('misChallenge'));
}
export function misManualUrl(href) {
  const url = new URL(href);
  url.searchParams.set('misManual', '1');
  return url.pathname + url.search + url.hash;
}

export function isHrLogin(search) {
  return new URLSearchParams(search).get('hrSignIn') === '1';
}
// Back to HR Pulse's own sign-in form: signin (no Pulse session) or noaccess.
export const hrBack = reason => `${hrOrigin}/?hrSso=${encodeURIComponent(reason)}`;

async function post(fetcher, path, token, body, signal) {
  const response = await fetcher(path, {
    method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const details = await response.json().catch(() => ({}));
  return { response, details };
}

export async function completeMisHandoff(search, token, remember, signal, fetcher) {
  const query = new URLSearchParams(search);
  const state = query.get('misState'), challenge = query.get('misChallenge');
  const { response, details } = await post(fetcher, '/api/mis-login/continue', token, { state, challenge, remember: remember === true }, signal);
  if (!response.ok) return { status: response.status, message: details.error || 'Pulse could not open MIS. Please try again.' };
  const target = new URL(details.redirectUrl);
  if (target.origin !== misOrigin || target.pathname !== '/api/mis-credentials/callback' ||
      target.searchParams.get('state') !== state || !isProof(target.searchParams.get('code'))) {
    throw new Error('Invalid MIS sign-in response.');
  }
  return { destination: target.href };
}

export async function completeHrHandoff(search, token, signal, fetcher) {
  const query = new URLSearchParams(search);
  const state = query.get('state'), challenge = query.get('code_challenge');
  if (!isProof(state) || !isProof(challenge)) return { destination: hrBack('signin') };
  const { response, details } = await post(fetcher, '/api/hr-login/continue', token, { state, challenge }, signal);
  if (response.status === 403) return { destination: hrBack('noaccess') };
  if (response.status === 401) return { destination: hrBack('signin') };
  if (!response.ok) return { status: response.status, message: details.error || 'Pulse could not open HR Pulse. Please try again.' };
  const target = new URL(details.redirectUrl);
  if (target.origin !== hrOrigin || target.pathname !== '/' ||
      target.searchParams.get('hrState') !== state || !isProof(target.searchParams.get('hrCode'))) {
    throw new Error('Invalid HR sign-in response.');
  }
  return { destination: target.href };
}
