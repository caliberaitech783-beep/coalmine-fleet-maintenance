// Share the page lock across dialogs: effect cleanup can run parent-first.
const locks = new WeakMap();

export function lockBodyScroll(doc = globalThis.document) {
  const body = doc.body;
  let state = locks.get(body);
  if (!state) {
    state = {overflow: body.style.overflow, count: 0};
    locks.set(body, state);
  }
  state.count++;
  body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.count === 0) {
      body.style.overflow = state.overflow;
      locks.delete(body);
    }
  };
}
