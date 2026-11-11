"use strict"

// Saída HTTP controlada: bloqueia hosts locais, redirecionamentos inseguros,
// downloads enormes e respostas que nunca terminam.
const { isIP } = require("node:net")
const MAX_TEXT_BYTES = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15000

function safeRemoteUrl(raw) {
  if (typeof raw !== "string" || raw.length > 4096) throw new Error("URL inválida")
  let u
  try { u = new URL(raw) } catch { throw new Error("URL inválida") }
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) throw new Error("URL não permitida")
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost")
    || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")
    || host.endsWith(".test") || host.endsWith(".invalid") || isIP(host)) {
    throw new Error("Endereço de rede local não permitido")
  }
  if (!["", "80", "443"].includes(u.port)) throw new Error("Porta não permitida")
  return u.href
}

async function readLimitedText(response, maxBytes) {
  const len = Number(response.headers?.get("content-length"))
  if (Number.isFinite(len) && len > maxBytes) throw new Error("Resposta maior que o limite permitido")
  if (!response.body?.getReader) {
    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length > maxBytes) throw new Error("Resposta maior que o limite permitido")
    return buf.toString("utf8")
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error("Resposta maior que o limite permitido")
      chunks.push(Buffer.from(value))
    }
    return Buffer.concat(chunks, size).toString("utf8")
  } catch (e) {
    await reader.cancel().catch(() => {})
    throw e
  } finally { reader.releaseLock() }
}

async function fetchSafeText(fetchImpl, raw, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_TEXT_BYTES
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS)
  let url = raw
  try {
    for (let hops = 0; hops <= 4; hops++) {
      const safeUrl = safeRemoteUrl(url)
      const response = await fetchImpl(safeUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "Widgy/0.3 (desktop app)" },
      })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location")
        if (!location) throw new Error("Redirecionamento inválido")
        url = new URL(location, safeUrl).href
        continue
      }
      if (!response.ok) throw new Error("Falha HTTP " + response.status)
      return await readLimitedText(response, maxBytes)
    }
    throw new Error("Redirecionamentos demais")
  } finally { clearTimeout(timer) }
}
module.exports = { safeRemoteUrl, readLimitedText, fetchSafeText, MAX_TEXT_BYTES }
