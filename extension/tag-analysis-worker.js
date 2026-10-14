// Work itself is persisted on tags. This runner only coalesces wakeups and
// processes a small serial batch of paper profiles or topic syntheses. Each
// completed step is persisted; a Chrome alarm resumes the remaining work.
export function createTagAnalysisRunner({ updateNext, notify, scheduleWake, clearWake, keepAlive,
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
    let phase = 'schedule-wakeup';
    try {
      await scheduleWake();
      phase = 'debounce';
      await debounce();
      for (let count = 0; count < batchSize; count++) {
        requested = false;
        const recover = recoverRequested;
        recoverRequested = false;
        phase = 'update-next';
        const result = await updateNext({ recover });
        phase = 'notify';
        await notify({ type: 'paper-analyses-updated', tagId: result.tagId || '',
          status: result.analysis?.status || '', error: result.error || '' });
        if (!result.remaining && !requested) {
          phase = 'clear-wakeup';
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
      // Never log the error object, request, paper inputs, or configuration.
      // Keep the same diagnostic message sent to the UI, bounded for the console.
      const errorName = ['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
        'AbortError', 'TimeoutError', 'InvalidStateError', 'NotFoundError',
        'QuotaExceededError', 'DataCloneError', 'TransactionInactiveError',
        'UnknownError', 'VersionError', 'SecurityError'].includes(error?.name) ? error.name : 'Error';
      console.error('[Paper Mind] Tag analysis worker failed', {
        phase, errorName, message: String(error?.message || 'Tag analysis update failed').slice(0, 500)
      });
      await notify({ type: 'paper-analyses-updated', error: error?.message || 'Tag analysis update failed' }).catch(() => {});
    } finally {
      stop();
    }
  }

  return { request };
}
