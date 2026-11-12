import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Bell, ChevronUp, Grid2X2, Lock, Plus, Search, Unlock, Volume2, Wifi } from "lucide-react"
import { bridge, type BarMenu, type BarSync, type PcWindow } from "@/lib/bridge"
import { Logo } from "@/components/Logo"
import { AppIconView, type IconPrefs } from "@/components/AppIconView"
import type { SectionId } from "@/lib/types"
import { cn } from "@/lib/utils"
import { iconPackAppSrc, type IconPackStyle } from "@/lib/iconPack"
import { MonoAppIcon, MonoSectionIcon } from "@/shell/MonoIcon"
import { exeKey, useBarSync } from "./sync"

/**
 * A barra de tarefas do Agenda como barra do PC: o mesmo jeito da barra de dentro do Agenda
 * (Dock, Pílula ou Barra; embaixo, em cima ou dos lados; tamanho, lupa, nomes, ocultar sozinha),
 * com as abas do Agenda e também os programas do Windows abertos e fixados.
 */
interface Group { key: string; exe: string; name: string; icon: string; wins: PcWindow[]; pinned: boolean }
type Pos = "bottom" | "top" | "left" | "right"
const TB_DEFAULT: NonNullable<BarSync["tb"]> = { position: "bottom", style: "dock", size: 56, autoHide: false, magnify: true, showLabels: false }

/** ícone de um programa (fixado e fechado não vem na lista de janelas: pede ao Windows) */
function useIcon(file: string, given: string, enabled: boolean) {
  const [url, setUrl] = useState(enabled ? given : "")
  useEffect(() => {
    if (!enabled) { setUrl(""); return }
    if (given) { setUrl(given); return }
    if (!file) { setUrl(""); return }
    let mounted = true
    void bridge.bar.icon(file).then((src) => { if (mounted) setUrl(src) }).catch(() => { if (mounted) setUrl("") })
    return () => { mounted = false }
  }, [file, given, enabled])
  return url
}
function ExeIcon({ g, size, style, mono }: { g: Group; size: number; style: IconPackStyle; mono: boolean }) {
  const icon = useIcon(g.exe, g.icon, !mono)
  if (mono) return <MonoAppIcon name={g.name} path={g.exe} size={size} originalSrc={g.icon} />
  const packed = iconPackAppSrc(g.name, g.exe, style)
  return packed ? <img src={packed} alt="" draggable={false} style={{ width: size, height: size, objectFit: "contain" }} /> :
    icon ? <img src={icon} alt="" draggable={false} style={{ width: size, height: size }} /> :
    <span className="flex items-center justify-center text-xs font-semibold" style={{ width: size, height: size }}>{g.name.slice(0, 2)}</span>
}

export function SystemBar() {
  const sync = useBarSync()
  const carbono = sync?.pack === "carbono"
  const t = { ...TB_DEFAULT, ...(sync?.tb ?? {}) }
  const pos = t.position as Pos
  const vertical = pos === "left" || pos === "right"
  const isDock = t.style !== "bar"
  const [wins, setWins] = useState<PcWindow[]>([])
  const [fg, setFg] = useState("")
  const [menu, setMenu] = useState<BarMenu | "">("")
  const [peek, setPeek] = useState(false)
  const [now, setNow] = useState(new Date())
  const [vw, setVw] = useState({ w: innerWidth, h: innerHeight })
  const [mouse, setMouse] = useState<number | null>(null)
  const lastMouse = useRef({ at: 0, coordinate: -999 })
  const trackMouse = (coordinate: number) => {
    if (!t.magnify || !isDock || document.hidden) return
    const now = performance.now()
    const prev = lastMouse.current
    // Mouse gamer pode mandar 1000+ eventos/s: no máximo ~30 renders/s.
    if (now - prev.at < 32 || Math.abs(coordinate - prev.coordinate) < 3) return
    prev.at = now
    prev.coordinate = coordinate
    setMouse(coordinate)
  }
  const [hidden, setHidden] = useState(false)
  const [max, setMax] = useState(false)
  useEffect(() => bridge.bar.onMax(setMax), [])
  // esconde sozinha: sempre (ocultar automaticamente) ou enquanto tem janela maximizada neste monitor
  const auto = t.autoHide || (t.smartHide !== false && max)
  const dockRef = useRef<HTMLDivElement>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const previewLeftAt = useRef(0)
  const previewShownAt = useRef(0)
  useEffect(() => bridge.bar.onWins((d) => { setWins(d.wins); setFg(d.fg) }), [])
  useEffect(() => bridge.bar.onMenuState(setMenu), [])
  useEffect(() => { const id = setInterval(() => { if (!document.hidden) setNow(new Date()) }, 30000); return () => clearInterval(id) }, [])
  useLayoutEffect(() => { const f = () => setVw({ w: innerWidth, h: innerHeight }); addEventListener("resize", f); return () => removeEventListener("resize", f) }, [])

  // ocultar sozinha: some longe do mouse e volta quando ele encosta na borda da tela
  useEffect(() => {
    if (!auto) { setHidden(false); return }
    if (!menu) setHidden(true)
    let timer: ReturnType<typeof setTimeout> | null = null
    const cancel = () => { if (timer) clearTimeout(timer); timer = null }
    const mv = (e: PointerEvent) => {
      const edge = pos === "bottom" ? innerHeight - e.clientY : pos === "top" ? e.clientY : pos === "left" ? e.clientX : innerWidth - e.clientX
      if (edge < 6) { cancel(); setHidden(false) }
      else if (edge > t.size + 40 && !menu) { if (!timer) timer = setTimeout(() => { setHidden(true); timer = null }, 500) }
      else cancel()
    }
    const out = () => { if (!menu && !timer) timer = setTimeout(() => { setHidden(true); timer = null }, 700) }
    window.addEventListener("pointermove", mv)
    document.addEventListener("pointerleave", out)
    return () => { cancel(); window.removeEventListener("pointermove", mv); document.removeEventListener("pointerleave", out) }
  }, [auto, pos, t.size, menu])

  // programas do Windows: fixados primeiro (na ordem), depois os abertos — janelas do mesmo programa juntas
  const pins = sync?.pins ?? []
  const groups: Group[] = pins.map((p) => ({ key: exeKey(p.path), exe: p.path, name: p.name, icon: "", wins: [], pinned: true }))
  const hide = new Set(t.hide ?? [])
  const shows = (id: string) => !hide.has(id)
  // programas abertos do Windows (desligável); os fixados aparecem sempre
  for (const w of t.pcOpen === false ? [] : wins) {
    const k = exeKey(w.exe || w.h)
    let g = groups.find((x) => x.key === k)
    if (!g) { g = { key: k, exe: w.exe, name: w.name, icon: w.icon, wins: [], pinned: false }; groups.push(g) }
    if (!g.icon) g.icon = w.icon
    g.wins.push(w)
  }
  const sections = (sync?.sections ?? []).filter((x) => shows(x.id))
  const secs = sync?.secs ?? []
  const icons: IconPrefs = (sync?.icons as IconPrefs | undefined) ?? { iconStyle: "auto", theme: "glass", iconShape: "squircle", iconColors: undefined } as unknown as IconPrefs
  const packStyle: IconPackStyle = icons.iconPackStyle ?? "original"

  // responsivo: os botões encolhem quando não cabem na borda
  const count = 1 + sections.length + groups.length + 3 + (isDock ? 2 : 5)
  const length = vertical ? vw.h : vw.w
  const fixed = isDock ? 60 : vertical ? 120 : 260
  const size = Math.max(26, Math.min(t.size, Math.floor((length - fixed) / Math.max(1, count)) - 6))
  const icon = Math.round(size * 0.46)

  const magnify = (el: HTMLElement | null) => {
    if (!t.magnify || !isDock || mouse == null || !el) return 1
    const r = el.getBoundingClientRect()
    const c = vertical ? r.top + r.height / 2 : r.left + r.width / 2
    const k = Math.max(0, 1 - Math.abs(mouse - c) / (size * 1.7))
    return 1 + ((1 - Math.cos(k * Math.PI)) / 2) * 0.25
  }

  const clickApp = (g: Group) => {
    if (!g.wins.length) return bridge.bar.launch(g.exe)
    if (g.wins.length === 1) return bridge.bar.click(g.wins[0].h, g.wins[0].min)
    // várias janelas: vai passando por elas
    const i = g.wins.findIndex((w) => w.h === fg)
    const next = g.wins[(i + 1) % g.wins.length]
    bridge.bar.click(next.h, true)
  }
  const pin = (g: Group) => bridge.bar.toMain(g.pinned ? { type: "unpin", path: g.exe } : { type: "pin", app: { path: g.exe, name: g.name } })
  const openMenu = (kind: BarMenu, el: HTMLElement, w: number, h: number) => {
    const r = el.getBoundingClientRect()
    bridge.bar.menu(kind, vertical ? r.top + r.height / 2 : r.left + r.width / 2, w, h)
  }

  const btn = { size, vertical, pos, isDock, magnify }
  const hideOffset = { bottom: { y: size + 40 }, top: { y: -(size + 40) }, left: { x: -(size + 40) }, right: { x: size + 40 } }[pos]
  // a barra fica sempre no meio da borda (flex-col: justify = vertical, items = horizontal)
  const align = { bottom: "justify-end items-center", top: "justify-start items-center", left: "justify-start items-center", right: "justify-end items-center" }[pos]
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className={cn("fixed inset-0 flex", vertical ? "flex-row" : "flex-col", align)} onContextMenu={(e) => e.preventDefault()}>
      <motion.div
        ref={dockRef}
        className={cn("flex", !isDock && (vertical ? "h-full" : "w-full"), isDock && { bottom: "mb-3", top: "mt-3", left: "ml-3", right: "mr-3" }[pos])}
        animate={hidden ? hideOffset : { x: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onPointerEnter={() => bridge.bar.hit(true)}
        onPointerLeave={() => { bridge.bar.hit(false); setMouse(null) }}
        onPointerMove={(e) => trackMouse(vertical ? e.clientY : e.clientX)}
        style={{ perspective: 600 }}
      >
        <div
          className={cn(
            "flex items-center gap-1.5 text-fg",
            isDock ? "surface" : "bar-bg",
            vertical ? "flex-col py-2" : "flex-row px-2",
            !isDock && (vertical ? "h-full w-full" : "h-full w-full"),
            t.style === "floating" && "!rounded-full",
            isDock && (vertical ? "px-0" : "px-2"),
          )}
          style={{
            ...(vertical ? { width: size + 16 } : { height: size + 16 }),
            ...(carbono ? {
              background: "var(--sh-rail-bg, #121212)",
              color: "var(--sh-rail-fg, #ece7e8)",
              borderColor: "var(--sh-rail-line, rgba(255,255,255,.06))",
              boxShadow: "none",
            } : {}),
          }}
        >
          {/* Iniciar do Windows (igual ao de uma barra normal) e o Iniciar do Agenda */}
          {shows("winstart") && (
            <Btn {...btn} label="Iniciar do Windows" onClick={() => bridge.bar.winStart()}>
              {carbono ? <Grid2X2 size={Math.round(size * 0.5)} strokeWidth={1.8} /> : <WinLogo size={Math.round(size * 0.5)} />}
            </Btn>
          )}
          <Btn {...btn} label="Iniciar do Widgy" active={menu === "start"} onClick={(el) => openMenu("start", el, 640, 660)}>
            {carbono ? <Search size={Math.round(size * 0.46)} strokeWidth={1.8} /> : <Logo size={Math.round(size * 0.78)} />}
          </Btn>
          <Divider vertical={vertical} />

          {/* abas do Agenda */}
          {sections.map((sec) => {
            const w = secs.find((x) => x.id === sec.id)
            return (
              <Btn key={sec.id} {...btn} label={sec.label} showLabel={t.showLabels && !vertical} running={!!w} focused={!!w?.top} onClick={() => bridge.bar.toMain({ type: "section", id: sec.id })}>
                {carbono
                  ? <MonoSectionIcon id={sec.id as SectionId} size={Math.round(size * 0.52)} />
                  : <AppIconView id={sec.id as SectionId} size={Math.round(size * 0.8)} s={icons} />}
              </Btn>
            )
          })}

          {/* programas do Windows */}
          {groups.length > 0 && <Divider vertical={vertical} />}
          {groups.map((g) => {
            const isFg = g.wins.some((w) => w.h === fg)
            return (
              <Btn
                key={g.key}
                {...btn}
                label={(g.wins.length ? g.wins.map((w) => w.title).join("\n") : g.name) + (g.pinned ? "\n(clique direito: desafixar)" : "\n(clique direito: fixar)")}
                running={g.wins.length > 0}
                focused={isFg}
                count={g.wins.length}
                onClick={() => clickApp(g)}
                onHover={g.wins.length ? (el, on) => {
                  // prévia das janelas abertas (como no Windows): um instante parado em cima abre;
                  // passando de um programa para outro com a prévia aberta, troca na hora
                  clearTimeout(previewTimer.current)
                  if (!on) { previewLeftAt.current = Date.now(); bridge.bar.previewLeave(); return }
                  const quick = previewShownAt.current > 0 && previewShownAt.current <= previewLeftAt.current && Date.now() - previewLeftAt.current < 350
                  previewTimer.current = setTimeout(() => {
                    previewShownAt.current = Date.now()
                    const r = el.getBoundingClientRect()
                    bridge.bar.preview(g.wins.map((w) => ({ h: w.h, title: w.title, icon: w.icon || g.icon, min: w.min })), vertical ? r.top + r.height / 2 : r.left + r.width / 2)
                  }, quick ? 0 : 200)
                } : undefined}
                onRight={() => pin(g)}
                onMiddle={() => bridge.bar.launch(g.exe)}
              >
                <ExeIcon g={g} size={Math.round(size * 0.62)} style={packStyle} mono={carbono} />
              </Btn>
            )
          })}

          {!isDock && !vertical && <div className="flex-1" />}
          <Divider vertical={vertical} />
          {shows("widgets") && <Btn {...btn} label="Adicionar widget" onClick={() => bridge.bar.toMain({ type: "widgets" })}><Plus size={icon} /></Btn>}
          {shows("lock") && (
            <Btn {...btn} label={sync?.locked ? "Destravar widgets" : "Travar widgets"} onClick={() => bridge.bar.toMain({ type: "lock" })}>
              {sync?.locked ? <Lock size={icon * 0.8} /> : <Unlock size={icon * 0.8} />}
            </Btn>
          )}
          {shows("bell") && <Btn {...btn} label="Avisos" onClick={() => bridge.bar.toMain({ type: "bell" })}>
            <span className="relative">
              <Bell size={Math.round(icon * 0.8)} />
              {!!sync?.unread && <span className="absolute -top-1.5 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--accent)] px-0.5 font-num text-[9px] text-white">{sync.unread > 9 ? "9+" : sync.unread}</span>}
            </span>
          </Btn>}

          {/* bandeja do Windows, rede, som e relógio */}
          {shows("tray") && (
            <Btn {...btn} label={peek ? "Esconder os ícones do Windows" : "Ícones do Windows (perto do relógio)"} active={peek} onClick={() => { setPeek(!peek); bridge.bar.peek(!peek) }}>
              <ChevronUp size={icon * 0.75} className={cn("transition-transform", peek && "rotate-180", vertical && (pos === "left" ? "rotate-90" : "-rotate-90"))} />
            </Btn>
          )}
          {!isDock && !vertical && (
            <>
              <Btn {...btn} label="Rede" onClick={() => bridge.bar.power("network")}><Wifi size={icon * 0.75} /></Btn>
              <Btn {...btn} label="Som" onClick={() => bridge.bar.power("volume")}><Volume2 size={icon * 0.75} /></Btn>
            </>
          )}
          {shows("clock") && <button
            className={cn("bar-btn shrink-0 font-num leading-tight", vertical ? "w-full flex-col py-1" : "h-[calc(100%-8px)] flex-col !items-center px-2.5")}
            data-on={menu === "clock"}
            title={now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            onClick={(e) => openMenu("clock", e.currentTarget, 340, 400)}
          >
            <span className="text-[13px] font-semibold">{time}</span>
            {!isDock && !vertical && <span className="text-[11px] text-fg-muted">{now.toLocaleDateString("pt-BR")}</span>}
          </button>}
          {/* ponta da barra (como no Windows): clicar mostra a área de trabalho; clicar de novo traz as janelas de volta */}
          {shows("corner") && (
            <button
              className={cn("group flex shrink-0 items-center justify-center rounded-md", vertical ? "h-3 w-full" : "h-[calc(100%-10px)] w-3")}
              title="Mostrar a área de trabalho"
              onClick={() => bridge.bar.desktop()}
            >
              <span className={cn("rounded-full bg-[color-mix(in_srgb,var(--fg)_22%,transparent)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--fg)_55%,transparent)]", vertical ? "h-[3px] w-1/2" : "h-1/2 w-[3px]")} />
            </button>
          )}
        </div>
      </motion.div>

    </div>
  )
}

/** logo do Windows (quatro quadrados, azul do Windows 11) */
function WinLogo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Windows">
      <defs>
        <linearGradient id="winlogo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4cc2ff" />
          <stop offset="1" stopColor="#0f6cdb" />
        </linearGradient>
      </defs>
      <path fill="url(#winlogo)" d="M1 1h10.5v10.5H1zM12.5 1H23v10.5H12.5zM1 12.5h10.5V23H1zM12.5 12.5H23V23H12.5z" />
    </svg>
  )
}

function Divider({ vertical }: { vertical: boolean }) {
  return <div className={cn("shrink-0 bg-line", vertical ? "mx-auto h-px w-2/3" : "my-auto h-2/3 w-px")} />
}

/** botão da barra: mesmo comportamento da barra do Agenda (lupa sem empurrar os vizinhos, legenda, pontinho) */
function Btn({
  children, label, size, onClick, onHover, onRight, onMiddle, running, focused, active, showLabel, count, magnify, vertical, pos, isDock,
}: {
  children: ReactNode; label: string; size: number; onClick: (el: HTMLButtonElement) => void; onHover?: (el: HTMLButtonElement, on: boolean) => void; onRight?: () => void; onMiddle?: () => void
  running?: boolean; focused?: boolean; active?: boolean; showLabel?: boolean; count?: number
  magnify: (el: HTMLElement | null) => number; vertical: boolean; pos: Pos; isDock: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const scale = magnify(ref.current)
  const lift = (scale - 1) * size * 0.9
  const liftT = pos === "top" ? `translateY(${lift}px)` : pos === "left" ? `translateX(${lift}px)` : pos === "right" ? `translateX(${-lift}px)` : `translateY(${-lift}px)`
  const origin = pos === "top" ? "top" : pos === "left" ? "left" : pos === "right" ? "right" : "bottom"
  const first = label.split("\n")[0]
  return (
    <button
      ref={ref}
      onClick={() => ref.current && onClick(ref.current)}
      onContextMenu={(e) => { e.preventDefault(); onRight?.() }}
      onAuxClick={(e) => { if (e.button === 1) onMiddle?.() }}
      onPointerEnter={() => { setHover(true); if (ref.current) onHover?.(ref.current, true) }}
      onPointerLeave={() => { setHover(false); if (ref.current) onHover?.(ref.current, false) }}
      title={isDock || onHover ? undefined : label}
      className={cn("relative flex shrink-0 items-center justify-center gap-2 rounded-[calc(var(--r)*0.6)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]", (active || (showLabel && focused)) && "bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]", showLabel && "px-2")}
      style={{ height: size, minWidth: size }}
    >
      <div style={{ transform: `${liftT} scale(${scale})`, transformOrigin: origin, transition: "transform .14s ease-out", willChange: "transform" }}>
        <motion.div whileTap={{ scale: 0.85, rotateX: 25 }} style={{ transformStyle: "preserve-3d" }}>{children}</motion.div>
      </div>
      {showLabel && <span className="max-w-[140px] truncate pr-1 text-sm">{first}</span>}
      {!!count && count > 1 && <span className="absolute top-0.5 right-1 font-num text-[9px] text-fg-muted">{count}</span>}
      {running && (
        <span
          className={cn("absolute rounded-full bg-brand transition-all", vertical ? "top-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2")}
          style={{
            ...(pos === "top" ? { top: -2 } : pos === "left" ? { left: -4 } : pos === "right" ? { right: -4 } : { bottom: -4 }),
            ...(vertical ? { width: 4, height: focused ? 18 : 6 } : { height: 4, width: focused ? 18 : 6 }),
            boxShadow: "0 0 8px var(--accent)",
          }}
        />
      )}
      <AnimatePresence>
        {hover && isDock && !showLabel && !onHover && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={cn("surface pointer-events-none absolute z-50 max-w-[260px] truncate px-2.5 py-1 text-xs whitespace-nowrap", {
              bottom: "bottom-full mb-3", top: "top-full mt-3", left: "left-full ml-3", right: "right-full mr-3",
            }[pos])}
            style={{ borderRadius: 8 }}
          >
            {first}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
