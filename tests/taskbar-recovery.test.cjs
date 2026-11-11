const { test } = require("node:test")
const assert = require("node:assert/strict")
const { createRecoveryBudget } = require("../electron/taskbar-recovery.cjs")

test("transient failures get bounded exponential retries without changing the saved preference", () => {
  const budget = createRecoveryBudget()
  assert.deepEqual(budget.failure(1000), { retry: true, attempt: 1, delayMs: 1500 })
  assert.deepEqual(budget.failure(2000), { retry: true, attempt: 2, delayMs: 3000 })
  assert.deepEqual(budget.failure(3000), { retry: true, attempt: 3, delayMs: 6000 })
  assert.deepEqual(budget.failure(4000), { retry: false, attempt: 4, delayMs: 0 })
})
test("recovery budget starts over after a sustained healthy period", () => {
  const budget = createRecoveryBudget()
  budget.failure(1000)
  budget.failure(2000)
  assert.deepEqual(budget.failure(301001), { retry: true, attempt: 1, delayMs: 1500 })
})
test("retry budget supports explicit thresholds for host environments", () => {
  const budget = createRecoveryBudget({ windowMs: 10000, maxRetries: 1, initialDelayMs: 4000 })
  assert.equal(budget.failure(0).delayMs, 4000)
  assert.equal(budget.failure(1000).retry, false)
  assert.equal(budget.failure(12000).retry, true)
})
