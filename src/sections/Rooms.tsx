import { useEffect, useRef, useState } from "react"
import { Cast, Copy, Crown, Expand, LogOut, MessageSquare, Mic, MicOff, MonitorUp, Plus, Send, Trash2, Users, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, type ShareSource } from "@/lib/bridge"
import { cleanCode, joinRoom, leaveRoom, newCode, refreshLatency, sendChat, setMic, setShareQuality, startShare, stopShare, useRoom, type ShareOpts, type ShareState } from "@/lib/rooms"
import { QUALITIES, type LinkStats, type ShareCodec, type ShareQuality } from "@/lib/rtcTuning"
import { toast } from "@/lib/toast"
import { createPortal } from "react-dom"
import { useImmersive } from "@/lib/immersive"
import { useUiMode } from "@/lib/uimode"
import { activeScreen } from "@/lib/screens"
import { cn } from "@/lib/utils"
import { Modal, Segmented, Switch } from "@/components/ui/controls"

function Video({ stream, muted, className }: { stream: MediaStream; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  // a chamada "chega" antes da imagem: até o primeiro quadro, mostra que está conectando em vez de uma tela preta
  const [live, setLive] = useState(false)
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    setLive(false); setSlow(false)
    v.srcObject = stream
    v.play().catch(() => {})
    const ok = () => { if (v.videoWidth > 0) setLive(true) }
    v.addEventListener("loadeddata", ok)
    v.addEventListener("resize", ok)
    const t = setTimeout(() => setSlow(true), 12000)
    return () => { clearTimeout(t); v.removeEventListener("loadeddata", ok); v.removeEventListener("resize", ok) }
  }, [stream])
  return (
    <>
      <video ref={ref} autoPlay playsInline muted={muted} className={className} />
      {!live && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center text-sm text-white/70">
          <span className="size-5 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
          {slow ? "A imagem não está chegando. A rede de um de vocês pode estar bloqueando a conexão; tentem sair e entrar na sala de novo." : "Conectando à transmissão…"}
        </div>
      )}
    </>
  )
}

/* ---------------- fora de uma sala: salas salvas, criar e entrar ---------------- */
/** Conexão avançada: servidor de retransmissão (TURN) para quando a rede bloqueia a conexão direta */
function TurnSettings() {
  const t = useStore((x) => x.settings.roomTurn)
  const set = useStore((x) => x.setSettings)
  const [open, setOpen] = useState(!!t?.urls)
  const v = { urls: t?.urls ?? "", username: t?.username ?? "", credential: t?.credential ?? "" }
  const patch = (p: Partial<typeof v>) => set({ roomTurn: { ...v, ...p } })
  return (
    <div className="rounded-xl border border-line p-3 text-sm">
      <button type="button" className="flex w-full items-center justify-between font-medium" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Conexão <span className="text-xs text-fg-muted">{v.urls ? "servidor de retransmissão configurado" : open ? "fechar" : "avançado"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-xs leading-relaxed text-fg-muted">
            A tela e a voz vão direto de um PC para o outro. Algumas redes (internet com IP compartilhado da operadora, redes de empresa)
            bloqueiam isso e a tela fica preta. Um servidor de retransmissão (TURN) resolve: o Widgy só usa ele quando a conexão direta falha.
            Serviços como Metered, Twilio ou Cloudflare oferecem um; cole aqui os dados que eles dão. Vale para a próxima vez que você entrar numa sala.
          </p>
          <input className="field w-full" placeholder="turn:servidor.com:3478 (pode ser mais de um, separados por vírgula)" value={v.urls} onChange={(e) => patch({ urls: e.target.value })} />
          <div className="flex gap-2">
            <input className="field min-w-0 flex-1" placeholder="Usuário" value={v.username} onChange={(e) => patch({ username: e.target.value })} autoComplete="off" />
            <input className="field min-w-0 flex-1" placeholder="Senha" type="password" value={v.credential} onChange={(e) => patch({ credential: e.target.value })} autoComplete="off" />
          </div>
        </div>
      )}
    </div>
  )
}

function Lobby() {
  const s = useStore((x) => x.settings)
  const set = useStore((x) => x.setSettings)
  const st = useRoom()
  const saved = s.savedRooms ?? []
  const [code, setCode] = useState("")
  const [newName, setNewName] = useState("")
  const nick = s.nick ?? ""
  const enter = (c: string) => { if (!nick.trim()) return toast("Escolha seu nome primeiro"); joinRoom(c, nick) }
  const create = () => {
    const c = newCode()
    set({ savedRooms: [...saved, { code: c, name: newName.trim() || "Sala dos amigos" }] })
    setNewName("")
    enter(c)
  }
  const join = () => {
    const c = cleanCode(code)
    if (!c) return
    if (!saved.some((r) => r.code === c)) set({ savedRooms: [...saved, { code: c, name: "Sala " + c }] })
    setCode("")
    enter(c)
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <div className="font-display text-2xl font-semibold">Salas</div>
        <div className="text-sm text-fg-muted">Compartilhe a tela e converse com os amigos, direto de PC para PC. Quem entra primeiro abre a sala; ela fica aberta enquanto alguém estiver nela.</div>
      </div>
      <label className="block">
        <div className="mb-1 text-xs text-fg-muted">Seu nome nas salas</div>
        <input className="field w-full max-w-xs" value={nick} maxLength={40} onChange={(e) => set({ nick: e.target.value })} placeholder="Como os amigos te veem" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Plus size={16} /> Criar uma sala</div>
          <input className="field mb-2 w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome (ex.: Galera do CS)" onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="btn btn-primary w-full" onClick={create}>Criar e entrar</button>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Users size={16} /> Entrar com código</div>
          <input className="field mb-2 w-full font-num tracking-[0.3em] uppercase" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} placeholder="ABC123" onKeyDown={(e) => e.key === "Enter" && join()} />
          <button className="btn w-full" disabled={!cleanCode(code)} onClick={join}>Entrar</button>
        </div>
      </div>

      {st.status === "connecting" && <div className="text-sm text-fg-muted">Conectando…</div>}
      {st.status === "error" && <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm">{st.error}</div>}
      <TurnSettings />

      <div>
        <div className="mb-2 text-sm font-semibold">Suas salas</div>
        {!saved.length && <div className="text-sm text-fg-muted">Nenhuma ainda. Crie uma e mande o código para os amigos.</div>}
        <div className="grid gap-2 sm:grid-cols-2">
          {saved.map((r) => (
            <div key={r.code} className="group flex items-center gap-3 rounded-xl border border-line p-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] font-display text-lg font-semibold">{r.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <input className="w-full bg-transparent text-sm font-medium outline-none" value={r.name} onChange={(e) => set({ savedRooms: saved.map((x) => (x.code === r.code ? { ...x, name: e.target.value } : x)) })} />
                <div className="font-num text-xs tracking-widest text-fg-muted">{r.code}</div>
              </div>
              <button className="btn btn-ghost btn-icon opacity-0 group-hover:opacity-100" title="Tirar da lista" onClick={() => set({ savedRooms: saved.filter((x) => x.code !== r.code) })}><Trash2 size={14} /></button>
              <button className="btn btn-primary" onClick={() => enter(r.code)}>Entrar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- escolher o que transmitir ---------------- */
function SharePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [srcs, setSrcs] = useState<ShareSource[] | null>(null)
  const [pick, setPick] = useState("")
  // as últimas escolhas ficam guardadas: da próxima vez é só escolher a tela e transmitir
  const saved = useStore((x) => x.settings.roomShare)
  const setSettings = useStore((x) => x.setSettings)
  const [quality, setQuality] = useState<ShareQuality>(saved?.quality && saved.quality in QUALITIES ? (saved.quality as ShareQuality) : "1080p30")
  const [audio, setAudio] = useState<ShareOpts["audio"]>(saved?.audio === "agenda" || saved?.audio === "none" ? saved.audio : "discord")
  const [motion, setMotion] = useState(saved?.motion ?? true)
  const [codec, setCodec] = useState<ShareCodec>(saved?.codec === "vp8" ? "vp8" : "auto")
  useEffect(() => {
    if (!open) return
    setSrcs(null)
    bridge.share.sources().then((l) => { setSrcs(l); setPick((p) => p || l.find((x) => x.screen)?.id || l[0]?.id || "") })
  }, [open])
  const screens = srcs?.filter((s) => s.screen) ?? []
  const windows = srcs?.filter((s) => !s.screen) ?? []
  const tile = (s: ShareSource) => (
    <button key={s.id} onClick={() => setPick(s.id)} onDoubleClick={() => go(s.id)} className={cn("rounded-xl border p-1.5 text-left transition-colors", pick === s.id ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)]")}>
      <div className="aspect-video overflow-hidden rounded-lg bg-black/40">{s.thumb && <img src={s.thumb} alt="" className="size-full object-contain" />}</div>
      <div className="mt-1 flex items-center gap-1.5 px-0.5 text-xs">{s.icon && <img src={s.icon} alt="" className="size-4" />}<span className="truncate">{s.name}</span></div>
    </button>
  )
  const go = (id = pick) => {
    if (!id) return
    setSettings({ roomShare: { quality, audio, motion, codec } })
    startShare({ source: id, quality, audio, motion, codec })
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title="Compartilhar tela" width={780}>
      <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {srcs === null && <div className="py-8 text-center text-sm text-fg-muted">Procurando telas e janelas…</div>}
        {screens.length > 0 && <><div className="text-xs font-semibold text-fg-muted">Telas</div><div className="grid grid-cols-3 gap-2">{screens.map(tile)}</div></>}
        {windows.length > 0 && <><div className="text-xs font-semibold text-fg-muted">Janelas</div><div className="grid grid-cols-3 gap-2">{windows.map(tile)}</div></>}
      </div>
      <div className="mt-4 space-y-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-16 text-sm">Qualidade</span>
          <Segmented value={quality} onChange={setQuality} options={(Object.keys(QUALITIES) as ShareQuality[]).map((k) => ({ value: k, label: QUALITIES[k].label.replace(" · ", " ").replace(" fps", "") }))} />
          <span className="text-xs text-fg-muted">até {(QUALITIES[quality].bitrate / 1e6).toLocaleString("pt-BR")} Mb/s · dá para trocar com a transmissão no ar</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-16 text-sm">Codificar</span>
          <Segmented value={codec} onChange={setCodec} options={[{ value: "auto", label: "Automático (placa de vídeo)" }, { value: "vp8", label: "Compatível (VP8, só CPU)" }]} />
        </div>
        <div className="text-xs text-fg-muted">Automático usa H.264, que a placa de vídeo codifica quando tem suporte (pesa bem menos durante jogos). O número ao lado da sua tela mostra se está na placa de vídeo ou na CPU.</div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-16 text-sm">Som</span>
          <Segmented value={audio} onChange={setAudio} options={[{ value: "discord", label: "PC sem o Discord" }, { value: "agenda", label: "PC sem o Widgy" }, { value: "none", label: "Sem som" }]} />
        </div>
        <div className="text-xs text-fg-muted">“Sem o Discord”: os amigos ouvem o jogo, música e vídeos, mas não a call do Discord. “Sem o Widgy”: use se a conversa for por aqui, para sua voz e a deles não voltarem.</div>
        <Switch label="Priorizar movimento (jogos e vídeos). Desligado: priorizar nitidez (texto, código)" checked={motion} onChange={setMotion} />
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!pick} onClick={() => go()}><MonitorUp size={15} /> Transmitir</button>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- dentro da sala ---------------- */
const STATE_TEXT: Record<ShareState, string> = { idle: "", preparing: "Preparando", connecting: "Conectando", live: "No ar", reconnecting: "Reconectando" }
/** estado da sua transmissão e quantas pessoas estão recebendo de verdade */
function ShareBadge({ state, viewers, others }: { state: ShareState; viewers: number; others: number }) {
  if (state === "idle") return null
  const color = state === "live" ? "bg-emerald-400" : state === "reconnecting" ? "bg-amber-400" : "bg-sky-400"
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] text-white" role="status">
      <span className={cn("size-1.5 rounded-full", color, state !== "live" && "animate-pulse")} />
      {STATE_TEXT[state]}
      <span className="text-white/60">· {others <= 0 ? "ninguém na sala ainda" : `${viewers} de ${others} recebendo`}</span>
    </div>
  )
}
const LIMIT_TEXT: Record<string, string> = { cpu: "limitado pela CPU", bandwidth: "limitado pela internet" }
/** números reais lidos do WebRTC a cada 2 s (não são estimativas da interface) */
function StatLine({ s, mine }: { s?: LinkStats | null; mine: boolean }) {
  if (!s || !s.height) return null
  const parts = [`${s.height}p`, `${s.fps} fps`, s.kbps ? `${(s.kbps / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} Mb/s` : ""]
  if (mine) {
    if (s.rttMs != null) parts.push(`${s.rttMs} ms ida e volta`)
    if (s.lossPct) parts.push(`${s.lossPct.toLocaleString("pt-BR")}% perdido`)
    parts.push(s.hardware ? "placa de vídeo" : "CPU")
    if (s.limit && LIMIT_TEXT[s.limit]) parts.push(LIMIT_TEXT[s.limit])
  } else {
    if (s.bufferMs != null) parts.push(`buffer ${s.bufferMs} ms`)
    if (s.freezes) parts.push(`${s.freezes} congelamento${s.freezes > 1 ? "s" : ""}`)
  }
  const warn = mine ? !!(s.limit && LIMIT_TEXT[s.limit]) : !!s.freezes
  return <div className={cn("rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] tabular-nums", warn ? "text-amber-200" : "text-white/75")} title={s.codec ? `${s.codec}${s.impl ? " · " + s.impl : ""}` : undefined}>{parts.filter(Boolean).join(" · ")}</div>
}

/**
 * Transmissão em tela cheia, acima de tudo do Widgy (inclusive a barra lateral do Carbono), no monitor
 * onde você está. Esc ou o botão saem. Fora do modo Área de trabalho, a janela também vai para tela cheia.
 */
function BigStage({ stream, mine, label, close }: { stream: MediaStream; mine: boolean; label: string; close: () => void }) {
  const mode = useUiMode((m) => m.mode)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    useImmersive.setState({ on: true })
    if (mode !== "desktop") bridge.win.fullscreen(true)
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); closeRef.current() } }
    window.addEventListener("keydown", key)
    return () => {
      useImmersive.setState({ on: false })
      if (mode !== "desktop") bridge.win.fullscreen(false)
      window.removeEventListener("keydown", key)
    }
  }, [mode])
  const sc = activeScreen()
  const r = sc.full ?? sc
  const box: React.CSSProperties = mode === "desktop" ? { left: r.x, top: r.y, width: r.w, height: r.h } : { inset: 0 }
  return createPortal(
    <div className="group fixed z-[9500] bg-black" style={box} role="dialog" aria-label={"Tela cheia: " + label}>
      <Video stream={stream} muted={mine} className="size-full object-contain" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 py-3 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="text-sm font-medium text-white">{label}</span>
        <button className="btn !bg-black/60 text-white" onClick={close}>Sair da tela cheia <kbd className="ml-1 rounded border border-white/20 px-1 text-[10px]">Esc</kbd></button>
      </div>
    </div>,
    document.body,
  )
}

function InRoom() {
  const st = useRoom()
  // o "?? []" fica FORA da leitura: dentro dela, cada leitura criava uma lista nova e a tela da sala
  // entrava em laço infinito (quebrava ao entrar numa sala sem nenhuma sala salva)
  const saved = useStore((x) => x.settings.savedRooms) ?? []
  const name = saved.find((r) => r.code === st.code)?.name ?? "Sala " + st.code
  const [picker, setPicker] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [text, setText] = useState("")
  const chatBox = useRef<HTMLDivElement>(null)
  useEffect(() => { chatBox.current?.scrollTo({ top: 1e9 }) }, [st.chat.length])
  const stage = [...(st.myScreen ? [{ id: st.myId, stream: st.myScreen, mine: true }] : []), ...Object.entries(st.screens).map(([id, stream]) => ({ id, stream, mine: false }))]
  const nameOf = (id: string) => st.members.find((m) => m.id === id)?.name ?? "Amigo"
  const shown = focus ? stage.filter((x) => x.id === focus) : stage
  // tela cheia própria: funciona em qualquer modo do Widgy (no modo Área de trabalho a janela não pode
  // entrar em tela cheia do Windows) e fica acima da barra lateral do Carbono e da barra do Widgy
  const [big, setBig] = useState<string | null>(null)
  const lowLatency = useStore((x) => x.settings.roomLowLatency) !== false
  const setSettings = useStore((x) => x.setSettings)

  const bigItem = big ? stage.find((x) => x.id === big) : null
  useEffect(() => { if (big && !bigItem) setBig(null) }, [big, bigItem])
  return (
    <div className="flex h-full min-h-0">
      {bigItem && <BigStage stream={bigItem.stream} mine={bigItem.mine} label={bigItem.mine ? "Sua tela" : nameOf(bigItem.id)} close={() => setBig(null)} />}
      {/* membros */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-line p-3">
        {st.reconnecting && <div className="mb-2 rounded-lg bg-amber-500/15 px-2 py-1.5 text-[11px] leading-snug text-amber-200">Reconectando ao servidor da sala… quem já está aqui continua vendo e ouvindo.</div>}
        {st.netHint && <div className="mb-2 rounded-lg bg-red-500/15 px-2 py-1.5 text-[11px] leading-snug">{st.netHint}</div>}
        <div className="truncate font-display text-lg font-semibold" title={name}>{name}</div>
        <button className="mb-3 flex items-center gap-1.5 font-num text-xs tracking-widest text-fg-muted hover:text-fg" title="Copiar o código" onClick={() => { navigator.clipboard.writeText(st.code); toast("Código copiado") }}>
          {st.code} <Copy size={11} />
        </button>
        <div className="mb-1.5 text-xs font-semibold text-fg-muted">Na sala · {st.members.length}</div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {st.members.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-xs font-semibold">{m.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1 truncate">{m.name}{m.id === st.myId && <span className="text-fg-muted"> (você)</span>}</span>
              {i === 0 && <span title="Anfitrião (guarda a sala)"><Crown size={12} className="text-amber-400" /></span>}
              {m.sharing && <span title="Transmitindo"><Cast size={13} className="text-[var(--accent)]" /></span>}
              {m.mic ? <Mic size={13} className="text-emerald-400" /> : <MicOff size={13} className="text-fg-muted opacity-50" />}
            </div>
          ))}
        </div>
      </aside>

      {/* palco */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 p-3">
          {!stage.length ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-fg-muted">
              <MonitorUp size={34} />
              <div className="text-sm">Ninguém está transmitindo.</div>
              <div className="text-xs">Mande o código <b className="font-num tracking-widest text-fg">{st.code}</b> para os amigos entrarem.</div>
            </div>
          ) : (
            <div className={cn("grid h-full gap-2", shown.length > 1 && "grid-cols-2")}>
              {shown.map((x) => (
                <div key={x.id} className="group relative min-h-0 overflow-hidden rounded-xl bg-black">
                  <Video stream={x.stream} muted={x.mine} className="size-full object-contain" />
                  <div className="absolute top-2 left-2 flex max-w-[calc(100%-5rem)] flex-col items-start gap-1">
                    <div className="rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white">{x.mine ? "Sua tela" : nameOf(x.id)}{x.mine && st.shareInfo ? ` · ${st.shareInfo}` : ""}</div>
                    {x.mine && <ShareBadge state={st.shareState ?? "live"} viewers={st.viewers ?? 0} others={st.members.length - 1} />}
                    <StatLine s={x.mine ? st.myStats : st.stats?.[x.id]} mine={x.mine} />
                  </div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {stage.length > 1 && <button className="btn btn-icon !bg-black/60 text-white" title={focus ? "Ver todas" : "Só esta"} onClick={() => setFocus(focus ? null : x.id)}><Users size={14} /></button>}
                    <button className="btn btn-icon !bg-black/60 text-white" title="Tela cheia" onClick={() => setBig(x.id)}><Expand size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-line p-3">
          <button className={cn("btn", st.mic && "!bg-emerald-500/25")} onClick={() => setMic(!st.mic)}>{st.mic ? <><Mic size={15} /> Microfone ligado</> : <><MicOff size={15} /> Microfone</>}</button>
          {st.myScreen
            ? <>
                <button className="btn !bg-red-500/30" onClick={() => stopShare()}><X size={15} /> Parar transmissão</button>
                <select className="field !w-auto !py-1.5 text-xs" aria-label="Qualidade da transmissão" title="Trocar a qualidade sem parar a transmissão"
                  value={(Object.keys(QUALITIES) as ShareQuality[]).find((k) => st.shareInfo.startsWith(QUALITIES[k].label)) ?? "1080p30"}
                  onChange={(e) => { void setShareQuality(e.target.value as ShareQuality) }}>
                  {(Object.keys(QUALITIES) as ShareQuality[]).map((k) => <option key={k} value={k}>{QUALITIES[k].label}</option>)}
                </select>
              </>
            : <button className="btn btn-primary" disabled={st.shareState === "preparing"} onClick={() => setPicker(true)}><MonitorUp size={15} /> {st.shareState === "preparing" ? "Preparando…" : "Compartilhar tela"}</button>}
          {Object.keys(st.screens).length > 0 && (
            <button className={cn("btn btn-ghost text-xs", lowLatency && "bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]")} aria-pressed={lowLatency}
              title="Assistir com o menor atraso possível. Desligue se a imagem engasgar numa internet instável."
              onClick={() => { setSettings({ roomLowLatency: !lowLatency }); setTimeout(refreshLatency, 0) }}>
              Baixa latência: {lowLatency ? "ligada" : "desligada"}
            </button>
          )}
          <button className={cn("btn btn-ghost", chatOpen && "bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]")} onClick={() => setChatOpen(!chatOpen)}><MessageSquare size={15} /></button>
          <button className="btn btn-ghost hover:!text-red-400" onClick={() => leaveRoom()}><LogOut size={15} /> Sair</button>
        </div>
      </div>

      {/* chat */}
      {chatOpen && (
        <aside className="flex w-72 shrink-0 flex-col border-l border-line">
          <div ref={chatBox} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {!st.chat.length && <div className="pt-6 text-center text-xs text-fg-muted">As mensagens da sala aparecem aqui (não ficam salvas).</div>}
            {st.chat.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-semibold">{m.name}</span> <span className="font-num text-[10px] text-fg-muted">{new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                <div className="break-words whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 border-t border-line p-2">
            <input className="field min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem" onKeyDown={(e) => { if (e.key === "Enter") { sendChat(text); setText("") } }} />
            <button className="btn btn-icon" onClick={() => { sendChat(text); setText("") }}><Send size={14} /></button>
          </div>
        </aside>
      )}
      <SharePicker open={picker} onClose={() => setPicker(false)} />
    </div>
  )
}

export default function Rooms() {
  const status = useRoom((s) => s.status)
  return status === "in" ? <InRoom /> : <Lobby />
}
