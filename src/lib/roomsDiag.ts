/**
 * Teste de conexão das Salas, do jeito que a sala de verdade conecta:
 * 1. pelo processo principal: internet, DNS, HTTPS até 0.peerjs.com e relógio (electron/net-probe.cjs);
 * 2. aqui: o WebSocket do servidor de encontro (o mesmo que o PeerJS abre) e a coleta de rotas WebRTC
 *    (STUN = conexão direta; TURN = retransmissão).
 * Não entra em sala nenhuma e não envia nada de pessoal: só abre e fecha conexões de teste.
 */
import { bridge } from "./bridge"
import { iceParts } from "./rooms"
import { verdict, type DiagInput, type IceResult, type Verdict, type WsResult } from "./roomsDiag-core"

export { report } from "./roomsDiag-core"
export type { DiagInput, Verdict } from "./roomsDiag-core"

const rid = () => "agenda-teste-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

function wsProbe(wait = 10000): Promise<WsResult> {
  const started = performance.now()
  return new Promise((res) => {
    let ws: WebSocket
    let done = false
    const finish = (ok: boolean, error = "") => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { ws.close() } catch { /* já fechado */ }
      res({ ok, ms: Math.round(performance.now() - started), error })
    }
    const timer = setTimeout(() => finish(false, "sem resposta em " + wait / 1000 + " s"), wait)
    try {
      ws = new WebSocket(`wss://0.peerjs.com:443/peerjs?key=peerjs&id=${rid()}&token=${Math.random().toString(36).slice(2)}&version=1.5.5`)
    } catch (e) { return finish(false, String((e as Error)?.message || e)) }
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data))
        if (m?.type === "OPEN") finish(true)
        else if (m?.type === "ERROR" || m?.type === "ID-TAKEN") finish(false, String(m?.payload?.msg || m.type))
      } catch { /* mensagem que não é do PeerJS */ }
    }
    ws.onerror = () => finish(false, "conexão recusada ou interrompida")
    ws.onclose = (ev) => finish(false, "fechada (" + ev.code + ")")
  })
}

/** coleta candidatos ICE e devolve os tipos encontrados (host, srflx, relay) */
async function gather(servers: RTCIceServer[], relayOnly: boolean, wait = 6000): Promise<Set<string>> {
  const types = new Set<string>()
  if (typeof RTCPeerConnection !== "function" || !servers.length) return types
  const pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: relayOnly ? "relay" : "all" })
  try {
    pc.createDataChannel("teste")
    await new Promise<void>((res) => {
      const timer = setTimeout(res, wait)
      pc.onicecandidate = (e) => {
        if (!e.candidate) { clearTimeout(timer); return res() }
        const t = / typ (\w+)/.exec(e.candidate.candidate)?.[1]
        if (t) types.add(t)
        // basta um candidato do tipo procurado
        if (relayOnly ? types.has("relay") : types.has("srflx")) { clearTimeout(timer); res() }
      }
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => { clearTimeout(timer); res() })
    })
  } finally { pc.close() }
  return types
}

async function iceProbe(): Promise<IceResult | null> {
  if (typeof RTCPeerConnection !== "function") return null
  const { stun, own, peerjs } = iceParts()
  const [direct, pub, mine] = await Promise.all([
    gather(stun, false),
    gather([peerjs], true),
    own.length ? gather(own, true) : Promise.resolve(null),
  ])
  return { srflx: direct.has("srflx"), relay: pub.has("relay"), ownRelay: mine ? mine.has("relay") : null }
}

export interface DiagResult { input: DiagInput; verdict: Verdict }

export async function diagnoseRooms(): Promise<DiagResult> {
  const [probe, ws, ice] = await Promise.all([
    bridge.net.roomsProbe ? bridge.net.roomsProbe().catch(() => null) : Promise.resolve(null),
    wsProbe(),
    iceProbe().catch(() => null),
  ])
  const input: DiagInput = { probe, ws, ice }
  return { input, verdict: verdict(input) }
}
