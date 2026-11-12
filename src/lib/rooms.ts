// Salas entre amigos (P2P): quem entra primeiro vira o anfitrião (guarda a lista de membros e repassa o chat);
// tela e voz vão direto de um PC para o outro (WebRTC). O único servidor usado é o gratuito do PeerJS,
// só para as pessoas se encontrarem — nenhum vídeo ou som passa por ele.
import { create } from "zustand"
import type { DataConnection, MediaConnection, Peer as PeerT } from "peerjs"
import { bridge } from "./bridge"
import { toast } from "./toast"
import { useStore } from "./store"
import { QUALITIES, preferVideoCodec, summarize, withStartBitrate, type LinkStats, type ShareCodec, type ShareQuality } from "./rtcTuning"

export interface Member { id: string; name: string; sharing: boolean; mic: boolean }
export interface ChatMsg { id: string; from: string; name: string; text: string; at: number }
export type ShareAudio = "discord" | "agenda" | "none"
export interface ShareOpts { source: string; quality: ShareQuality; audio: ShareAudio; motion: boolean; codec?: ShareCodec }
/** estado da sua transmissão, para a interface mostrar o que está acontecendo */
export type ShareState = "idle" | "preparing" | "connecting" | "live" | "reconnecting"

type Msg =
  | { t: "hello"; name: string; sharing: boolean; mic: boolean }
  | { t: "members"; list: Member[] }
  | { t: "state"; sharing: boolean; mic: boolean }
  | { t: "chat"; msg: ChatMsg }

interface RoomState {
  status: "idle" | "connecting" | "in" | "error"
  error: string
  code: string
  myId: string
  host: boolean
  members: Member[]
  /** telas recebidas: id do membro → vídeo (com o som do PC dele, se veio) */
  screens: Record<string, MediaStream>
  myScreen: MediaStream | null
  mic: boolean
  chat: ChatMsg[]
  shareInfo: string
  /** sua transmissão: preparando a captura, conectando a quem assiste, no ar ou reconectando */
  shareState?: ShareState
  /** medições reais da sua transmissão (até o primeiro PC que está assistindo) e quantos estão recebendo */
  myStats?: LinkStats | null
  viewers?: number
  /** medições reais de cada tela que você está assistindo (id do membro → números) */
  stats?: Record<string, LinkStats>
  /** perdeu o servidor de encontro e está tentando voltar (a sala continua) */
  reconnecting?: boolean
  /** a rede bloqueou a conexão direta com alguém (sugere configurar um servidor de retransmissão) */
  netHint?: string
}

export const useRoom = create<RoomState>(() => ({
  status: "idle", error: "", code: "", myId: "", host: false, members: [], screens: {}, myScreen: null, mic: false, chat: [], shareInfo: "",
}))

const PREFIX = "agenda-sala-"
const STUN = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }]
/** servidor de retransmissão (TURN) opcional, para redes que bloqueiam conexão direta (ex.: CGNAT de operadora) */
export interface TurnConfig { urls: string; username?: string; credential?: string }
const turnConfig = (): TurnConfig | null => {
  const t = useStore.getState().settings.roomTurn
  return t && t.urls?.trim() ? t : null
}
/**
 * retransmissão pública do PeerJS (a mesma que a biblioteca usa por padrão): sem ela, quando a rede bloqueia a
 * conexão direta (CGNAT, roteador), o vídeo chega "conectado" mas preto para o amigo
 */
const PEERJS_TURN: RTCIceServer = { urls: ["turn:eu-0.turn.peerjs.com:3478", "turn:us-0.turn.peerjs.com:3478"], username: "peerjs", credential: "peerjsp" }
const iceConfig = (): RTCConfiguration => {
  const turn = turnConfig()
  const own: RTCIceServer[] = turn ? [{ urls: turn.urls.trim().split(/[\s,]+/).filter(Boolean), username: turn.username || undefined, credential: turn.credential || undefined }] : []
  return { iceServers: [...STUN, ...own, PEERJS_TURN] }
}
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export const newCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("")
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)

let peer: PeerT | null = null
let myName = ""
let toHost: DataConnection | null = null
const conns = new Map<string, DataConnection>() // anfitrião: um canal por membro
const outCalls = new Map<string, MediaConnection>() // "screen:<id>" | "voice:<id>"
const inCalls = new Set<MediaConnection>()
let micStream: MediaStream | null = null
const voiceEls = new Map<string, HTMLAudioElement>()
let leaving = false

const set = (p: Partial<RoomState>) => useRoom.setState(p)
const me = (): Member => ({ id: useRoom.getState().myId, name: myName, sharing: !!useRoom.getState().myScreen, mic: useRoom.getState().mic })

/* ---------------- anfitrião ---------------- */
function hostMembers(): Member[] {
  const list: Member[] = [me()]
  for (const [id, c] of conns) { const m = (c as any).__member as Member | undefined; if (m) list.push({ ...m, id }) }
  return list
}
function hostBroadcast(msg: Msg) { for (const c of conns.values()) if (c.open) c.send(msg) }
function hostUpdate() {
  const list = hostMembers()
  set({ members: list })
  hostBroadcast({ t: "members", list })
  linkMedia(list)
}
function onHostConn(c: DataConnection) {
  c.on("data", (raw) => {
    const m = raw as Msg
    if (m.t === "hello") {
      ;(c as any).__member = { id: c.peer, name: String(m.name || "Amigo").slice(0, 40), sharing: !!m.sharing, mic: !!m.mic }
      conns.set(c.peer, c)
      toast(`${(c as any).__member.name} entrou na sala`)
      hostUpdate()
    } else if (m.t === "state") {
      const mm = (c as any).__member as Member | undefined
      if (mm) { mm.sharing = !!m.sharing; mm.mic = !!m.mic; hostUpdate() }
    } else if (m.t === "chat") {
      const msg = { ...m.msg, from: c.peer, text: String(m.msg.text || "").slice(0, 2000) }
      pushChat(msg)
      hostBroadcast({ t: "chat", msg })
    }
  })
  c.on("close", () => {
    const mm = (c as any).__member as Member | undefined
    conns.delete(c.peer)
    dropPeer(c.peer)
    if (mm) toast(`${mm.name} saiu da sala`)
    hostUpdate()
  })
}

/* ---------------- membro ---------------- */
function onMemberData(raw: unknown) {
  const m = raw as Msg
  if (m.t === "members") {
    const list = m.list.map((x) => (x.id === useRoom.getState().myId ? me() : x))
    // quem saiu: larga a tela e a voz dele
    for (const old of useRoom.getState().members) if (!list.some((x) => x.id === old.id)) dropPeer(old.id)
    set({ members: list })
    linkMedia(list)
  } else if (m.t === "chat") pushChat(m.msg)
}
function sendState() {
  const s = useRoom.getState()
  if (s.host) hostUpdate()
  else if (toHost?.open) toHost.send({ t: "state", sharing: !!s.myScreen, mic: s.mic } satisfies Msg)
}

function pushChat(msg: ChatMsg) {
  set({ chat: [...useRoom.getState().chat, msg].slice(-300) })
}

/* ---------------- tela e voz (direto entre os PCs) ---------------- */
/** chamadas fechadas de propósito (saiu da sala, parou de transmitir): não tentar de novo */
const closing = new WeakSet<MediaConnection>()
const retries = new Map<string, number>()
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
let failedLinks = 0

/**
 * Vigia a conexão de uma chamada: "failed" = caiu de vez; "disconnected" por mais de 5 s também conta.
 * Chama `onFail` uma vez. Antes, uma tela que caía ficava preta até alguém entrar ou sair da sala.
 */
export function watchCall(call: MediaConnection, onOk: () => void, onFail: () => void) {
  let done = false, timer: ReturnType<typeof setTimeout> | undefined
  const attach = (tries = 0) => {
    const pc = call.peerConnection
    if (!pc) { if (tries < 20) setTimeout(() => attach(tries + 1), 150); return }
    const check = () => {
      if (done) return
      const st: string = pc.connectionState || pc.iceConnectionState
      if (st === "connected" || pc.iceConnectionState === "completed") { clearTimeout(timer); onOk() }
      else if (st === "failed") { done = true; clearTimeout(timer); onFail() }
      else if (st === "disconnected") {
        clearTimeout(timer)
        timer = setTimeout(() => { if (!done && (pc.connectionState === "disconnected" || pc.iceConnectionState === "disconnected")) { done = true; onFail() } }, 5000)
      }
    }
    pc.addEventListener("connectionstatechange", check)
    pc.addEventListener("iceconnectionstatechange", check)
  }
  attach()
  return () => { done = true; clearTimeout(timer) }
}

function stillWanted(id: string, kind: "screen" | "voice") {
  const s = useRoom.getState()
  if (leaving || !peer || s.status !== "in" || !s.members.some((m) => m.id === id)) return null
  return kind === "screen" ? s.myScreen : micStream
}
/** tenta de novo com espera crescente (1,5 s, 3 s, 6 s…), até 6 vezes */
function retryCall(id: string, kind: "screen" | "voice") {
  const key = `${kind}:${id}`
  const n = (retries.get(key) ?? 0) + 1
  if (n > 6 || retryTimers.has(key)) return
  retries.set(key, n)
  retryTimers.set(key, setTimeout(() => {
    retryTimers.delete(key)
    const stream = stillWanted(id, kind)
    if (stream && !outCalls.has(key)) callPeer(id, kind, stream)
  }, Math.min(30000, 1500 * 2 ** (n - 1))))
}
function noteFailure() {
  failedLinks++
  if (failedLinks >= 2 && !turnConfig() && !useRoom.getState().netHint) {
    const hint = "A rede de alguém está bloqueando a conexão direta (comum em internet com IP compartilhado). Configure um servidor de retransmissão em Salas › Conexão."
    set({ netHint: hint })
    toast("Conexão direta bloqueada pela rede — veja Salas › Conexão")
  }
}

function callPeer(id: string, kind: "screen" | "voice", stream: MediaStream) {
  const key = `${kind}:${id}`
  if (outCalls.has(key) || !peer) return
  const screen = kind === "screen"
  const call = peer.call(id, stream, {
    // quem recebe usa a taxa inicial para a tela já chegar nítida (sem os segundos de imagem borrada)
    metadata: screen ? { kind, startKbps: Math.round(shareBitrate * 0.5 / 1000) } : { kind },
    // H.264 primeiro: deixa a placa de vídeo codificar quando houver (VP8 é sempre por CPU)
    sdpTransform: screen && shareCodec === "auto" ? (sdp: string) => preferVideoCodec(sdp, "H264") : undefined,
  })
  if (!call) return
  outCalls.set(key, call)
  const lost = () => {
    stopWatch()
    liveLinks.delete(key)
    if (outCalls.get(key) === call) outCalls.delete(key)
    if (!closing.has(call)) retryCall(id, kind)
    if (screen) refreshShareState()
  }
  const stopWatch = watchCall(call, () => { retries.delete(key); if (screen) { liveLinks.add(key); refreshShareState() } }, () => {
    noteFailure()
    closing.add(call)
    liveLinks.delete(key)
    try { call.close() } catch { /* já fechada */ }
    if (outCalls.get(key) === call) outCalls.delete(key)
    retryCall(id, kind)
    if (screen) refreshShareState()
  })
  if (screen) refreshShareState()
  call.on("close", lost)
  call.on("error", lost)
  if (kind === "screen") tuneSender(call)
}
/** fecha uma chamada sem tentar de novo */
function closeCall(c: MediaConnection | undefined) {
  if (!c) return
  closing.add(c)
  try { c.close() } catch { /* já fechada */ }
}
/** mais qualidade para a tela: taxa de bits maior e prioridade para nitidez ou movimento */
function tuneSender(call: MediaConnection) {
  // Só dá para ajustar depois que a negociação termina. Antes era uma tentativa única aos 0,5 s: se a
  // conexão ainda não estava pronta (comum pela retransmissão), falhava em silêncio e a taxa escolhida
  // nunca valia. Agora tenta até conseguir (no máximo ~20 s) e é reaplicado ao mudar a qualidade.
  let tries = 0
  const go = () => {
    if (closing.has(call) || ++tries > 40) return
    const pc = call.peerConnection
    const senders = pc ? pc.getSenders().filter((s) => s.track?.kind === "video") : []
    if (!pc || !senders.length || !senders[0].getParameters().encodings?.length) { setTimeout(go, 500); return }
    void applySenderParams(pc).then((ok) => { if (!ok) setTimeout(go, 500) })
  }
  setTimeout(go, 300)
}
/** aplica taxa de bits, limite de quadros e prioridade (nitidez ou movimento) aos envios de vídeo */
async function applySenderParams(pc: RTCPeerConnection): Promise<boolean> {
  let ok = true
  for (const s of pc.getSenders()) {
    if (s.track?.kind !== "video") continue
    const p = s.getParameters()
    if (!p.encodings?.length) { ok = false; continue }
    p.encodings[0].maxBitrate = shareBitrate
    p.encodings[0].maxFramerate = shareFps
    ;(p.encodings[0] as any).networkPriority = "high"
    ;(p as any).degradationPreference = shareMotion ? "maintain-framerate" : "maintain-resolution"
    try { await s.setParameters(p) } catch { ok = false }
  }
  return ok
}
/** quantos PCs estão recebendo a sua tela agora e o estado geral da transmissão */
const liveLinks = new Set<string>()
function refreshShareState() {
  const s = useRoom.getState()
  if (!s.myScreen) { if (s.shareState !== "idle" || s.viewers) set({ shareState: "idle", viewers: 0 }); return }
  const wanted = s.members.filter((m) => m.id !== s.myId).length
  const live = [...liveLinks].filter((k) => k.startsWith("screen:")).length
  const retrying = [...retryTimers.keys()].some((k) => k.startsWith("screen:"))
  const state: ShareState = !wanted || live >= wanted ? "live" : retrying ? "reconnecting" : live ? "live" : "connecting"
  if (s.shareState !== state || s.viewers !== live) set({ shareState: state, viewers: live })
}
function linkMedia(list: Member[]) {
  const s = useRoom.getState()
  for (const m of list) {
    if (m.id === s.myId) continue
    if (s.myScreen) callPeer(m.id, "screen", s.myScreen)
    if (micStream) callPeer(m.id, "voice", micStream)
  }
}
/** espera (um pouco) o membro aparecer na lista da sala: a lista pode chegar instantes depois da chamada */
function whenMember(id: string, timeoutMs = 4000): Promise<boolean> {
  const has = () => useRoom.getState().members.some((m) => m.id === id)
  if (has()) return Promise.resolve(true)
  return new Promise((res) => {
    const off = useRoom.subscribe(() => { if (has()) { clearTimeout(t); off(); res(true) } })
    const t = setTimeout(() => { off(); res(has()) }, timeoutMs)
  })
}
function onCall(call: MediaConnection) {
  const kind = call.metadata?.kind === "voice" ? "voice" : "screen"
  // Só aceita tela/voz de quem está na sala. Antes qualquer um que soubesse o identificador de um
  // participante podia empurrar vídeo ou áudio para ele sem ter entrado na sala.
  void whenMember(call.peer).then((ok) => {
    if (!ok || leaving) { try { call.close() } catch { /* já fechada */ } return }
    acceptCall(call, kind)
  })
}
function acceptCall(call: MediaConnection, kind: "screen" | "voice") {
  inCalls.add(call)
  // taxa inicial pedida por quem transmite (limitada): a tela já começa nítida, sem os segundos borrados
  const startKbps = Math.max(0, Math.min(12000, Number(call.metadata?.startKbps) || 0))
  call.answer(undefined, kind === "screen" && startKbps ? { sdpTransform: (sdp: string) => withStartBitrate(sdp, startKbps) } : undefined)
  call.on("stream", (st) => {
    if (kind === "screen") {
      set({ screens: { ...useRoom.getState().screens, [call.peer]: st } })
      applyLatency(call)
      startStats()
    }
    else {
      let el = voiceEls.get(call.peer)
      if (!el) { el = new Audio(); el.autoplay = true; voiceEls.set(call.peer, el) }
      el.srcObject = st
      el.play().catch(() => {})
    }
  })
  const end = () => {
    inCalls.delete(call)
    if (kind === "screen") {
      const sc = { ...useRoom.getState().screens }
      delete sc[call.peer]
      const stats = { ...(useRoom.getState().stats ?? {}) }
      delete stats[call.peer]
      set({ screens: sc, stats })
    } else voiceEls.get(call.peer)?.pause()
  }
  call.on("close", end)
  call.on("error", end)
  watchCall(call, () => {}, () => { try { call.close() } catch { /* já fechada */ } })
}

/**
 * Baixa latência (quem assiste): pede ao navegador o menor buffer de reprodução possível. Numa rede boa
 * a tela chega dezenas de ms mais cedo; numa rede instável pode engasgar mais (por isso é uma opção).
 */
function applyLatency(call: MediaConnection) {
  const low = useStore.getState().settings.roomLowLatency !== false
  const pc = call.peerConnection
  if (!pc) return
  for (const r of pc.getReceivers()) {
    const rr = r as RTCRtpReceiver & { jitterBufferTarget?: number | null; playoutDelayHint?: number | null }
    try { rr.jitterBufferTarget = low ? 0 : null } catch { /* navegador sem suporte */ }
    try { rr.playoutDelayHint = low ? 0 : null } catch { /* idem */ }
  }
}
/** reaplica a escolha de latência em todas as telas que você está assistindo */
export function refreshLatency() { for (const c of inCalls) if (c.metadata?.kind !== "voice") applyLatency(c) }

/* ---------------- medições reais (getStats) ---------------- */
// A cada 2 s lê os números do próprio WebRTC: quadros por segundo, resolução, taxa, ida e volta, perdas,
// o que está limitando a qualidade e se o codificador é o da placa de vídeo. Só roda com tela no ar.
let statsTimer: ReturnType<typeof setInterval> | null = null
const statMarks = new Map<string, { bytes: number; at: number; jbDelay?: number; jbCount?: number }>()
async function readStats(key: string, pc: RTCPeerConnection | undefined): Promise<LinkStats | null> {
  if (!pc) return null
  try {
    const now = performance.now()
    const { stats, mark } = summarize([...(await pc.getStats()).values()] as Record<string, unknown>[], statMarks.get(key) ?? null, now)
    if (mark) statMarks.set(key, mark)
    return stats
  } catch { return null }
}
function startStats() {
  if (statsTimer) return
  statsTimer = setInterval(async () => {
    const st = useRoom.getState()
    const out = [...outCalls].filter(([k]) => k.startsWith("screen:") && liveLinks.has(k))
    const incoming = [...inCalls].filter((c) => c.metadata?.kind !== "voice")
    if (!st.myScreen && !incoming.length) {
      clearInterval(statsTimer!); statsTimer = null; statMarks.clear()
      if (st.myStats || Object.keys(st.stats ?? {}).length) set({ myStats: null, stats: {} })
      return
    }
    if (document.hidden) return
    const mine = out.length ? await readStats("out:" + out[0][0], out[0][1].peerConnection) : null
    const stats: Record<string, LinkStats> = {}
    for (const c of incoming) { const r = await readStats("in:" + c.peer, c.peerConnection); if (r) stats[c.peer] = r }
    set({ myStats: mine, stats })
  }, 2000)
}

function dropPeer(id: string) {
  for (const k of [`screen:${id}`, `voice:${id}`]) {
    closeCall(outCalls.get(k)); outCalls.delete(k); retries.delete(k)
    const t = retryTimers.get(k); if (t) { clearTimeout(t); retryTimers.delete(k) }
  }
  for (const c of [...inCalls]) if (c.peer === id) c.close()
  const el = voiceEls.get(id); if (el) { el.pause(); el.srcObject = null; voiceEls.delete(id) }
  const sc = { ...useRoom.getState().screens }
  if (sc[id]) { delete sc[id]; set({ screens: sc }) }
}

/* ---------------- entrar / sair ---------------- */
async function makePeer(id?: string): Promise<PeerT> {
  const { Peer } = await import("peerjs")
  return new Promise((res, rej) => {
    const p = id ? new Peer(id, { config: iceConfig(), debug: 0 }) : new Peer({ config: iceConfig(), debug: 0 })
    const fail = (e: any) => { p.off("open", ok); rej(e) }
    const ok = () => { p.off("error", fail); res(p) }
    p.once("open", ok)
    p.once("error", fail)
  })
}

/**
 * Servidor de encontro (PeerJS) caiu: as telas e vozes já ligadas continuam (vão direto entre os PCs),
 * mas é por ele que chegam novos membros. Reconecta com espera crescente e mostra "reconectando".
 */
function watchSignaling(p: PeerT) {
  let tries = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const again = () => {
    clearTimeout(timer)
    if (leaving || peer !== p || p.destroyed || !p.disconnected) return
    set({ reconnecting: true })
    timer = setTimeout(() => {
      if (leaving || peer !== p || p.destroyed || !p.disconnected) return
      tries++
      try { p.reconnect() } catch { /* tenta de novo abaixo */ }
      again()
    }, Math.min(30000, 1000 * 2 ** Math.min(tries, 5)))
  }
  p.on("disconnected", again)
  p.on("open", () => { tries = 0; clearTimeout(timer); set({ reconnecting: false }) })
  p.on("error", (e: any) => {
    // membro que saiu sem avisar: não é erro da sala
    if (e?.type === "peer-unavailable") return
    if (["network", "server-error", "socket-error", "socket-closed", "disconnected"].includes(e?.type)) again()
  })
}

export async function joinRoom(code: string, name: string) {
  code = cleanCode(code)
  if (!code) return
  await leaveRoom(true)
  leaving = false
  myName = name.trim() || "Eu"
  set({ status: "connecting", error: "", code, chat: [], members: [], screens: {} })
  try {
    // tenta ser o anfitrião; se já tem alguém, entra como membro
    try {
      peer = await makePeer(PREFIX + code)
      set({ host: true, myId: peer.id })
      peer.on("connection", onHostConn)
    } catch (e: any) {
      if (e?.type !== "unavailable-id") throw e
      peer = await makePeer()
      set({ host: false, myId: peer.id })
      try {
        await connectHost(code, 15000)
      } catch (err) {
        // o nome da sala está ocupado, mas ninguém respondeu: pode ser um anfitrião "fantasma"
        // (Widgy fechado à força ainda registrado no servidor). Tenta assumir a sala antes de desistir.
        const member = peer
        try {
          peer = await makePeer(PREFIX + code)
          member.destroy()
          set({ host: true, myId: peer.id })
          peer.on("connection", onHostConn)
          toast("O anfitrião não respondia: você abriu a sala de novo")
        } catch {
          peer = member
          throw new Error(turnConfig()
            ? "A sala não respondeu. Peça para quem criou a sala sair e entrar de novo."
            : "A sala não respondeu. A rede de um de vocês pode estar bloqueando a conexão: configure um servidor em Salas › Conexão, ou peça para quem criou a sala sair e entrar de novo.")
        }
      }
    }
    peer.on("call", onCall)
    watchSignaling(peer)
    set({ status: "in", members: [me()] })
    if (useRoom.getState().host) hostUpdate()
  } catch (e: any) {
    const msg = e?.type === "network" || e?.type === "server-error" || e?.type === "socket-error" ? "Sem conexão com o servidor de encontro. Confira a internet." : String(e?.message || e)
    set({ status: "error", error: msg })
    peer?.destroy(); peer = null
  }
}

function connectHost(code: string, wait = 12000): Promise<void> {
  return new Promise((res, rej) => {
    if (!peer) return rej(new Error("sem conexão"))
    const c = peer.connect(PREFIX + code, { reliable: true })
    // conexão pela retransmissão (TURN) demora um pouco mais que a direta
    const timer = setTimeout(() => { try { c.close() } catch { /* nunca abriu */ } rej(new Error("A sala não respondeu.")) }, wait)
    c.on("open", () => {
      clearTimeout(timer)
      toHost = c
      c.send({ t: "hello", name: myName, sharing: !!useRoom.getState().myScreen, mic: useRoom.getState().mic } satisfies Msg)
      res()
    })
    c.on("data", onMemberData)
    c.on("close", () => {
      if (leaving || toHost !== c) return
      toHost = null
      // o anfitrião saiu: alguém assume a sala (quem conseguir pegar o nome dela primeiro)
      toast("O anfitrião saiu — reconectando a sala…")
      setTimeout(() => takeOver(code), 600 + Math.random() * 2400)
    })
    c.on("error", () => { clearTimeout(timer); rej(new Error("Não deu para entrar na sala.")) })
  })
}

async function takeOver(code: string) {
  if (leaving || !peer) return
  try {
    const hostPeer = await makePeer(PREFIX + code)
    // vira o anfitrião: as telas/vozes ligadas ao id antigo continuam no peer antigo
    const old = peer
    peer = hostPeer
    set({ host: true, myId: hostPeer.id })
    hostPeer.on("connection", onHostConn)
    hostPeer.on("call", onCall)
    for (const c of outCalls.values()) closeCall(c)
    outCalls.clear()
    old.destroy()
    hostUpdate()
  } catch {
    // outro membro já assumiu: entra nele
    try { await connectHost(code) } catch { set({ status: "error", error: "A sala acabou." }) }
  }
}

export async function leaveRoom(silent = false) {
  leaving = true
  await stopShare()
  setMic(false)
  for (const c of outCalls.values()) closeCall(c)
  outCalls.clear()
  for (const t of retryTimers.values()) clearTimeout(t)
  retryTimers.clear(); retries.clear(); failedLinks = 0
  for (const c of inCalls) c.close()
  inCalls.clear()
  for (const el of voiceEls.values()) { el.pause(); el.srcObject = null }
  voiceEls.clear()
  conns.clear()
  toHost = null
  peer?.destroy()
  peer = null
  set({ reconnecting: false, netHint: "" })
  if (!silent) set({ status: "idle", code: "", members: [], screens: {}, chat: [], host: false, error: "" })
}

export function sendChat(text: string) {
  text = text.trim()
  if (!text) return
  const s = useRoom.getState()
  const msg: ChatMsg = { id: Math.random().toString(36).slice(2), from: s.myId, name: myName, text, at: Date.now() }
  if (s.host) { pushChat(msg); hostBroadcast({ t: "chat", msg }) }
  else if (toHost?.open) toHost.send({ t: "chat", msg } satisfies Msg)
}

/* ---------------- microfone ---------------- */
export async function setMic(on: boolean) {
  if (on && !micStream) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch { toast("Não deu para usar o microfone"); return }
  }
  if (!on && micStream) {
    for (const [k, c] of outCalls) if (k.startsWith("voice:")) { closeCall(c); outCalls.delete(k) }
    micStream.getTracks().forEach((t) => t.stop())
    micStream = null
  }
  set({ mic: on })
  if (useRoom.getState().status === "in") { sendState(); if (on) linkMedia(useRoom.getState().members) }
}

/* ---------------- compartilhar tela ---------------- */
let shareBitrate = 4_000_000
let shareMotion = true
let shareFps = 30
let shareCodec: ShareCodec = "auto"
let audioCtx: AudioContext | null = null
let audioOff: (() => void) | null = null

const PCM_WORKLET = `
class Pcm extends AudioWorkletProcessor {
  constructor() { super(); this.q = []; this.off = 0; this.port.onmessage = (e) => { this.q.push(new Int16Array(e.data)); if (this.q.length > 24) this.q.splice(0, this.q.length - 8) } }
  process(_i, outs) {
    const L = outs[0][0], R = outs[0][1] || outs[0][0]
    for (let i = 0; i < L.length; i++) {
      const b = this.q[0]
      if (!b) { L[i] = 0; R[i] = 0; continue }
      L[i] = b[this.off] / 32768; R[i] = b[this.off + 1] / 32768
      this.off += 2
      if (this.off >= b.length) { this.q.shift(); this.off = 0 }
    }
    return true
  }
}
registerProcessor("agenda-pcm", Pcm)`

/** som do PC (sem o Discord ou sem o Agenda) como uma faixa de áudio para juntar à tela */
async function pcAudioTrack(without: "discord" | "agenda"): Promise<{ track: MediaStreamTrack; excluded: string } | null> {
  audioCtx = new AudioContext({ sampleRate: 48000 })
  const workletUrl = URL.createObjectURL(new Blob([PCM_WORKLET], { type: "application/javascript" }))
  try { await audioCtx.audioWorklet.addModule(workletUrl) }
  finally { URL.revokeObjectURL(workletUrl) }
  const node = new AudioWorkletNode(audioCtx, "agenda-pcm", { outputChannelCount: [2] })
  const dest = audioCtx.createMediaStreamDestination()
  node.connect(dest)
  let carry: Uint8Array | null = null
  const off1 = bridge.share.onAudio((chunk) => {
    let a = new Uint8Array(chunk)
    if (carry) { const m = new Uint8Array(carry.length + a.length); m.set(carry); m.set(a, carry.length); a = m; carry = null }
    const usable = a.length - (a.length % 4)
    if (usable < a.length) carry = a.slice(usable)
    if (!usable) return
    const copy = a.slice(0, usable).buffer
    node.port.postMessage(copy, [copy])
  })
  const off2 = bridge.share.onAudioEnd((m) => { if (m && m !== "fim") toast("Som do PC parou: " + m) })
  audioOff = () => { off1(); off2() }
  try {
    const r = await bridge.share.audioStart(without)
    if (r.ok) return { track: dest.stream.getAudioTracks()[0], excluded: r.excluded }
  } catch {
    // Disponível só em Windows compatível: degradar para captura sem áudio.
  }
  audioOff?.(); audioOff = null
  dest.stream.getTracks().forEach((track) => track.stop())
  await audioCtx.close().catch(() => {})
  audioCtx = null
  return null
}

export async function startShare(o: ShareOpts) {
  await stopShare(true)
  const q = QUALITIES[o.quality] ?? QUALITIES["1080p30"]
  const { w, h, fps } = q
  shareBitrate = q.bitrate
  shareFps = fps
  shareMotion = o.motion
  shareCodec = o.codec ?? "auto"
  set({ shareState: "preparing" })
  // a captura só é liberada para a fonte escolhida agora, uma vez (ver electron/share.cjs)
  await bridge.share.pick(o.source)
  let video: MediaStream
  try {
    video = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } }, audio: false })
  } catch { set({ shareState: "idle" }); toast("Não deu para capturar a tela"); return }
  const vt = video.getVideoTracks()[0]
  vt.contentHint = o.motion ? "motion" : "detail"
  vt.addEventListener("ended", () => stopShare())
  const stream = new MediaStream([vt])
  let info: string = q.label
  if (o.audio !== "none") {
    try {
      const a = await pcAudioTrack(o.audio)
      if (a) { stream.addTrack(a.track); info += a.excluded === "discord" ? " · som do PC sem o Discord" : " · som do PC (sem o Agenda)" }
    } catch { toast("Não deu para pegar o som do PC — transmitindo só a imagem") }
  } else info += " · sem som"
  set({ myScreen: stream, shareInfo: info })
  sendState()
  linkMedia(useRoom.getState().members)
  refreshShareState()
  startStats()
}

/**
 * Troca a qualidade com a transmissão no ar, sem derrubar nem reconectar ninguém:
 * a captura muda de resolução/quadros e os envios recebem a nova taxa de bits.
 */
export async function setShareQuality(quality: ShareQuality, motion = shareMotion) {
  const s = useRoom.getState().myScreen
  const q = QUALITIES[quality]
  if (!s || !q) return false
  shareBitrate = q.bitrate; shareFps = q.fps; shareMotion = motion
  const vt = s.getVideoTracks()[0]
  try {
    await vt?.applyConstraints({ width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: q.fps, max: q.fps } })
    if (vt) vt.contentHint = motion ? "motion" : "detail"
  } catch { /* a fonte não aceita essa resolução: mantém a captura e muda só a taxa */ }
  for (const [k, c] of outCalls) if (k.startsWith("screen:") && c.peerConnection) void applySenderParams(c.peerConnection)
  const audio = useRoom.getState().shareInfo.split(" · ").slice(2).join(" · ")
  set({ shareInfo: q.label + (audio ? " · " + audio : "") })
  return true
}

export async function stopShare(quiet = false) {
  const s = useRoom.getState().myScreen
  for (const [k, c] of outCalls) if (k.startsWith("screen:")) { closeCall(c); outCalls.delete(k) }
  if (s) s.getTracks().forEach((t) => t.stop())
  audioOff?.(); audioOff = null
  bridge.share.audioStop()
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  for (const k of [...liveLinks]) if (k.startsWith("screen:")) liveLinks.delete(k)
  if (s) { set({ myScreen: null, shareInfo: "" }); if (!quiet) sendState() }
  set({ shareState: "idle", viewers: 0, myStats: null })
}
