import { useEffect, useRef, useState } from "react"
import { Cast, Copy, Crown, Expand, LogOut, MessageSquare, Mic, MicOff, MonitorUp, Plus, Send, Trash2, Users, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, type ShareSource } from "@/lib/bridge"
import { cleanCode, joinRoom, leaveRoom, newCode, sendChat, setMic, startShare, stopShare, useRoom, type ShareOpts } from "@/lib/rooms"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { Modal, Segmented, Switch } from "@/components/ui/controls"

function Video({ stream, muted, className }: { stream: MediaStream; muted?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) { ref.current.srcObject = stream; ref.current.play().catch(() => {}) } }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />
}

/* ---------------- fora de uma sala: salas salvas, criar e entrar ---------------- */
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
  const [quality, setQuality] = useState<ShareOpts["quality"]>("1080p30")
  const [audio, setAudio] = useState<ShareOpts["audio"]>("discord")
  const [motion, setMotion] = useState(true)
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
  const go = (id = pick) => { if (!id) return; startShare({ source: id, quality, audio, motion }); onClose() }
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
          <Segmented value={quality} onChange={setQuality} options={[{ value: "720p30", label: "720p 30" }, { value: "1080p30", label: "1080p 30" }, { value: "1080p60", label: "1080p 60" }]} />
        </div>
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
function InRoom() {
  const st = useRoom()
  const saved = useStore((x) => x.settings.savedRooms ?? [])
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
  const full = (el: HTMLElement | null) => el?.requestFullscreen?.()

  return (
    <div className="flex h-full min-h-0">
      {/* membros */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-line p-3">
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
                  <div className="absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs text-white">{x.mine ? "Sua tela" : nameOf(x.id)}{x.mine && st.shareInfo ? ` · ${st.shareInfo}` : ""}</div>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {stage.length > 1 && <button className="btn btn-icon !bg-black/60 text-white" title={focus ? "Ver todas" : "Só esta"} onClick={() => setFocus(focus ? null : x.id)}><Users size={14} /></button>}
                    <button className="btn btn-icon !bg-black/60 text-white" title="Tela cheia" onClick={(e) => full(e.currentTarget.closest(".group") as HTMLElement)}><Expand size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-line p-3">
          <button className={cn("btn", st.mic && "!bg-emerald-500/25")} onClick={() => setMic(!st.mic)}>{st.mic ? <><Mic size={15} /> Microfone ligado</> : <><MicOff size={15} /> Microfone</>}</button>
          {st.myScreen
            ? <button className="btn !bg-red-500/30" onClick={() => stopShare()}><X size={15} /> Parar transmissão</button>
            : <button className="btn btn-primary" onClick={() => setPicker(true)}><MonitorUp size={15} /> Compartilhar tela</button>}
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
