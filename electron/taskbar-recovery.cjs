// Bounded, exponential taskbar recovery: never hide native Windows controls forever.
// A brief process/renderer failure must not permanently erase the user's preference.
function createRecoveryBudget({ windowMs = 5 * 60_000, maxRetries = 3, initialDelayMs = 1500, cooldownMs = 60_000, maxCooldownMs = 5 * 60_000 } = {}) {
  let attempts = 0
  let firstFailureAt = null
  /**
   * Primeiras falhas: novas tentativas rápidas (1,5 s, 3 s, 6 s). Depois disso NÃO desiste:
   * continua tentando com pausas maiores (1 min, 2 min… até 5 min), mostrando a barra do Windows
   * só durante a pausa. Antes o Widgy desligava a opção da barra para sempre nesse caso.
   */
  function failure(now = Date.now()) {
    if (firstFailureAt === null || now - firstFailureAt > windowMs) {
      firstFailureAt = now
      attempts = 0
    }
    attempts++
    const fast = attempts <= maxRetries
    const delayMs = fast ? initialDelayMs * (2 ** (attempts - 1)) : Math.min(maxCooldownMs, cooldownMs * (attempts - maxRetries))
    return { retry: true, attempt: attempts, delayMs }
  }
  return { failure }
}
module.exports = { createRecoveryBudget }
