import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Lock, Maximize, Minus, Plus, Power, Square, Unlock, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import { cn } from "@/lib/utils"
import type { SectionId, WidgetType } from "@/lib/types"
import { SECTIONS } from "./sections-meta"
import { Logo } from "./Logo"
import { AppIcon } from "./AppIcon"
import { WIDGET_CHOICES } from "@/widgets/WidgetFrame"
import { useNow } from "@/widgets/Clock"
import { BellIcon, NotificationPanel } from "./NotificationCenter"

export function Taskbar() {
  const s = useStore((x) => x.settings)
  const tb = s.taskbar
  const windows = useStore((x) => x.windows)
  const open = useStore((x) => x.openWindow)
  const patch = useStore((x) => x.patchWindow)
  const setSettings = useStore((x) => x.setSettings)
  const [menu, setMenuRaw] = useState<null | "start" | "widgets" | "bell">(null)
  const readAll = useStore((x) => x.markNotificationsRead)
  // fechar o painel de avisos marca tudo como lido
  const setMenu = (m: null | "start" | "widgets" | "bell") => { if (menu === "bell" && m !== "bell") readAll(); setMenuRaw(m) }
  const [hidden, setHidden] = useState(false)
  const [mouse, setMouse] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const vertical = tb.position === "left" || tb.position === "right"
  const now = useNow(1000)

  // auto-ocultar
  useEffect(() => {
    if (!tb.autoHide) { setHidden(false); return }
    if (!menu) setHidden(true)
    let timer: ReturnType<typeof setTimeout> | null = null
    const cancel = () => { if (timer) clearTimeout(timer); timer = null }
    const mv = (e: PointerEvent) => {
      const edge =
        tb.position === "bottom" ? innerHeight - e.clientY : tb.position === "top" ? e.clientY : tb.position === "left" ? e.clientX : innerWidth - e.clientX
      if (edge < 12) { cancel(); setHidden(false) }
      else if (edge > tb.size + 70 && !menu) { if (!timer) timer = setTimeout(() => { setHidden(true); timer = null }, 500) }
      else cancel()
    }
    window.addEventListener("pointermove", mv)
    return () => { cancel(); window.removeEventListener("pointermove", mv) }
  }, [tb.autoHide, tb.position, tb.size, menu])

  const topWin = [...windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
  const clickSection = (id: SectionId) => {
    const w = windows.find((x) => x.id === id)
    if (w && !w.minimized && topWin?.id === id) patch(id, { minimized: true })
    else open(id)
    setMenu(null)
  }

  const isDock = tb.style !== "bar"
  const size = tb.size
  const icon = Math.round(size * 0.46)

  const posCls = {
    bottom: isDock ? "bottom-3 left-1/2 -translate-x-1/2" : "bottom-0 inset-x-0",
    top: isDock ? "top-3 left-1/2 -translate-x-1/2" : "top-0 inset-x-0",
    left: isDock ? "left-3 top-1/2 -translate-y-1/2" : "left-0 inset-y-0",
    right: isDock ? "right-3 top-1/2 -translate-y-1/2" : "right-0 inset-y-0",
  }[tb.position]
  const hideOffset = { bottom: { y: size + 30 }, top: { y: -(size + 30) }, left: { x: -(size + 30) }, right: { x: size + 30 } }[tb.position]

  const magnify = (idx: number, el: HTMLElement | null) => {
    if (!tb.magnify || !isDock || mouse == null || !el) return 1
    const r = el.getBoundingClientRect()
    const c = vertical ? r.top + r.height / 2 : r.left + r.width / 2
    const d = Math.abs(mouse - c)
    const k = Math.max(0, 1 - d / (size * 1.7))
    return 1 + ((1 - Math.cos(k * Math.PI)) / 2) * 0.25
  }

  const handleCls = {
    bottom: "bottom-1 left-1/2 -translate-x-1/2 h-1 w-28",
    top: "top-1 left-1/2 -translate-x-1/2 h-1 w-28",
    left: "left-1 top-1/2 -translate-y-1/2 w-1 h-28",
    right: "right-1 top-1/2 -translate-y-1/2 w-1 h-28",
  }[tb.position]

  return (
    <>
      <AnimatePresence>
        {tb.autoHide && hidden && (
          <motion.div
            className={cn("pointer-events-none fixed z-[799] rounded-full bg-brand", handleCls)}
            style={{ boxShadow: "0 0 12px var(--accent)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <motion.div
        ref={barRef}
        className={cn("fixed z-[800] flex", posCls)}
        animate={hidden ? hideOffset : { x: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onPointerMove={(e) => setMouse(vertical ? e.clientY : e.clientX)}
        onPointerLeave={() => setMouse(null)}
        style={{ perspective: 600 }}
      >
        <div
          className={cn(
            "surface flex items-center gap-1.5 px-2",
            vertical ? "flex-col py-2" : "flex-row",
            !isDock && (vertical ? "h-full justify-start !rounded-none" : "w-full justify-start !rounded-none"),
            tb.style === "floating" && "!rounded-full"
          )}
          style={vertical ? { width: size + 16 } : { height: size + 16 }}
        >
          <DockBtn label="Início" size={size} active={menu === "start"} onClick={() => setMenu(menu === "start" ? null : "start")} showLabel={false} scaleFn={(el) => magnify(-1, el)} vertical={vertical} position={tb.position}>
            <Logo size={Math.round(size * 0.78)} />
          </DockBtn>
          <Divider vertical={vertical} />
          <div className={cn("flex gap-1.5", vertical ? "flex-col" : "flex-row", !isDock && !vertical && "flex-1")}>
            {SECTIONS.map((sec, i) => {
              const w = windows.find((x) => x.id === sec.id)
              return (
                <DockBtn
                  key={sec.id}
                  label={sec.label}
                  size={size}
                  showLabel={tb.showLabels && !vertical}
                  running={!!w}
                  focused={topWin?.id === sec.id}
                  onClick={() => clickSection(sec.id)}
                  scaleFn={(el) => magnify(i, el)}
                  vertical={vertical}
                  position={tb.position}
                >
                  <AppIcon id={sec.id} size={Math.round(size * 0.8)} />
                </DockBtn>
              )
            })}
          </div>
          <Divider vertical={vertical} />
          <DockBtn label="Adicionar widget" size={size} active={menu === "widgets"} onClick={() => setMenu(menu === "widgets" ? null : "widgets")} scaleFn={(el) => magnify(99, el)} position={tb.position} vertical={vertical}>
            <Plus size={icon} />
          </DockBtn>
          <DockBtn label={s.widgetsLocked ? "Destravar widgets" : "Travar widgets"} size={size} onClick={() => setSettings({ widgetsLocked: !s.widgetsLocked })} scaleFn={(el) => magnify(100, el)} position={tb.position} vertical={vertical}>
            {s.widgetsLocked ? <Lock size={icon * 0.8} /> : <Unlock size={icon * 0.8} />}
          </DockBtn>
          <DockBtn label="Avisos" size={size} active={menu === "bell"} onClick={() => setMenu(menu === "bell" ? null : "bell")} scaleFn={(el) => magnify(101, el)} position={tb.position} vertical={vertical}>
            <BellIcon size={Math.round(icon * 0.8)} />
          </DockBtn>
          {!isDock && (
            <div className={cn("font-num flex flex-col items-center px-3 text-xs leading-tight", vertical && "py-2")}>
              <span className="text-sm font-semibold">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="text-fg-muted">{now.toLocaleDateString("pt-BR")}</span>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {menu && (
          <>
            <div className="fixed inset-0 z-[790]" onPointerDown={() => setMenu(null)} />
            <motion.div
              data-modal
              className={cn("surface fixed z-[810] w-[360px] max-h-[calc(100vh-var(--tb-size)-70px)] overflow-y-auto p-4", {
                bottom: "bottom-[calc(var(--tb-size)+40px)] left-1/2 -translate-x-1/2",
                top: "top-[calc(var(--tb-size)+40px)] left-1/2 -translate-x-1/2",
                left: "left-[calc(var(--tb-size)+40px)] top-1/2 -translate-y-1/2",
                right: "right-[calc(var(--tb-size)+40px)] top-1/2 -translate-y-1/2",
              }[tb.position])}
              initial={{ opacity: 0, y: tb.position === "top" ? -20 : 20, rotateX: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
              exit={{ opacity: 0, y: tb.position === "top" ? -10 : 10, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
            >
              {menu === "start" ? <StartMenu onPick={clickSection} close={() => setMenu(null)} /> : menu === "bell" ? <NotificationPanel close={() => setMenu(null)} /> : <WidgetMenu close={() => setMenu(null)} />}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function Divider({ vertical }: { vertical: boolean }) {
  return <div className={cn("shrink-0 bg-line", vertical ? "mx-auto h-px w-2/3" : "my-auto h-2/3 w-px")} />
}

function DockBtn({
  children, label, size, onClick, running, focused, active, showLabel, scaleFn, vertical, position,
}: {
  children: React.ReactNode; label: string; size: number; onClick: () => void; running?: boolean; focused?: boolean; active?: boolean
  showLabel?: boolean; scaleFn: (el: HTMLElement | null) => number; vertical?: boolean; position?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const scale = scaleFn(ref.current)
  // Espaço FIXO: a barra nunca muda de tamanho nem se desloca; só o ícone cresce dentro do próprio espaço
  // (e um pouco para cima), então é impossível sobrepor os vizinhos ou "fugir" do cursor.
  const lift = (scale - 1) * size * 0.9
  const liftT = position === "top" ? `translateY(${lift}px)` : position === "left" ? `translateX(${lift}px)` : position === "right" ? `translateX(${-lift}px)` : `translateY(${-lift}px)`
  const origin = position === "top" ? "top" : position === "left" ? "left" : position === "right" ? "right" : "bottom"
  return (
    <button
      ref={ref}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      className={cn("relative flex shrink-0 items-center justify-center gap-2 rounded-[calc(var(--r)*0.6)] transition-colors", (active || (showLabel && focused)) && "bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]", showLabel && "px-2")}
      style={{ height: size, minWidth: size }}
    >
      <div style={{ transform: `${liftT} scale(${scale})`, transformOrigin: origin, transition: "transform .14s ease-out", willChange: "transform" }}>
        <motion.div whileTap={{ scale: 0.85, rotateX: 25 }} style={{ transformStyle: "preserve-3d" }}>{children}</motion.div>
      </div>
      {showLabel && <span className="pr-1 text-sm">{label}</span>}
      {running && (
        <span
          className={cn("absolute rounded-full bg-brand transition-all", vertical ? "top-1/2 -translate-y-1/2" : "left-1/2 -translate-x-1/2")}
          style={{
            ...(position === "top" ? { top: -2 } : position === "left" ? { left: -4 } : position === "right" ? { right: -4 } : { bottom: -4 }),
            ...(vertical ? { width: 4, height: focused ? 18 : 6 } : { height: 4, width: focused ? 18 : 6 }),
            boxShadow: "0 0 8px var(--accent)",
          }}
        />
      )}
      <AnimatePresence>
        {hover && !showLabel && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={cn("surface pointer-events-none absolute z-50 px-2.5 py-1 text-xs whitespace-nowrap", {
              bottom: "bottom-full mb-3", top: "top-full mt-3", left: "left-full ml-3", right: "right-full mr-3",
            }[position ?? "bottom"])}
            style={{ borderRadius: 8 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

function StartMenu({ onPick, close }: { onPick: (id: SectionId) => void; close: () => void }) {
  const fs = useRef(false)
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Logo size={48} />
        <div>
          <div className="font-display text-2xl font-semibold italic">Agenda</div>
          <div className="text-xs text-fg-muted">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => onPick(s.id)} className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
            <AppIcon id={s.id} size={40} />
            <span className="text-xs">{s.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-between border-t border-line pt-3">
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-icon" title="Minimizar" onClick={() => { close(); bridge.win.minimize() }}><Minus size={15} /></button>
          <button className="btn btn-ghost btn-icon" title="Restaurar/maximizar" onClick={() => bridge.win.toggleMaximize()}><Square size={13} /></button>
          <button className="btn btn-ghost btn-icon" title="Tela cheia" onClick={() => { fs.current = !fs.current; bridge.win.fullscreen(fs.current) }}><Maximize size={15} /></button>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost !px-2 text-xs" title="Busca rápida" onClick={() => { close(); useStore.setState({ paletteOpen: true }) }}>Ctrl+K</button>
          <button className="btn hover:!text-red-400" title="Fecha de vez (não fica na bandeja)" onClick={() => bridge.app.quit()}><Power size={15} /> Sair</button>
        </div>
      </div>
    </div>
  )
}

function WidgetMenu({ close }: { close: () => void }) {
  const add = useStore((s) => s.addWidget)
  return (
    <div>
      <div className="mb-3 font-display text-lg font-semibold">Adicionar widget</div>
      {(["widget", "atalho"] as const).map((g) => (
        <div key={g}>
          {g === "atalho" && <div className="mt-3 mb-1.5 text-xs tracking-wide text-fg-muted uppercase">Atalhos das abas (com prévia)</div>}
          <div className="grid grid-cols-2 gap-1.5">
            {WIDGET_CHOICES.filter((c) => c.group === g).map((c) => (
              <button key={c.type + c.label} onClick={() => { add(c.type, c.config); close() }} className="flex items-center gap-2 rounded-xl p-2.5 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]">
                <span className="text-xl">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn btn-ghost mt-2 w-full text-xs text-fg-muted" onClick={close}><X size={12} /> Fechar</button>
    </div>
  )
}
