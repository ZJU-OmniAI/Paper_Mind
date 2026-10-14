// Work itself is persisted on tags. This runner only coalesces wakeups and
// processes a small serial batch; a Chrome alarm resumes remaining work.
export function createPaperGraphRunner({ updateNext, notify, scheduleWake, clearWake, keepAlive,
  debounce = () => new Promise(resolve => setTimeout(resolve, 2500)), batchSize = 4 }) {
  let active = null;
  let requested = false;
  let recoverRequested = false;

  function request({ recover = false } = {}) {
    requested = true;
    recoverRequested ||= recover;
    if (active) return active;
    active = drain().finally(() => {
      active = null;
      // A request arriving while the idle alarm is being cleared must not be
      // lost. Remaining batches otherwise wait for the durable wakeup.
      if (requested) request();
    });
    return active;
  }

  async function drain() {
    const stop = keepAlive();
    try {
      await scheduleWake();
      await debounce();
      for (let count = 0; count < batchSize; count++) {
        requested = false;
        const recover = recoverRequested;
        recoverRequested = false;
        const result = await updateNext({ recover });
        await notify({ type: 'paper-graphs-updated', tagId: result.tagId || '',
          status: result.graph?.status || '', error: result.error || '' });
        if (!result.remaining && !requested) {
          await clearWake();
          break;
        }
        // A failed model call is already recorded by storage. Leave the alarm
        // to resume other pending tags instead of hammering a failing backend.
        if (result.error || (!result.processed && !requested)) break;
      }
    } catch (error) {
      // Keep the alarm armed so a worker interruption or storage failure can
      // recover. Storage caps recovery of a repeatedly interrupted model job.
      await notify({ type: 'paper-graphs-updated', error: error?.message || 'Paper graph update failed' }).catch(() => {});
    } finally {
      stop();
    }
  }

  return { request };
}
