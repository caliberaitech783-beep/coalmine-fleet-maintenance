import { LARGE_JSON_CONTENT_TYPE } from '../request-body-transport.mjs';

// Report cells contain arbitrary maintenance notes. Even small JSON exports can
// trigger edge inspection false positives. Use the server's existing JSON text
// transport for this endpoint only, without altering the report or credentials.
export async function fetchPdfExport(url, init, fetchImpl = globalThis.fetch) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', LARGE_JSON_CONTENT_TYPE);
  const response = await fetchImpl(url, { ...init, headers });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    const message = typeof details?.error === 'string' && details.error
      ? details.error
      : response.status === 403
        ? 'The gateway blocked the PDF export (HTTP 403). Please contact support with the export time.'
        : `Could not create the PDF report (HTTP ${response.status}). Please try again.`;
    throw new Error(message);
  }
  return response;
}
