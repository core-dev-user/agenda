"use strict"

// Teste de conexão das Salas: só lê, não muda nada no PC.
// Pergunta ao servidor de encontro (0.peerjs.com) e a um endereço de controle (Google) se respondem,
// e guarda o código de erro do Chromium (ex.: net::ERR_NAME_NOT_RESOLVED), que diz o que está bloqueando.
// Os endereços são fixos: a página não consegue usar isto para acessar outra coisa.

const SIGNAL_HOST = "0.peerjs.com"
const TARGETS = {
  // o mesmo pedido que o PeerJS faz para pegar um id
  signal: () => `https://${SIGNAL_HOST}/peerjs/id?ts=${Date.now()}${Math.random().toString().slice(2, 8)}&version=1.5.5`,
  // controle: se isto também falha, é a internet (ou o relógio), não o servidor de encontro
  control: () => "https://www.gstatic.com/generate_204",
  // sem HTTPS: responde mesmo com o relógio do PC errado, e o cabeçalho Date mostra a hora certa
  clock: () => "http://www.gstatic.com/generate_204",
}
const TIMEOUT_MS = 8000

/** traduz a mensagem de erro do Chromium/Node num tipo que a interface entende */
function errorKind(msg) {
  const m = String(msg || "")
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|ERR_NAME_RESOLUTION_FAILED/i.test(m)) return "dns"
  if (/ERR_CERT_DATE_INVALID/i.test(m)) return "clock"
  if (/ERR_CERT|ERR_SSL|CERT_|SSL_|self.signed/i.test(m)) return "cert"
  if (/ERR_PROXY|ERR_TUNNEL|ERR_MANDATORY_PROXY/i.test(m)) return "proxy"
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ENETUNREACH|ERR_ADDRESS_UNREACHABLE/i.test(m)) return "offline"
  if (/ERR_BLOCKED_BY|ERR_ACCESS_DENIED|ERR_NETWORK_ACCESS_DENIED/i.test(m)) return "blocked"
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(m)) return "refused"
  if (/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ECONNRESET/i.test(m)) return "reset"
  if (/ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|ETIMEDOUT|abort|timeout/i.test(m)) return "timeout"
  if (/^HTTP 5\d\d/.test(m)) return "server"
  return "other"
}

/** endereço que filtros de DNS (AdGuard, Pi-hole, NextDNS, antivírus) devolvem para "bloqueado" */
function sinkhole(addr) {
  return addr === "0.0.0.0" || addr === "::" || addr === "::1" || /^127\./.test(addr) || /^0\./.test(addr)
}

async function probeUrl(fetchImpl, url, now = Date.now) {
  const started = now()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const r = await fetchImpl(url, { signal: ctl.signal, redirect: "manual", cache: "no-store", headers: { "User-Agent": "Widgy/0.3 (teste de conexao)" } })
    const ms = now() - started
    const date = r.headers?.get?.("date") || ""
    try { await r.body?.cancel?.() } catch { /* sem corpo */ }
    // portal de login (Wi-Fi de hotel/escola) costuma redirecionar
    if (r.status >= 300 && r.status < 400) return { ok: false, ms, status: r.status, kind: "portal", error: "redirecionado", date }
    if (r.status >= 500) return { ok: false, ms, status: r.status, kind: "server", error: `HTTP ${r.status}`, date }
    if (r.status >= 400) return { ok: false, ms, status: r.status, kind: "blocked", error: `HTTP ${r.status}`, date }
    return { ok: true, ms, status: r.status, kind: "", error: "", date }
  } catch (e) {
    const error = String(e?.message || e).slice(0, 160)
    return { ok: false, ms: now() - started, status: 0, kind: errorKind(error), error, date: "" }
  } finally { clearTimeout(timer) }
}

async function lookupHost(lookup, host) {
  try {
    const list = await lookup(host, { all: true })
    const addresses = (Array.isArray(list) ? list : [list]).map((x) => (typeof x === "string" ? x : x?.address)).filter(Boolean)
    return { ok: addresses.length > 0, addresses, sinkhole: addresses.length > 0 && addresses.every(sinkhole), error: "" }
  } catch (e) {
    return { ok: false, addresses: [], sinkhole: false, error: String(e?.code || e?.message || e).slice(0, 80) }
  }
}

/**
 * Roda os testes em paralelo (no máximo ~8 s).
 * @param {{ fetch: typeof fetch, lookup: Function, now?: () => number }} deps
 */
async function probe(deps) {
  const now = deps.now || Date.now
  const [dns, signal, control, clock] = await Promise.all([
    lookupHost(deps.lookup, SIGNAL_HOST),
    probeUrl(deps.fetch, TARGETS.signal(), now),
    probeUrl(deps.fetch, TARGETS.control(), now),
    probeUrl(deps.fetch, TARGETS.clock(), now),
  ])
  // diferença entre o relógio do PC e a hora do servidor (positiva: o PC está adiantado)
  const ref = clock.date || control.date || signal.date
  const parsed = ref ? Date.parse(ref) : NaN
  const clockSkewMs = Number.isFinite(parsed) ? Math.round(now() - parsed) : null
  return { at: now(), dns, signal, control, clockSkewMs }
}

function register(ipcMain, netImpl) {
  const dnsp = require("node:dns").promises
  let running = null
  ipcMain.handle("rooms:probe", () => {
    // dois cliques seguidos não disparam o teste duas vezes
    if (!running) running = probe({ fetch: netImpl.fetch.bind(netImpl), lookup: dnsp.lookup }).finally(() => { running = null })
    return running
  })
}

module.exports = { register, probe, probeUrl, errorKind, sinkhole, SIGNAL_HOST }
