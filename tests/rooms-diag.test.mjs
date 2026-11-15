// Teste de conexão das Salas: o módulo do processo principal (net-probe.cjs) e o veredito (roomsDiag-core.ts)
import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { verdict, report, clockWrong } from "../src/lib/roomsDiag-core.ts"

const require = createRequire(import.meta.url)
const np = require("../electron/net-probe.cjs")

const okHit = { ok: true, ms: 80, status: 200, kind: "", error: "", date: "" }
const fail = (kind, error = "") => ({ ok: false, ms: 50, status: 0, kind, error, date: "" })
const probe = (o = {}) => ({ at: 0, dns: { ok: true, addresses: ["104.21.1.1"], sinkhole: false, error: "" }, signal: okHit, control: okHit, clockSkewMs: 0, ...o })
const wsOk = { ok: true, ms: 120, error: "" }
const iceOk = { srflx: true, relay: true, ownRelay: null }

test("errorKind traduz os códigos do Chromium/Node", () => {
  assert.equal(np.errorKind("net::ERR_NAME_NOT_RESOLVED"), "dns")
  assert.equal(np.errorKind("getaddrinfo ENOTFOUND 0.peerjs.com"), "dns")
  assert.equal(np.errorKind("net::ERR_CERT_DATE_INVALID"), "clock")
  assert.equal(np.errorKind("net::ERR_CERT_AUTHORITY_INVALID"), "cert")
  assert.equal(np.errorKind("net::ERR_PROXY_CONNECTION_FAILED"), "proxy")
  assert.equal(np.errorKind("net::ERR_INTERNET_DISCONNECTED"), "offline")
  assert.equal(np.errorKind("net::ERR_CONNECTION_RESET"), "reset")
  assert.equal(np.errorKind("net::ERR_CONNECTION_REFUSED"), "refused")
  assert.equal(np.errorKind("net::ERR_BLOCKED_BY_CLIENT"), "blocked")
  assert.equal(np.errorKind("This operation was aborted"), "timeout")
  assert.equal(np.errorKind("algo estranho"), "other")
})

test("sinkhole reconhece respostas de filtro de DNS", () => {
  for (const a of ["0.0.0.0", "127.0.0.1", "::", "::1"]) assert.ok(np.sinkhole(a), a)
  for (const a of ["104.21.1.1", "2606:4700::1"]) assert.ok(!np.sinkhole(a), a)
})

test("probe: só pede os endereços fixos e mede o relógio pelo cabeçalho Date", async () => {
  const urls = []
  const now = () => Date.parse("2026-11-15T12:10:00Z")
  const fetch = async (url) => {
    urls.push(url)
    return { status: url.includes("peerjs") ? 200 : 204, headers: { get: (h) => (h === "date" ? "Sun, 15 Nov 2026 12:00:00 GMT" : null) }, body: null }
  }
  const lookup = async () => [{ address: "0.0.0.0", family: 4 }]
  const r = await np.probe({ fetch, lookup, now })
  assert.equal(urls.length, 3)
  assert.ok(urls.some((u) => u.startsWith("https://0.peerjs.com/peerjs/id?")))
  assert.ok(urls.includes("https://www.gstatic.com/generate_204"))
  assert.ok(urls.includes("http://www.gstatic.com/generate_204"))
  assert.equal(r.signal.ok, true)
  assert.equal(r.dns.sinkhole, true)
  assert.equal(r.clockSkewMs, 10 * 60 * 1000)
})

test("probe: erro de rede vira tipo, sem derrubar o teste", async () => {
  const fetch = async (url) => { if (url.includes("peerjs")) throw new Error("net::ERR_CONNECTION_RESET"); return { status: 204, headers: { get: () => null } } }
  const lookup = async () => { throw Object.assign(new Error("x"), { code: "ENOTFOUND" }) }
  const r = await np.probe({ fetch, lookup })
  assert.equal(r.signal.ok, false)
  assert.equal(r.signal.kind, "reset")
  assert.equal(r.control.ok, true)
  assert.equal(r.dns.ok, false)
  assert.equal(r.clockSkewMs, null)
})

test("probe: redirecionamento é portal de login, 5xx é problema do servidor", async () => {
  const fetch = async (url) => ({ status: url.includes("peerjs") ? 503 : 302, headers: { get: () => null } })
  const r = await np.probe({ fetch, lookup: async () => [] })
  assert.equal(r.signal.kind, "server")
  assert.equal(r.control.kind, "portal")
})

test("veredito: tudo funcionando", () => {
  const v = verdict({ probe: probe(), ws: wsOk, ice: iceOk })
  assert.equal(v.level, "ok")
})

test("veredito: relógio errado vem antes de tudo (mesmo com o resto falhando)", () => {
  const v = verdict({ probe: probe({ clockSkewMs: -3 * 3600e3, signal: fail("clock"), control: fail("clock") }), ws: { ok: false, ms: 0, error: "x" }, ice: null })
  assert.equal(v.level, "bad")
  assert.match(v.title, /relógio/)
  assert.match(v.title, /3 horas atrasado/)
  assert.ok(clockWrong(probe({ signal: fail("clock") })))
  assert.ok(!clockWrong(probe({ clockSkewMs: 60_000 })))
})

test("veredito: sem internet nenhuma", () => {
  const v = verdict({ probe: probe({ signal: fail("offline"), control: fail("offline") }), ws: { ok: false, ms: 0, error: "" }, ice: null })
  assert.match(v.title, /sem internet/)
})

test("veredito: internet ok mas 0.peerjs.com bloqueado (antivírus/firewall)", () => {
  const v = verdict({ probe: probe({ signal: fail("reset", "net::ERR_CONNECTION_RESET") }), ws: { ok: false, ms: 0, error: "" }, ice: null })
  assert.equal(v.level, "bad")
  assert.match(v.title, /bloqueia 0\.peerjs\.com/)
  assert.ok(v.fixes.some((f) => /antivírus/i.test(f)))
  assert.ok(v.fixes.some((f) => /Firewall do Windows/.test(f)))
})

test("veredito: filtro de DNS", () => {
  const v = verdict({ probe: probe({ dns: { ok: true, addresses: ["0.0.0.0"], sinkhole: true, error: "" }, signal: fail("refused") }), ws: { ok: false, ms: 0, error: "" }, ice: null })
  assert.match(v.title, /filtro de DNS/)
})

test("veredito: interceptação de HTTPS", () => {
  const v = verdict({ probe: probe({ signal: fail("cert", "net::ERR_CERT_AUTHORITY_INVALID") }), ws: wsOk, ice: iceOk })
  assert.match(v.title, /interceptando/)
})

test("veredito: HTTPS passa mas o WebSocket é bloqueado", () => {
  const v = verdict({ probe: probe(), ws: { ok: false, ms: 10, error: "fechada (1006)" }, ice: iceOk })
  assert.match(v.title, /WebSocket/)
})

test("veredito: servidor de encontro fora do ar não culpa a rede", () => {
  const v = verdict({ probe: probe({ signal: { ...fail("server"), status: 503 } }), ws: { ok: false, ms: 0, error: "" }, ice: null })
  assert.equal(v.level, "warn")
  assert.match(v.title, /Não é a sua rede/)
})

test("veredito: entra na sala mas UDP bloqueado sugere retransmissão", () => {
  const v = verdict({ probe: probe(), ws: wsOk, ice: { srflx: false, relay: false, ownRelay: null } })
  assert.equal(v.level, "warn")
  assert.ok(v.fixes.some((f) => /Salas › Conexão/.test(f)))
  const v2 = verdict({ probe: probe(), ws: wsOk, ice: { srflx: true, relay: true, ownRelay: false } })
  assert.match(v2.title, /retransmissão .* não respondeu/)
})

test("veredito: sem o processo principal (versão web) usa só o WebSocket", () => {
  assert.equal(verdict({ probe: null, ws: wsOk, ice: iceOk }).level, "ok")
  // sem o teste de HTTPS não afirma que o servidor "responde"
  const v = verdict({ probe: null, ws: { ok: false, ms: 0, error: "" }, ice: null })
  assert.match(v.title, /Não deu para conectar/)
  assert.doesNotMatch(v.title, /responde/)
})

test("relatório para copiar traz os resultados e nenhum endereço do PC", () => {
  const d = { probe: probe({ signal: fail("reset", "net::ERR_CONNECTION_RESET") }), ws: { ok: false, ms: 0, error: "fechada (1006)" }, ice: { srflx: true, relay: false, ownRelay: null } }
  const txt = report(d, verdict(d))
  assert.match(txt, /Servidor de encontro \(HTTPS\): falhou: reset/)
  assert.match(txt, /tempo real\): falhou/)
  assert.match(txt, /UDP\/STUN\): ok/)
  assert.doesNotMatch(txt, /192\.168|10\.0\./)
})
