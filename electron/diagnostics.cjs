"use strict"
// Diagnóstico leve e privado: registra eventos de congelamento / queda do renderer
// sem nomes de janelas, caminhos de arquivos do usuário ou dados de widgets.
const fs = require("node:fs")
const path = require("node:path")
const { performance } = require("node:perf_hooks")

const MAX_BYTES = 256 * 1024
const ALLOWED = new Set(["startup", "renderer-unresponsive", "renderer-responsive", "renderer-gone", "gpu-gone", "main-loop-delay", "renderer-reload", "renderer-reload-skipped"])
const REASONS = new Set(["clean-exit", "abnormal-exit", "killed", "crashed", "oom", "launch-failed", "integrity-failure"])

function createLogger(userData) {
  const file = path.join(userData, "widgy-diagnostics.log")
  let pending = Promise.resolve()
  const write = (kind, details = {}) => {
    if (!ALLOWED.has(kind)) return
    const safe = { at: new Date().toISOString(), kind }
    if (REASONS.has(details.reason)) safe.reason = details.reason
    if (Number.isInteger(details.exitCode)) safe.exitCode = details.exitCode
    if (Number.isFinite(details.delayMs)) safe.delayMs = Math.min(600_000, Math.max(0, Math.round(details.delayMs)))
    if (Number.isFinite(details.rssMiB)) safe.rssMiB = Math.max(0, Math.round(details.rssMiB))
    if (["desktop", "app", "screen"].includes(details.mode)) safe.mode = details.mode
    const line = JSON.stringify(safe) + "\n"
    pending = pending.catch(() => {}).then(async () => {
      const stat = await fs.promises.stat(file).catch(() => null)
      if (stat && stat.size + Buffer.byteLength(line) > MAX_BYTES) {
        await fs.promises.rename(file, file + ".old").catch(() => {})
      }
      await fs.promises.appendFile(file, line, { encoding: "utf8", mode: 0o600 })
    }).catch(() => {})
  }
  return { file, write, flush: () => pending }
}

/** Uma leitura de relógio a cada 5s; não amostra processos nem causa I/O periódico. */
function monitorMainLoop(logger) {
  let last = performance.now()
  const intervalMs = 5000
  const timer = setInterval(() => {
    const now = performance.now()
    const delayMs = now - last - intervalMs
    last = now
    if (delayMs > 2500) logger.write("main-loop-delay", { delayMs, rssMiB: process.memoryUsage().rss / 1048576 })
  }, intervalMs)
  timer.unref?.()
  return () => clearInterval(timer)
}

function attachWindowDiagnostics(win, logger, mode) {
  let unresponsiveSince = 0
  let lastRecoveryAt = 0
  let recoveryCount = 0
  const log = (kind, data = {}) => logger.write(kind, { ...data, mode: mode() })
  const onUnresponsive = () => {
    if (unresponsiveSince) return
    unresponsiveSince = Date.now()
    log("renderer-unresponsive", { rssMiB: process.memoryUsage().rss / 1048576 })
  }
  const onResponsive = () => {
    if (!unresponsiveSince) return
    const delayMs = Date.now() - unresponsiveSince
    unresponsiveSince = 0
    log("renderer-responsive", { delayMs })
  }
  const onGone = (_event, details = {}) => {
    const reason = REASONS.has(details.reason) ? details.reason : "abnormal-exit"
    log("renderer-gone", { reason, exitCode: details.exitCode })
    // Recupera queda efetiva de renderer, mas nunca reinicia uma janela que
    // simplesmente demora a responder durante um jogo ou importação.
    const now = Date.now()
    if (now - lastRecoveryAt > 10 * 60 * 1000) recoveryCount = 0
    if (reason === "clean-exit" || recoveryCount >= 2) {
      log("renderer-reload-skipped")
      return
    }
    lastRecoveryAt = now
    recoveryCount++
    setTimeout(() => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        log("renderer-reload")
        win.webContents.reload()
      }
    }, 1200).unref?.()
  }
  win.on("unresponsive", onUnresponsive)
  win.on("responsive", onResponsive)
  win.webContents.on("render-process-gone", onGone)
  win.on("closed", () => {
    win.removeListener("unresponsive", onUnresponsive)
    win.removeListener("responsive", onResponsive)
    unresponsiveSince = 0
  })
}

module.exports = { createLogger, monitorMainLoop, attachWindowDiagnostics }
