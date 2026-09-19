// Byte-accurate progress for streamed downloads (backup export / stored backup).

/** Content-Length as a number, or 0 when the server did not send one. */
export function responseTotalBytes(response) {
  const value = Number(response?.headers?.get?.("content-length") || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Whole percentage 0-100 (never 100 until every byte arrived), or null when the total is unknown. */
export function transferPercent(loaded, total) {
  if (!(total > 0)) return null;
  const ratio = Math.max(0, Math.min(1, Number(loaded || 0) / total));
  return loaded >= total ? 100 : Math.min(99, Math.floor(ratio * 100));
}

/** "12.4 MB of 48.0 MB" / "12.4 MB" when the total is unknown. */
export function transferLabel(loaded, total, format) {
  return total > 0 ? `${format(loaded)} of ${format(total)}` : format(loaded);
}

/** Wraps a response body so every chunk reports progress; the bytes pass through untouched. */
export function trackedBody(response, onProgress) {
  const total = responseTotalBytes(response);
  let loaded = 0;
  onProgress?.(0, total);
  return response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      loaded += chunk?.byteLength || 0;
      onProgress?.(loaded, total);
      controller.enqueue(chunk);
    },
    flush() { onProgress?.(total || loaded, total || loaded); },
  }));
}
