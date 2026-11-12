import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  Bell, ChevronRight, CloudSun, Cpu, Image as ImageIcon, LayoutDashboard, Lock, LogOut, Moon, Music2, Palette,
  Plus, Power, RotateCw, Search, Settings, Target, Volume2, Wifi, X,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import { SECTIONS } from "@/components/sections-meta"
import { MonoAppIcon, MonoSectionIcon } from "./MonoIcon"
import { GRADIENTS } from "@/components/Wallpaper"
import { NotificationPanel } from "@/components/NotificationCenter"
import { WIDGET_CHOICES } from "@/widgets/WidgetFrame"
import { useNow } from "@/widgets/Clock"
import { cn } from "@/lib/utils"
import type { SectionId } from "@/lib/types"
import { ACCENTS, CORNER, FRAME, RAIL, closeDash, openDash, removePack, luminance, shellPrefs, surfaceVars, useShell, type ShellPrefs } from "./pack"
import { Dashboard } from "./Dashboard"

/* ───────────────────────────── aparência ───────────────────────────── */

/** Cores do pacote. Tudo escuro e neutro; a cor de destaque aparece só em detalhes. */
export function useCarbonoVars(on: boolean, prefs: ShellPrefs) {
  useEffect(() => {
    const r = document.documentElement
    if (!on) { delete r.dataset.pack; document.getElementById("carbono-css")?.remove(); return }
    r.dataset.pack = "carbono"
    // O estilo vai no <head> sempre que o pacote está ativo. Antes ele vinha junto com a barra lateral:
    // com a barra do Widgy no lugar da do Windows a barra lateral não aparece, e a busca ficava transparente.
    if (!document.getElementById("carbono-css")) {
      const tag = document.createElement("style")
      tag.id = "carbono-css"
      tag.textContent = CSS
      document.head.appendChild(tag)
    }
    const a = ACCENTS[prefs.accent ?? "rose"]
    r.style.setProperty("--sh-accent", a.color)
    r.style.setProperty("--sh-accent-2", a.soft)
    // cor dos painéis e, se escolhida, uma cor própria para a barra lateral e a moldura
    const set = (prefix: string, v: ReturnType<typeof surfaceVars>) => {
      r.style.setProperty(`--${prefix}bg`, v.bg); r.style.setProperty(`--${prefix}1`, v.s1); r.style.setProperty(`--${prefix}2`, v.s2)
      r.style.setProperty(`--${prefix}3`, v.s3); r.style.setProperty(`--${prefix}fg`, v.fg); r.style.setProperty(`--${prefix}muted`, v.muted)
      r.style.setProperty(`--${prefix}dim`, v.dim); r.style.setProperty(`--${prefix}line`, v.line)
    }
    const panel = surfaceVars(prefs.bg || "#121212")
    set("sh-", panel)
    r.style.setProperty("--sh-on-fg", panel.bg)
    set("sh-rail-", surfaceVars(prefs.railBg || prefs.bg || "#121212"))
    // logo de pétalas claras: num fundo claro ele é escurecido para continuar visível
    const dark = "brightness(.55) saturate(1.5)"
    r.style.setProperty("--sh-logo", luminance(prefs.bg || "#121212") > 0.4 ? dark : "none")
    r.style.setProperty("--sh-rail-logo", luminance(prefs.railBg || prefs.bg || "#121212") > 0.4 ? dark : "none")
    const names = ["bg", "1", "2", "3", "fg", "muted", "dim", "line"].flatMap((k) => ["--sh-" + k, "--sh-rail-" + k]).concat("--sh-on-fg", "--sh-accent", "--sh-accent-2", "--sh-logo", "--sh-rail-logo")
    return () => { delete r.dataset.pack; for (const n of names) r.style.removeProperty(n) }
  }, [on, prefs.accent, prefs.bg, prefs.railBg])
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
/* a barra lateral usa a cor dela (igual aos painéis, a menos que você escolha outra) */
.sh-rail { --sh-bg: var(--sh-rail-bg); --sh-1: var(--sh-rail-1); --sh-2: var(--sh-rail-2); --sh-3: var(--sh-rail-3);
  --sh-fg: var(--sh-rail-fg); --sh-muted: var(--sh-rail-muted); --sh-dim: var(--sh-rail-dim); --sh-line: var(--sh-rail-line); }
`

type Edge = "top" | "bottom" | "left" | "right"

/**
 * Forma do painel numa peça só: a faixa que encosta na moldura, as duas curvas côncavas que o ligam a ela
 * e os cantos de fora arredondados. Desenhada para um painel no topo (x ao longo da borda, y para dentro);
 * as outras bordas giram/espelham o mesmo desenho. W = largura ao longo da borda, H = profundidade.
 */
function edgePath(W: number, H: number, off: number, R: number, Rb: number) {
  const r = Math.min(Rb, W / 2, Math.max(0, H - off - R))
  return `M${-R} 0H${W + R}V${off}A${R} ${R} 0 0 0 ${W} ${off + R}V${H - r}A${r} ${r} 0 0 1 ${W - r} ${H}H${r}A${r} ${r} 0 0 1 0 ${H - r}V${off + R}A${R} ${R} 0 0 0 ${-R} ${off}Z`
}
const OUTER = CORNER + 6

function EdgeShape({ edge, w, h, offset }: { edge: Edge; w: number; h: number; offset: number }) {
  if (!w || !h) return null
  const along = edge === "top" || edge === "bottom" ? w : h
  const depth = edge === "top" || edge === "bottom" ? h : w
  const d = edgePath(along, depth, offset, CORNER, OUTER)
  // posição e transformação do desenho para cada borda (as curvas passam CORNER px para fora do painel)
  const box: CSSProperties = edge === "top" || edge === "bottom"
    ? { left: -CORNER, top: 0, width: along + 2 * CORNER, height: depth }
    : { top: -CORNER, left: 0, width: depth, height: along + 2 * CORNER }
  const tf = {
    top: `translate(${CORNER} 0)`,
    bottom: `translate(${CORNER} ${depth}) scale(1 -1)`,
    left: `matrix(0 1 1 0 0 ${CORNER})`,
    right: `matrix(0 1 -1 0 ${depth} ${CORNER})`,
  }[edge]
  return (
    <svg aria-hidden className="pointer-events-none absolute overflow-visible" style={box} width={box.width as number} height={box.height as number}>
      <path d={d} transform={tf} fill="var(--sh-bg)" shapeRendering="geometricPrecision" />
    </svg>
  )
}

/**
 * Painel que sai de uma borda da tela, com os cantos de fora arredondados e os de dentro côncavos.
 * `offset`: espessura da moldura na borda onde o painel encosta (o painel cobre essa faixa com a própria cor).
 */
function EdgePanel({ edge, open, offset, inset = 0, style, center, className, children, onLeave, onEnter, label }: {
  edge: Edge; open: boolean; offset: number; inset?: number; style?: CSSProperties; center?: boolean; className?: string; children: ReactNode
  onLeave?: () => void; onEnter?: () => void; label: string
}) {
  const vertical = edge === "top" || edge === "bottom"
  const hidden = { top: { y: "-102%" }, bottom: { y: "102%" }, left: { x: "-102%" }, right: { x: "102%" } }[edge]
  const pad = { top: "paddingTop", bottom: "paddingBottom", left: "paddingLeft", right: "paddingRight" }[edge]
  const body = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    if (!open) return
    const el = body.current
    if (!el) return
    const read = () => setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog" aria-label={label} data-modal
          className={cn("sh fixed", className ?? "z-[7000]")}
          style={{ ...style, [edge]: inset, ...(center ? { x: "-50%" } : {}) }}
          initial={hidden} animate={vertical ? { y: 0 } : { x: 0 }} exit={hidden}
          // curto e sem mola: o painel chega rápido e para de mexer logo (antes ~450 ms)
          transition={{ duration: 0.2, ease: [0.2, 0.9, 0.25, 1] }}
          onPointerLeave={onLeave} onPointerEnter={onEnter}
        >
          <EdgeShape edge={edge} w={size.w} h={size.h} offset={offset} />
          <div ref={body} className="relative" style={{ [pad]: offset }}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Moldura: a tela inteira na cor da barra, com um retângulo arredondado vazado no meio (um desenho só, sem sombra gigante). */
function Frame({ side, f }: { side: "left" | "right"; f: number }) {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", on)
    return () => window.removeEventListener("resize", on)
  }, [])
  const l = side === "left" ? RAIL : f, r = side === "right" ? RAIL : f
  const x0 = l, x1 = vp.w - r, y0 = f, y1 = vp.h - f, R = CORNER
  const hole = `M${x0 + R} ${y0}H${x1 - R}A${R} ${R} 0 0 1 ${x1} ${y0 + R}V${y1 - R}A${R} ${R} 0 0 1 ${x1 - R} ${y1}H${x0 + R}A${R} ${R} 0 0 1 ${x0} ${y1 - R}V${y0 + R}A${R} ${R} 0 0 1 ${x0 + R} ${y0}Z`
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 z-[795]" width={vp.w} height={vp.h} style={{ willChange: "transform" }}>
      <path fillRule="evenodd" fill="var(--sh-rail-bg, var(--sh-bg))" d={`M0 0H${vp.w}V${vp.h}H0Z${hole}`} />
    </svg>
  )
}

/* ───────────────────────────── moldura + barra ───────────────────────────── */

/** Moldura do Carbono mantida mesmo com a barra do Windows substituída. */
export function CarbonoBorder() {
  const prefs = shellPrefs(useStore((s) => s.settings))
  return prefs.frame ? <Frame side={prefs.side ?? "left"} f={FRAME} /> : null
}

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
      {/* moldura: a tela na cor da barra com um retângulo arredondado vazado */}
      {prefs.frame && <Frame side={side} f={f} />}
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
      className={cn("sh sh-rail fixed inset-y-0 z-[800] flex flex-col items-center py-2.5", side === "left" ? "left-0" : "right-0")}
      style={{ width: RAIL, background: "var(--sh-bg)" }}
>
      <button type="button" className="sh-btn size-9" title="Buscar e abrir (Ctrl+K)" aria-label="Buscar e abrir"
        onClick={() => useStore.setState((s) => ({ paletteOpen: !s.paletteOpen }))}>
        <Search size={19} aria-hidden="true" strokeWidth={1.8} />
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

  // encostar o mouse no meio do topo abre o painel; no meio de baixo, a busca
  const byHover = useRef(false)
  const hoverBottom = prefs.hoverBottom !== false
  useEffect(() => {
    if (!prefs.hoverTop && !hoverBottom) return
    let dwell: number | undefined
    let zone: "" | "top" | "bottom" = ""
    const move = (e: PointerEvent) => {
      const w = window.innerWidth, h = window.innerHeight
      const centered = Math.abs(e.clientX - (left + (w - left - right) / 2)) < 220
      const edge = Math.max(3, f + 1)
      const now: typeof zone = !centered ? "" : prefs.hoverTop && e.clientY <= edge ? "top" : hoverBottom && e.clientY >= h - edge ? "bottom" : ""
      if (now !== zone) { clearTimeout(dwell); dwell = undefined; zone = now }
      if (!zone || dwell) return
      dwell = window.setTimeout(() => {
        dwell = undefined
        if (zone === "top" && !useShell.getState().dash) openDash()
        if (zone === "bottom" && !useStore.getState().paletteOpen) { byHover.current = true; useStore.setState({ paletteOpen: true }) }
      }, 90)
    }
    window.addEventListener("pointermove", move)
    return () => { window.removeEventListener("pointermove", move); clearTimeout(dwell) }
  }, [prefs.hoverTop, hoverBottom, f, left, right])
  useEffect(() => { if (!launcher) byHover.current = false }, [launcher])

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
      <EdgePanel edge="bottom" open={launcher} offset={f} label="Buscar" style={center} center
        onEnter={() => clearTimeout(leaveTimer.current)}
        onLeave={() => { if (byHover.current && !launcherQuery.current) leaveTimer.current = window.setTimeout(() => useStore.setState({ paletteOpen: false }), 650) }}>
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
/** Ícone de marca sem plaquinha: forma original monocromática ou ícone Windows sem cor. */
function PcIcon({ path, name }: { path: string; name: string }) {
  return <span className="flex size-7 items-center justify-center" style={{ color: "var(--sh-fg)" }}>
    <MonoAppIcon name={name} path={path} size={22} />
  </span>
}

const CMD_ICON = (I: typeof Search) => <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: "var(--sh-2)" }}><I size={14} style={{ color: "var(--sh-fg)" }} /></span>
const WALL_RE = /^>\s*(papel|wallpaper|fundo)\b\s*/i

/** texto digitado na busca (aberta pelo mouse, ela só fecha sozinha se nada foi digitado) */
const launcherQuery = { current: "" }

function Launcher({ close }: { close: () => void }) {
  const [q, setQ] = useState("")
  launcherQuery.current = q
  const [sel, setSel] = useState(0)
  const [apps, setApps] = useState<{ name: string; path: string }[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const st = useStore.getState()
  useEffect(() => {
    let alive = true
    void loadApps().then((items) => { if (alive) setApps(items) })
    const t = requestAnimationFrame(() => input.current?.focus())
    return () => {
      alive = false
      cancelAnimationFrame(t)
      // Ao fechar devolve os ícones (base64, pesados) à memória. A lista de programas é leve (nomes e caminhos)
      // e fica guardada: reabrir a busca mostra tudo na hora, sem esperar o Windows montar a lista de novo.
      // Sem cache de imagens: cada ícone é um SVG leve e local.
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
    const secs: Entry[] = SECTIONS.map((s) => ({ id: "s-" + s.id, title: s.label, sub: "Widgy", icon: <span className="flex size-7 items-center justify-center" style={{ color: "var(--sh-fg)" }}><MonoSectionIcon id={s.id} size={19} /></span>, run: run(() => st.openWindow(s.id)) }))
    const pins = st.settings.pcPins ?? []
    const pinned = new Set(pins.map((p) => p.path.toLowerCase()))
    const pc = [...pins, ...apps.filter((a) => !pinned.has(a.path.toLowerCase()))]
      .map((a) => ({ id: "a-" + a.path, title: a.name, sub: pinned.has(a.path.toLowerCase()) ? "Fixado" : "Programa do PC", icon: <PcIcon name={a.name} path={a.path} />, run: run(() => void bridge.bar.launch(a.path)) }))
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
    <div className="w-[min(620px,calc(100vw-140px))] px-3 pt-3">
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
    </div>
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

