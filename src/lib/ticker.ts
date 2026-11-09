/** A single scheduled wake-up, with the rate recalculated after every tick. */
export function startTicker(step: () => void, delay: () => number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const refresh = () => {
    if (stopped) return
    clearTimeout(timer)
    step()
    timer = setTimeout(refresh, delay())
  }
  timer = setTimeout(refresh, delay())
  return {
    refresh,
    stop: () => { stopped = true; clearTimeout(timer) },
  }
}

export function stopwatchDelay(paused: boolean, deadline: number | null, now = Date.now()) {
  const cadence = paused || deadline !== null ? 1000 : 33
  // Wake at the timer deadline even when the UI is in its slow background cadence.
  return deadline !== null && deadline > now ? Math.min(cadence, deadline - now) : cadence
}
