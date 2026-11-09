/** At most one asynchronous native request, plus one bounded follow-up when events arrive. */
function coalescedRunner(run, onError, delay = 75) {
  let timer = null, busy = false, dirty = false, stopped = false
  const request = () => {
    if (stopped) return
    dirty = true
    if (busy || timer !== null) return
    timer = setTimeout(async () => {
      timer = null; busy = true; dirty = false
      try { await run() } catch (e) { if (!stopped) onError(e) }
      finally { busy = false; if (dirty) request() }
    }, delay)
  }
  return { request, stop() { stopped = true; dirty = false; clearTimeout(timer); timer = null } }
}
module.exports = { coalescedRunner }
