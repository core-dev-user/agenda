import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Bell, ChevronRight, CloudSun, Cpu, Image as ImageIcon, LayoutDashboard, Lock, LogOut, Moon, Music2, Palette,
  Plus, Power, RotateCw, Search, Settings, Sparkles, Target, Volume2, Wifi, X,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import { SECTIONS } from "@/components/sections-meta"
import { AppIcon } from "@/components/AppIcon"
import { Logo } from "@/components/Logo"
import { GRADIENTS } from "@/components/Wallpaper"
import { NotificationPanel } from "@/components/NotificationCenter"
import { WIDGET_CHOICES } from "@/widgets/WidgetFrame"
import { useNow } from "@/widgets/Clock"
import { cn } from "@/lib/utils"
import type { SectionId } from "@/lib/types"
import { ACCENTS, CORNER, FRAME, RAIL, closeDash, openDash, removePack, shellPrefs, useShell, type ShellPrefs } from "./pack"
import { Dashboard } from "./Dashboard"

/* ───────────────────────────── aparência ───────────────────────────── */

/** Cores do pacote. Tudo escuro e neutro; a cor de destaque aparece só em detalhes. */
export function useCarbonoVars(on: boolean, prefs: ShellPrefs) {
  useEffect(() => {
    const r = document.documentElement
    if (!on) { delete r.dataset.pack; return }
    r.dataset.pack = "carbono"
    const a = ACCENTS[prefs.accent ?? "rose"]
    r.style.setProperty("--sh-accent", a.color)
    r.style.setProperty("--sh-accent-2", a.soft)
    return () => { delete r.dataset.pack }
  }, [on, prefs.accent])
}

const CSS = `
:root[data-pack="carbono"] {
  --sh-bg: #121212; --sh-1: #1b1b1c; --sh-2: #242425; --sh-3: #2e2e30;
  --sh-fg: #ECE7E8; --sh-muted: #9C9597; --sh-dim: #6B6668; --sh-line: rgba(255,255,255,.06);
  --sh-red: #F2A0A0;
}
/* as janelas e cartões do Widgy ganham o mesmo carvão do pacote */
:root[data-pack="carbono"] .surface { background: color-mix(in srgb, var(--sh-1) 96%, transparent) !important; border-color: var(--sh-line) !important; box-shadow: 0 18px 50px rgba(0,0,0,.45) !important; }
.sh { color: var(--sh-fg); font-family: var(--font-ui); }
.sh-card { background: var(--sh-1); border-radius: 18px; }
.sh-card-2 { background: var(--sh-2); border-radius: 14px; }
.sh-btn { display: flex; align-items: center; justify-content: center; border-radius: 12px; color: var(--sh-muted); transition: background .15s, color .15s, transform .15s; }
.sh-btn:hover { background: var(--sh-2); color: var(--sh-fg); }
.sh-btn:active { transform: scale(.92); }
.sh-scroll { scrollbar-width: none; }
.sh-scroll::-webkit-scrollbar { display: none; }
.sh-vtext { writing-mode: vertical-rl; transform: rotate(180deg); }
.sh-input::placeholder { color: var(--sh-dim); }
`

/** Fundo das "orelhas" côncavas que unem um painel à moldura (o detalhe que faz tudo parecer uma peça só). */
const ear = (at: string): CSSProperties => ({
  position: "absolute", width: CORNER, height: CORNER, pointerEvents: "none",
  background: `radial-gradient(circle at ${at}, transparent ${CORNER - 0.5}px, var(--sh-bg) ${CORNER}px)`,
})

type Edge = "top" | "bottom" | "left" | "right"

/**
 * Painel que sai de uma borda da tela, com os cantos de fora arredondados e os de dentro côncavos.
 * `offset`: distância da borda até onde o painel encosta (a espessura da moldura ou da barra).
 */
function EdgePanel({ edge, open, offset, inset = 0, style, center, className, children, onLeave, onEnter, label }: {
  edge: Edge; open: boolean; offset: number; inset?: number; style?: CSSProperties; center?: boolean; className?: string; children: ReactNode
  onLeave?: () => void; onEnter?: () => void; label: string
}) {
  const vertical = edge === "top" || edge === "bottom"
  const hidden = { top: { y: "-104%" }, bottom: { y: "104%" }, left: { x: "-104%" }, right: { x: "104%" } }[edge]
  const radius = { top: `0 0 ${CORNER + 6}px ${CORNER + 6}px`, bottom: `${CORNER + 6}px ${CORNER + 6}px 0 0`, left: `0 ${CORNER + 6}px ${CORNER + 6}px 0`, right: `${CORNER + 6}px 0 0 ${CORNER + 6}px` }[edge]
  const ears: CSSProperties[] = {
    top: [{ ...ear("0 100%"), left: -CORNER, top: offset }, { ...ear("100% 100%"), right: -CORNER, top: offset }],
    bottom: [{ ...ear("0 0"), left: -CORNER, bottom: offset }, { ...ear("100% 0"), right: -CORNER, bottom: offset }],
    left: [{ ...ear("100% 0"), top: -CORNER, left: offset }, { ...ear("100% 100%"), bottom: -CORNER, left: offset }],
    right: [{ ...ear("0 0"), top: -CORNER, right: offset }, { ...ear("0 100%"), bottom: -CORNER, right: offset }],
  }[edge]
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog" aria-label={label} data-modal
          className={cn("sh fixed", className ?? "z-[7000]")}
          style={{ ...style, [edge]: inset, ...(center ? { x: "-50%" } : {}) }}
          initial={hidden} animate={vertical ? { y: 0 } : { x: 0 }} exit={hidden}
          transition={{ type: "spring", stiffness: 420, damping: 40, mass: 0.9 }}
          onPointerLeave={onLeave} onPointerEnter={onEnter}
        >
          {ears.map((e, i) => <div key={i} style={e} />)}
          <div style={{
            background: "var(--sh-bg)", borderRadius: radius,
            [edge === "top" ? "paddingTop" : edge === "bottom" ? "paddingBottom" : edge === "left" ? "paddingLeft" : "paddingRight"]: offset,
            boxShadow: "0 24px 60px rgba(0,0,0,.35)",
          }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────────────────────── moldura + barra ───────────────────────────── */

/** Moldura, barra lateral e os painéis presos nela. Fica no lugar da barra de tarefas do Widgy. */
export function CarbonoChrome() {
  const prefs = shellPrefs(useStore((s) => s.settings))
  const side = prefs.side ?? "left"
  const f = prefs.frame ? FRAME : 0
  const [pop, setPop] = useState<"" | "bell" | "power">("")
  useEffect(() => {
    if (!pop) return
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPop("") }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [pop])
  const readAll = useStore((s) => s.markNotificationsRead)
  const toggle = (p: "bell" | "power") => { if (pop === "bell") readAll(); setPop(pop === p ? "" : p) }
  useEffect(() => { useShell.setState({ power: !!pop }) }, [pop])

  return (
    <>
      <style>{CSS}</style>
      {/* moldura: um retângulo arredondado vazado, o resto da tela fica no carvão */}
      {prefs.frame && (
        <div aria-hidden className="pointer-events-none fixed z-[795]"
          style={{ top: f, bottom: f, left: side === "left" ? RAIL : f, right: side === "right" ? RAIL : f, borderRadius: CORNER, boxShadow: "0 0 0 100vmax var(--sh-bg)" }} />
      )}
      <Rail side={side} onBell={() => toggle("bell")} onPower={() => toggle("power")} pop={pop} />
      {/* os painéis da barra saem de trás dela (ficam abaixo da barra, acima das janelas) */}
      {pop && <div className="fixed inset-0 z-[796]" onPointerDown={() => { if (pop === "bell") readAll(); setPop("") }} />}
      <EdgePanel edge={side} open={pop === "bell"} offset={0} inset={RAIL} className="z-[797]" label="Avisos" style={{ bottom: 120 }}>
        <div className="w-[360px] p-3 pr-4"><div className="max-h-[60vh] overflow-auto sh-scroll"><NotificationPanel close={() => { readAll(); setPop("") }} /></div></div>
      </EdgePanel>
      <EdgePanel edge={side} open={pop === "power"} offset={0} inset={RAIL} className="z-[797]" label="Energia" style={{ bottom: 24 }}>
        <PowerMenu close={() => setPop("")} />
      </EdgePanel>
    </>
  )
}

function Rail({ side, onBell, onPower, pop }: { side: "left" | "right"; onBell: () => void; onPower: () => void; pop: string }) {
  const windows = useStore((s) => s.windows)
  const openW = useStore((s) => s.openWindow)
  const patch = useStore((s) => s.patchWindow)
  const unread = useStore((s) => s.notifications.filter((n) => !n.read).length)
  // A barra exibe horas/minutos, não precisa renderizar a cada segundo.
  const now = useNow(60000)
  const open = [...windows].sort((a, b) => SECTIONS.findIndex((x) => x.id === a.id) - SECTIONS.findIndex((x) => x.id === b.id))
  const top = [...windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
  const topMeta = top ? SECTIONS.find((x) => x.id === top.id) : null
  const click = (id: SectionId) => {
    if (top?.id === id) patch(id, { minimized: true })
    else openW(id)
  }
  const hh = String(now.getHours()).padStart(2, "0")
  const mm = String(now.getMinutes()).padStart(2, "0")

  return (
    <nav aria-label="Barra do Carbono"
      className={cn("sh fixed inset-y-0 z-[800] flex flex-col items-center py-2.5", side === "left" ? "left-0" : "right-0")}
      style={{ width: RAIL, background: "var(--sh-bg)" }}
>
      <button type="button" className="sh-btn size-9" title="Buscar e abrir (Ctrl+K)" aria-label="Buscar e abrir"
        onClick={() => useStore.setState((s) => ({ paletteOpen: !s.paletteOpen }))}>
        <Logo size={22} glyphOnly />
      </button>

      {/* abas abertas: um ponto por aba, a da frente vira uma pílula */}
      <div className="mt-2.5 flex flex-col items-center gap-1.5 rounded-full px-1.5 py-2" style={{ background: "var(--sh-1)" }}>
        {open.length === 0 && [0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full" style={{ background: "var(--sh-3)" }} />)}
        {open.map((w) => {
          const meta = SECTIONS.find((x) => x.id === w.id)
          const active = top?.id === w.id
          return (
            <button key={w.id} type="button" title={meta?.label} aria-label={meta?.label} onClick={() => click(w.id)}
              className="group flex w-3 items-center justify-center py-0.5">
              <motion.span layout className="block w-1.5 rounded-full"
                style={{ height: active ? 18 : 6, background: active ? "var(--sh-fg)" : w.minimized ? "var(--sh-3)" : "var(--sh-muted)" }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }} />
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-1 flex-col items-center gap-2 overflow-hidden">
        <button type="button" className="sh-btn size-8" title="Painel" aria-label="Abrir painel" onClick={() => openDash("dash")}>
          {topMeta ? <topMeta.icon size={15} /> : <LayoutDashboard size={15} />}
        </button>
        <span className="sh-vtext truncate text-[11px] font-medium tracking-wide" style={{ color: "var(--sh-muted)", maxHeight: "40vh" }}>
          {topMeta?.label ?? "Área de trabalho"}
        </span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button type="button" className={cn("sh-btn relative size-8", pop === "bell" && "!bg-[var(--sh-2)] !text-[var(--sh-fg)]")} title="Avisos" aria-label={`Avisos (${unread} não lidos)`} onClick={onBell}>
          <Bell size={15} />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full" style={{ background: "var(--sh-accent)" }} />}
        </button>
        <button type="button" className="sh-btn mt-1 flex-col !gap-0 px-1 py-1.5 leading-[1.05]" title={now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          onClick={() => openDash("dash")} style={{ fontFamily: "var(--font-num)" }}>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--sh-fg)" }}>{hh}</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--sh-fg)" }}>{mm}</span>
        </button>
        <div className="my-1 flex flex-col items-center gap-0.5 rounded-full py-1" style={{ background: "var(--sh-1)" }}>
          <button type="button" className="sh-btn size-7" title="Rede" aria-label="Rede" onClick={() => void bridge.bar.power("network")}><Wifi size={13} /></button>
          <button type="button" className="sh-btn size-7" title="Volume" aria-label="Volume" onClick={() => void bridge.bar.power("volume")}><Volume2 size={13} /></button>
          <button type="button" className="sh-btn size-7" title="Configurações do Widgy" aria-label="Configurações" onClick={() => openW("settings")}><Settings size={13} /></button>
        </div>
        <button type="button" className={cn("sh-btn size-8", pop === "power" && "!bg-[var(--sh-2)]")} title="Energia" aria-label="Energia" onClick={onPower} style={{ color: "var(--sh-red)" }}>
          <Power size={15} />
        </button>
      </div>
    </nav>
  )
}

function PowerMenu({ close }: { close: () => void }) {
  const items = [
    { id: "lock" as const, label: "Bloquear", icon: Lock },
    { id: "sleep" as const, label: "Suspender", icon: Moon },
    { id: "restart" as const, label: "Reiniciar", icon: RotateCw },
    { id: "shutdown" as const, label: "Desligar", icon: Power },
  ]
  return (
    <div className="flex gap-2 p-3 pr-4">
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => { close(); void bridge.bar.power(it.id) }}
          className="group flex size-[74px] flex-col items-center justify-center gap-1.5 rounded-2xl transition-colors"
          style={{ background: "var(--sh-1)" }}>
          <it.icon size={20} className="transition-transform group-hover:scale-110" style={{ color: it.id === "shutdown" ? "var(--sh-red)" : "var(--sh-fg)" }} />
          <span className="text-[11px]" style={{ color: "var(--sh-muted)" }}>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ───────────────────────────── painéis de cima e de baixo ───────────────────────────── */

/** Painel de cima e busca de baixo. Ficam no monitor onde você está mexendo. */
export function CarbonoPanels() {
  const prefs = shellPrefs(useStore((s) => s.settings))
  const side = prefs.side ?? "left"
  const f = prefs.frame ? FRAME : 0
  const dash = useShell((s) => s.dash)
  const launcher = useStore((s) => s.paletteOpen)
  const leaveTimer = useRef<number | undefined>(undefined)
  // centro da área útil (entre a barra e a moldura do outro lado)
  const left = side === "left" ? RAIL : f
  const right = side === "right" ? RAIL : f
  const center: CSSProperties = { left: `calc(${left}px + (100% - ${left + right}px) / 2)` }

  // encostar o mouse no meio do topo abre o painel
  useEffect(() => {
    if (!prefs.hoverTop) return
    let dwell: number | undefined
    const move = (e: PointerEvent) => {
      const w = window.innerWidth
      const inZone = e.clientY <= Math.max(3, f + 1) && Math.abs(e.clientX - (left + (w - left - right) / 2)) < 220
      if (inZone && !useShell.getState().dash && !dwell) dwell = window.setTimeout(() => { openDash(); dwell = undefined }, 180)
      if (!inZone && dwell) { clearTimeout(dwell); dwell = undefined }
    }
    window.addEventListener("pointermove", move)
    return () => { window.removeEventListener("pointermove", move); clearTimeout(dwell) }
  }, [prefs.hoverTop, f, left, right])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useShell.getState().dash) closeDash()
      // Ctrl+Shift+D abre/fecha o painel
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") { e.preventDefault(); useShell.getState().dash ? closeDash() : openDash() }
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])
  useEffect(() => { if (launcher) closeDash() }, [launcher])

  return (
    <>
      {dash && <div className="fixed inset-0 z-[6990]" onPointerDown={closeDash} />}
      <EdgePanel edge="top" open={dash} offset={f} label="Painel" style={center} center
        onEnter={() => clearTimeout(leaveTimer.current)}
        onLeave={() => { if (prefs.hoverTop) leaveTimer.current = window.setTimeout(closeDash, 650) }}>
        <Dashboard />
      </EdgePanel>
      {launcher && <div className="fixed inset-0 z-[6990]" onPointerDown={() => useStore.setState({ paletteOpen: false })} />}
      <EdgePanel edge="bottom" open={launcher} offset={f} label="Buscar" style={center} center>
        <Launcher close={() => useStore.setState({ paletteOpen: false })} />
      </EdgePanel>
    </>
  )
}

/* ───────────────────────────── busca ───────────────────────────── */

interface Entry { id: string; title: string; sub: string; icon: ReactNode; run: () => void; keep?: boolean; words?: string }
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

let appsCache: Promise<{ name: string; path: string }[]> | null = null
const loadApps = () => (appsCache ??= bridge.bar.apps().catch(() => { appsCache = null; return [] }))
// Ícones base64 são strings grandes mantidas pelo Promise mesmo após fechar a busca.
// LRU limitado tanto por quantidade quanto por bytes, sem reter erros ou ícones gigantes.
const ICON_CACHE_LIMIT = 24
const ICON_CACHE_BYTES = 1024 * 1024
type CachedIcon = { promise: Promise<string>; bytes: number }
const iconCache = new Map<string, CachedIcon>()
let iconCacheBytes = 0
function clearIconCache() { iconCache.clear(); iconCacheBytes = 0 }
function trimIconCache() {
  while (iconCache.size > ICON_CACHE_LIMIT || iconCacheBytes > ICON_CACHE_BYTES) {
    const key = iconCache.keys().next().value
    if (key === undefined) break
    const oldest = iconCache.get(key)
    iconCache.delete(key)
    iconCacheBytes -= oldest?.bytes ?? 0
  }
}
function getCachedIcon(path: string) {
  const cached = iconCache.get(path)
  if (cached) {
    iconCache.delete(path)
    iconCache.set(path, cached)
    return cached.promise
  }
  const entry: CachedIcon = { bytes: 0, promise: Promise.resolve("") }
  entry.promise = bridge.bar.icon(path).catch(() => "").then((src) => {
    if (iconCache.get(path) !== entry) return src
    if (!src || src.length > ICON_CACHE_BYTES / 2) { iconCache.delete(path); return src }
    entry.bytes = src.length
    iconCacheBytes += entry.bytes
    trimIconCache()
    return src
  })
  iconCache.set(path, entry)
  trimIconCache()
  return entry.promise
}
function PcIcon({ path }: { path: string }) {
  const [src, setSrc] = useState("")
  useEffect(() => {
    let alive = true
    void getCachedIcon(path).then((s) => { if (alive) setSrc(s || "") })
    return () => { alive = false }
  }, [path])
  return src ? <img src={src} alt="" className="size-6 object-contain" draggable={false} />
    : <span className="flex size-6 items-center justify-center rounded-md" style={{ background: "var(--sh-3)" }}><Sparkles size={12} style={{ color: "var(--sh-muted)" }} /></span>
}

const CMD_ICON = (I: typeof Search) => <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: "var(--sh-2)" }}><I size={14} style={{ color: "var(--sh-fg)" }} /></span>
const WALL_RE = /^>\s*(papel|wallpaper|fundo)\b\s*/i

function Launcher({ close }: { close: () => void }) {
  const [q, setQ] = useState("")
  const [sel, setSel] = useState(0)
  const [apps, setApps] = useState<{ name: string; path: string }[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const st = useStore.getState()
  useEffect(() => {
    let alive = true
    void loadApps().then((items) => { if (alive) setApps(items) })
    const t = setTimeout(() => input.current?.focus(), 60)
    return () => {
      alive = false
      clearTimeout(t)
      // O buscador sai da árvore ao fechar: devolve ícones base64 e lista de apps à GC.
      clearIconCache()
      appsCache = null
    }
  }, [])

  const wallMode = WALL_RE.test(q)

  const commands = useMemo<Entry[]>(() => {
    const set = (v: string) => { setQ(v); setSel(0); input.current?.focus() }
    const go = (fn: () => void) => () => { close(); fn() }
    return [
      { id: "c-wall", title: "papel", sub: "Trocar o papel de parede", icon: CMD_ICON(ImageIcon), run: () => set(">papel "), keep: true, words: "wallpaper fundo imagem" },
      { id: "c-dash", title: "painel", sub: "Abrir o painel de cima", icon: CMD_ICON(LayoutDashboard), run: go(() => openDash("dash")), words: "dashboard" },
      { id: "c-media", title: "musica", sub: "Painel da música tocando", icon: CMD_ICON(Music2), run: go(() => openDash("media")), words: "midia media spotify" },
      { id: "c-perf", title: "desempenho", sub: "CPU, GPU, memória e disco", icon: CMD_ICON(Cpu), run: go(() => openDash("perf")), words: "performance cpu gpu" },
      { id: "c-wx", title: "clima", sub: "Previsão do tempo", icon: CMD_ICON(CloudSun), run: go(() => openDash("weather")), words: "tempo weather" },
      ...WIDGET_CHOICES.filter((c) => c.group === "widget").map((c) => ({ id: "c-w-" + c.type, title: "widget " + norm(c.label), sub: "Adicionar o widget " + c.label, icon: CMD_ICON(Plus), run: go(() => st.addWidget(c.type, c.config)), words: "adicionar" })),
      { id: "c-focus", title: "foco", sub: st.focusManual ? "Desligar o modo foco" : "Ligar o modo foco", icon: CMD_ICON(Target), run: go(() => useStore.setState((s) => ({ focusManual: !s.focusManual }))), words: "concentrar" },
      { id: "c-settings", title: "config", sub: "Configurações do Widgy", icon: CMD_ICON(Settings), run: go(() => st.openWindow("settings")), words: "configuracoes ajustes" },
      { id: "c-lock", title: "bloquear", sub: "Bloquear o computador", icon: CMD_ICON(Lock), run: go(() => void bridge.bar.power("lock")) },
      { id: "c-sleep", title: "suspender", sub: "Suspender o computador", icon: CMD_ICON(Moon), run: go(() => void bridge.bar.power("sleep")) },
      { id: "c-restart", title: "reiniciar", sub: "Reiniciar o computador", icon: CMD_ICON(RotateCw), run: go(() => void bridge.bar.power("restart")) },
      { id: "c-off", title: "desligar", sub: "Desligar o computador", icon: CMD_ICON(Power), run: go(() => void bridge.bar.power("shutdown")) },
      { id: "c-exit", title: "sair", sub: "Voltar ao visual normal do Widgy", icon: CMD_ICON(LogOut), run: go(removePack), words: "pacote carbono normal" },
      { id: "c-accent", title: "destaque", sub: "Cor de destaque do Carbono (nas configurações)", icon: CMD_ICON(Palette), run: go(() => st.openWindow("settings")), words: "cor" },
    ]
  }, [close])

  const entries = useMemo<Entry[]>(() => {
    const run = (fn: () => void) => () => { close(); fn() }
    const secs: Entry[] = SECTIONS.map((s) => ({ id: "s-" + s.id, title: s.label, sub: "Widgy", icon: <AppIcon id={s.id} size={26} />, run: run(() => st.openWindow(s.id)) }))
    const pins = st.settings.pcPins ?? []
    const pinned = new Set(pins.map((p) => p.path.toLowerCase()))
    const pc = [...pins, ...apps.filter((a) => !pinned.has(a.path.toLowerCase()))]
      .map((a) => ({ id: "a-" + a.path, title: a.name, sub: pinned.has(a.path.toLowerCase()) ? "Fixado" : "Programa do PC", icon: <PcIcon path={a.path} />, run: run(() => void bridge.bar.launch(a.path)) }))
    return [...pc.slice(0, pins.length), ...secs, ...pc.slice(pins.length)]
  }, [apps, close])

  const results = useMemo<Entry[]>(() => {
    const raw = q.trim()
    if (raw.startsWith(">")) {
      const n = norm(raw.slice(1).trim())
      return commands.filter((c) => !n || norm(c.title + " " + c.sub + " " + (c.words ?? "")).includes(n))
    }
    const n = norm(raw)
    if (!n) return entries
    const scored = entries
      .map((e) => { const t = norm(e.title); return { e, s: t.startsWith(n) ? 0 : t.split(/\s+/).some((w) => w.startsWith(n)) ? 1 : t.includes(n) ? 2 : -1 } })
      .filter((x) => x.s >= 0).sort((a, b) => a.s - b.s).map((x) => x.e)
    return [...scored.slice(0, 40), { id: "web", title: `Pesquisar "${raw}" na web`, sub: "Abre no navegador", icon: CMD_ICON(Search), run: () => { close(); void bridge.bar.web(raw) } }]
  }, [q, entries, commands, close])

  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }) }, [sel])

  const wallRef = useRef<{ move: (d: number) => void; apply: () => void } | null>(null)
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); if (q) setQ(""); else close(); return }
    if (wallMode) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); wallRef.current?.move(1) }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); wallRef.current?.move(-1) }
      else if (e.key === "Enter") { e.preventDefault(); wallRef.current?.apply() }
      return
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); results[sel]?.run() }
    else if (e.key === "Tab" && q.startsWith(">") && results[sel]) { e.preventDefault(); setQ(">" + results[sel].title + " ") }
  }

  return (
    <motion.div layout className="w-[min(620px,calc(100vw-140px))] px-3 pt-3" transition={{ type: "spring", stiffness: 420, damping: 38 }}>
      {wallMode ? (
        <WallCarousel filter={q.replace(WALL_RE, "")} api={wallRef} close={close} />
      ) : (
        <div ref={list} className="sh-scroll max-h-[min(420px,52vh)] overflow-y-auto">
          {results.length === 0 && <div className="py-6 text-center text-sm" style={{ color: "var(--sh-muted)" }}>Nada encontrado.</div>}
          {results.map((r, i) => (
            <button key={r.id} data-i={i} type="button" onMouseMove={() => setSel(i)} onClick={r.run}
              className="relative flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left">
              {i === sel && <motion.span layoutId="sh-sel" className="absolute inset-0 rounded-[14px]" style={{ background: "var(--sh-2)" }} transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
              <span className="relative flex size-7 shrink-0 items-center justify-center">{r.icon}</span>
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{q.startsWith(">") ? <><span style={{ color: "var(--sh-dim)" }}>&gt;</span>{r.title}</> : r.title}</span>
                <span className="block truncate text-[11.5px]" style={{ color: "var(--sh-muted)" }}>{r.sub}</span>
              </span>
              {i === sel && <ChevronRight size={14} className="relative" style={{ color: "var(--sh-dim)" }} />}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-2.5 rounded-full px-4 py-2.5" style={{ background: "var(--sh-1)" }}>
        <Search size={15} style={{ color: "var(--sh-muted)" }} />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} spellCheck={false}
          placeholder='Digite ">" para comandos' aria-label="Buscar"
          className="sh-input flex-1 bg-transparent text-[13.5px] outline-none" style={{ color: "var(--sh-fg)" }} />
        {q && <button type="button" className="sh-btn size-6 !rounded-full" aria-label="Limpar" onClick={() => { setQ(""); input.current?.focus() }}><X size={13} /></button>}
      </div>
    </motion.div>
  )
}

/** >papel: carrossel com os fundos prontos e as suas imagens. Setas escolhem, Enter aplica. */
function WallCarousel({ filter, api, close }: { filter: string; api: React.MutableRefObject<{ move: (d: number) => void; apply: () => void } | null>; close: () => void }) {
  const media = useStore((s) => s.media)
  const wp = useStore((s) => s.settings.wallpaper)
  const setSettings = useStore((s) => s.setSettings)
  const items = useMemo(() => {
    const imgs = media.filter((m) => !m.animated).map((m) => ({ id: "m-" + m.id, name: m.name, bg: `center / cover no-repeat url("${mediaUrl(m.file)}")`, apply: () => ({ ...wp, type: "image" as const, image: m.file }) }))
    const grads = Object.entries(GRADIENTS).map(([id, g]) => ({ id: "g-" + id, name: g.label, bg: g.css, apply: () => ({ ...wp, type: "gradient" as const, gradient: id }) }))
    const n = norm(filter.trim())
    return [...imgs, ...grads].filter((x) => !n || norm(x.name).includes(n))
  }, [media, filter, wp])
  const currentIdx = Math.max(0, items.findIndex((x) => (wp.type === "image" && x.id.startsWith("m-") && media.find((m) => "m-" + m.id === x.id)?.file === wp.image) || (wp.type === "gradient" && x.id === "g-" + wp.gradient)))
  const [i, setI] = useState(currentIdx)
  useEffect(() => { setI((v) => Math.min(Math.max(0, v), Math.max(0, items.length - 1))) }, [items.length])
  const apply = (k = i) => { const it = items[k]; if (!it) return; setSettings({ wallpaper: it.apply() }); close() }
  api.current = { move: (d) => setI((v) => Math.max(0, Math.min(items.length - 1, v + d))), apply: () => apply() }

  const CARD = 150, GAP = 14
  if (!items.length) return <div className="py-10 text-center text-sm" style={{ color: "var(--sh-muted)" }}>Nenhum fundo com esse nome.</div>
  return (
    <div className="relative h-[170px] overflow-hidden" onWheel={(e) => api.current?.move(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1)}>
      <motion.div className="absolute left-1/2 top-3 flex items-start" style={{ gap: GAP }}
        animate={{ x: -(i * (CARD + GAP)) - CARD / 2 }} transition={{ type: "spring", stiffness: 380, damping: 36 }}>
        {items.map((it, k) => {
          const on = k === i
          return (
            <button key={it.id} type="button" onMouseEnter={() => setI(k)} onClick={() => apply(k)}
              className="flex shrink-0 flex-col items-center gap-2 rounded-2xl p-1.5 transition-colors"
              style={{ width: CARD, background: on ? "var(--sh-2)" : "transparent" }}>
              <motion.span className="block w-full overflow-hidden rounded-xl" animate={{ scale: on ? 1 : 0.86, opacity: Math.abs(k - i) > 2 ? 0.35 : 1 }}
                style={{ height: 96, background: it.bg, boxShadow: on ? "0 10px 26px rgba(0,0,0,.45)" : "none" }} />
              <span className="w-full truncate text-center text-[11px]" style={{ color: on ? "var(--sh-fg)" : "var(--sh-muted)" }}>{it.name}</span>
            </button>
          )
        })}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16" style={{ background: "linear-gradient(90deg, var(--sh-bg), transparent)" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16" style={{ background: "linear-gradient(270deg, var(--sh-bg), transparent)" }} />
    </div>
  )
}

