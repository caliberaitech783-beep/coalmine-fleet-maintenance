const origin = 'https://pulse-lll.cmll.in';
export const dieselStart = origin + '/api/sign-in/start';
const isProof = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

export function isDieselLogin(search) {
  const query = new URLSearchParams(search);
  return query.get('dieselSignIn') === '1' || query.get('login') === 'diesel';
}

export async function completeDieselHandoff(search, token, signal, fetcher) {
  const query = new URLSearchParams(search);
  const state = query.get('state');
  const challenge = query.get('code_challenge');
  if (!isProof(state) || !isProof(challenge)) return { destination: dieselStart };
  const response = await fetcher('/api/diesel-sso/continue', {
    method: 'POST', signal,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, challenge }),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    return { message: details.error || 'Pulse could not complete Diesel sign-in. Please try again.' };
  }
  const { redirectUrl } = await response.json();
  const target = new URL(redirectUrl);
  if (target.origin !== origin || target.pathname !== '/api/sign-in/callback' ||
      target.searchParams.get('state') !== state || !isProof(target.searchParams.get('code'))) {
    throw new Error('Invalid Diesel sign-in response.');
  }
  return { destination: target.href };
}
