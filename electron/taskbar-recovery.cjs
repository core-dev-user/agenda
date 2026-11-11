// Bounded, exponential taskbar recovery: never hide native Windows controls forever.
// A brief process/renderer failure must not permanently erase the user's preference.
function createRecoveryBudget({ windowMs = 5 * 60_000, maxRetries = 3, initialDelayMs = 1500 } = {}) {
  let attempts = 0
  let firstFailureAt = null
  function failure(now = Date.now()) {
    if (firstFailureAt === null || now - firstFailureAt > windowMs) {
      firstFailureAt = now
      attempts = 0
    }
    attempts++
    const retry = attempts <= maxRetries
    return { retry, attempt: attempts, delayMs: retry ? initialDelayMs * (2 ** (attempts - 1)) : 0 }
  }
  return { failure }
}
module.exports = { createRecoveryBudget }
