// Salas entre amigos (P2P): quem entra primeiro vira o anfitrião (guarda a lista de membros e repassa o chat);
// tela e voz vão direto de um PC para o outro (WebRTC). O único servidor usado é o gratuito do PeerJS,
// só para as pessoas se encontrarem — nenhum vídeo ou som passa por ele.
import { create } from "zustand"
import type { DataConnection, MediaConnection, Peer as PeerT } from "peerjs"
import { bridge } from "./bridge"
import { toast } from "./toast"

export interface Member { id: string; name: string; sharing: boolean; mic: boolean }
export interface ChatMsg { id: string; from: string; name: string; text: string; at: number }
export type ShareAudio = "discord" | "agenda" | "none"
export interface ShareOpts { source: string; quality: "720p30" | "1080p30" | "1080p60"; audio: ShareAudio; motion: boolean }

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
}

export const useRoom = create<RoomState>(() => ({
  status: "idle", error: "", code: "", myId: "", host: false, members: [], screens: {}, myScreen: null, mic: false, chat: [], shareInfo: "",
}))

const PREFIX = "agenda-sala-"
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] }
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
function callPeer(id: string, kind: "screen" | "voice", stream: MediaStream) {
  const key = `${kind}:${id}`
  if (outCalls.has(key) || !peer) return
  const call = peer.call(id, stream, { metadata: { kind } })
  if (!call) return
  outCalls.set(key, call)
  call.on("close", () => outCalls.delete(key))
  call.on("error", () => outCalls.delete(key))
  if (kind === "screen") tuneSender(call)
}
/** mais qualidade para a tela: taxa de bits maior e prioridade para nitidez ou movimento */
function tuneSender(call: MediaConnection) {
  const go = () => {
    const pc = call.peerConnection
    if (!pc) return setTimeout(go, 300)
    for (const s of pc.getSenders()) {
      if (s.track?.kind !== "video") continue
      const p = s.getParameters()
      if (!p.encodings?.length) p.encodings = [{}]
      p.encodings[0].maxBitrate = shareBitrate
      ;(p as any).degradationPreference = shareMotion ? "maintain-framerate" : "maintain-resolution"
      s.setParameters(p).catch(() => {})
    }
  }
  setTimeout(go, 500)
}
function linkMedia(list: Member[]) {
  const s = useRoom.getState()
  for (const m of list) {
    if (m.id === s.myId) continue
    if (s.myScreen) callPeer(m.id, "screen", s.myScreen)
    if (micStream) callPeer(m.id, "voice", micStream)
  }
}
function onCall(call: MediaConnection) {
  const kind = call.metadata?.kind === "voice" ? "voice" : "screen"
  inCalls.add(call)
  call.answer()
  call.on("stream", (st) => {
    if (kind === "screen") set({ screens: { ...useRoom.getState().screens, [call.peer]: st } })
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
      set({ screens: sc })
    } else voiceEls.get(call.peer)?.pause()
  }
  call.on("close", end)
  call.on("error", end)
}
function dropPeer(id: string) {
  for (const k of [`screen:${id}`, `voice:${id}`]) { outCalls.get(k)?.close(); outCalls.delete(k) }
  for (const c of [...inCalls]) if (c.peer === id) c.close()
  const el = voiceEls.get(id); if (el) { el.pause(); el.srcObject = null; voiceEls.delete(id) }
  const sc = { ...useRoom.getState().screens }
  if (sc[id]) { delete sc[id]; set({ screens: sc }) }
}

/* ---------------- entrar / sair ---------------- */
async function makePeer(id?: string): Promise<PeerT> {
  const { Peer } = await import("peerjs")
  return new Promise((res, rej) => {
    const p = id ? new Peer(id, { config: ICE, debug: 0 }) : new Peer({ config: ICE, debug: 0 })
    const fail = (e: any) => { p.off("open", ok); rej(e) }
    const ok = () => { p.off("error", fail); res(p) }
    p.once("open", ok)
    p.once("error", fail)
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
      await connectHost(code)
    }
    peer.on("call", onCall)
    peer.on("disconnected", () => { if (!leaving && peer && !peer.destroyed) peer.reconnect() })
    set({ status: "in", members: [me()] })
    if (useRoom.getState().host) hostUpdate()
  } catch (e: any) {
    const msg = e?.type === "network" || e?.type === "server-error" || e?.type === "socket-error" ? "Sem conexão com o servidor de encontro. Confira a internet." : String(e?.message || e)
    set({ status: "error", error: msg })
    peer?.destroy(); peer = null
  }
}

function connectHost(code: string): Promise<void> {
  return new Promise((res, rej) => {
    if (!peer) return rej(new Error("sem conexão"))
    const c = peer.connect(PREFIX + code, { reliable: true })
    const timer = setTimeout(() => rej(new Error("A sala não respondeu.")), 12000)
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
    for (const c of outCalls.values()) c.close()
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
  for (const c of outCalls.values()) c.close()
  outCalls.clear()
  for (const c of inCalls) c.close()
  inCalls.clear()
  for (const el of voiceEls.values()) { el.pause(); el.srcObject = null }
  voiceEls.clear()
  conns.clear()
  toHost = null
  peer?.destroy()
  peer = null
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
    for (const [k, c] of outCalls) if (k.startsWith("voice:")) { c.close(); outCalls.delete(k) }
    micStream.getTracks().forEach((t) => t.stop())
    micStream = null
  }
  set({ mic: on })
  if (useRoom.getState().status === "in") { sendState(); if (on) linkMedia(useRoom.getState().members) }
}

/* ---------------- compartilhar tela ---------------- */
let shareBitrate = 4_000_000
let shareMotion = true
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
  await audioCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([PCM_WORKLET], { type: "application/javascript" })))
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
  const r = await bridge.share.audioStart(without)
  if (!r.ok) return null
  return { track: dest.stream.getAudioTracks()[0], excluded: r.excluded }
}

export async function startShare(o: ShareOpts) {
  await stopShare(true)
  const [w, h, fps] = o.quality === "720p30" ? [1280, 720, 30] : o.quality === "1080p30" ? [1920, 1080, 30] : [1920, 1080, 60]
  shareBitrate = o.quality === "720p30" ? 2_500_000 : o.quality === "1080p30" ? 5_000_000 : 8_000_000
  shareMotion = o.motion
  await bridge.share.pick(o.source)
  let video: MediaStream
  try {
    video = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: fps, max: fps } }, audio: false })
  } catch { toast("Não deu para capturar a tela"); return }
  const vt = video.getVideoTracks()[0]
  vt.contentHint = o.motion ? "motion" : "detail"
  vt.addEventListener("ended", () => stopShare())
  const stream = new MediaStream([vt])
  let info = o.quality.replace("p", "p · ") + " fps"
  if (o.audio !== "none") {
    try {
      const a = await pcAudioTrack(o.audio)
      if (a) { stream.addTrack(a.track); info += a.excluded === "discord" ? " · som do PC sem o Discord" : " · som do PC (sem o Agenda)" }
    } catch { toast("Não deu para pegar o som do PC — transmitindo só a imagem") }
  } else info += " · sem som"
  set({ myScreen: stream, shareInfo: info })
  sendState()
  linkMedia(useRoom.getState().members)
}

export async function stopShare(quiet = false) {
  const s = useRoom.getState().myScreen
  for (const [k, c] of outCalls) if (k.startsWith("screen:")) { c.close(); outCalls.delete(k) }
  if (s) s.getTracks().forEach((t) => t.stop())
  audioOff?.(); audioOff = null
  bridge.share.audioStop()
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  if (s) { set({ myScreen: null, shareInfo: "" }); if (!quiet) sendState() }
}
