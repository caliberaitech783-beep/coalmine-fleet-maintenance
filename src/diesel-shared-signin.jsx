import { useEffect } from 'react';

export function useDieselSharedSignIn(session) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dieselSignIn') !== '1' || !session?.token) return;
    const state = params.get('state');
    const challenge = params.get('code_challenge');
    const controller = new AbortController();

    async function completeSignIn() {
      const response = await fetch('/api/diesel-sso/continue', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state, challenge }),
        signal: controller.signal,
      });
      if (!response.ok || controller.signal.aborted) return;
      const { redirectUrl } = await response.json();
      if (!controller.signal.aborted && redirectUrl) window.location.replace(redirectUrl);
    }

    void completeSignIn().catch(() => {});
    return () => controller.abort();
  }, [session?.token]);
}
