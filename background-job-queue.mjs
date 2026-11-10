export function createBackgroundJobQueue({concurrency, onError}) {
  const pending = new Set();
  const queued = [];
  let active = 0;

  function drain() {
    while (active < concurrency && queued.length) {
      const task = queued.shift();
      active += 1;
      void Promise.resolve().then(task).catch(onError).finally(() => {
        active -= 1;
        pending.delete(task);
        drain();
      });
    }
  }

  return function enqueue(task) {
    if (pending.has(task)) return;
    pending.add(task);
    queued.push(task);
    drain();
  };
}
