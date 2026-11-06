import React, { lazy, Suspense, useRef } from "react"
import { motion } from "framer-motion"
import { Copy, Minus, Square, X } from "lucide-react"
import { useStore } from "@/lib/store"
import type { WinState } from "@/lib/types"
import { cn } from "@/lib/utils"
import { SECTIONS } from "./sections-meta"
import { AppIcon } from "./AppIcon"
import { useViewport } from "@/lib/viewport"
import { ErrorBoundary } from "./ErrorBoundary"

const LOADERS = {
  today: () => import("@/sections/Today"),
  finance: () => import("@/sections/Finance"),
  habits: () => import("@/sections/Habits"),
  studies: () => import("@/sections/Studies"),
  services: () => import("@/sections/Services"),
  lists: () => import("@/sections/Lists"),
  music: () => import("@/sections/Music"),
  gallery: () => import("@/sections/Gallery"),
  discord: () => import("@/sections/WebApp").then((m) => ({ default: m.DiscordView })),
  ifood: () => import("@/sections/WebApp").then((m) => ({ default: m.IfoodView })),
  whatsapp: () => import("@/sections/WebApp").then((m) => ({ default: m.WhatsappView })),
  settings: () => import("@/sections/SettingsView"),
}
const VIEWS = Object.fromEntries(Object.entries(LOADERS).map(([k, f]) => [k, lazy(f)])) as unknown as Record<keyof typeof LOADERS, React.LazyExoticComponent<() => React.JSX.Element>>

/** Carrega o código de todas as abas logo depois da abertura: clicar abre na hora, sem "Carregando…". */
export function preloadSections() {
  const all = Object.values(LOADERS)
  const next = () => {
    const f = all.shift()
    if (!f) return
    f().finally(() => requestIdleCallback(next, { timeout: 800 }))
  }
  next()
}

export function AppWindow({ win }: { win: WinState }) {
  const patch = useStore((s) => s.patchWindow)
  const close = useStore((s) => s.closeWindow)
  const focus = useStore((s) => s.focusWindow)
  const tb = useStore((s) => s.settings.taskbar)
  const view = useViewport()
  const theme = useStore((s) => s.settings.theme)
  const meta = SECTIONS.find((s) => s.id === win.id)!
  const View = VIEWS[win.id]
  const ref = useRef<HTMLDivElement>(null)

  const reserve = tb.autoHide ? 0 : tb.size + 28
  const area = {
    x: tb.position === "left" ? reserve : 0,
    y: tb.position === "top" ? reserve : 0,
    w: view.w - (tb.position === "left" || tb.position === "right" ? reserve : 0),
    h: view.h - (tb.position === "top" || tb.position === "bottom" ? reserve : 0),
  }
  // janela sempre dentro da área visível (ex.: ao passar para o monitor em pé)
  const g = win.maximized
    ? { x: area.x + 8, y: area.y + 8, w: area.w - 16, h: area.h - 16 }
    : (() => {
        const w = Math.min(win.w, area.w - 16)
        const h = Math.min(win.h, area.h - 16)
        return { w, h, x: Math.max(area.x + 8, Math.min(win.x, area.x + area.w - w - 8)), y: Math.max(area.y + 8, Math.min(win.y, area.y + area.h - h - 8)) }
      })()

  const drag = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (e.button !== 0 || (mode === "move" && (e.target as Element).closest("button"))) return
    if (win.maximized && mode === "move") return
    e.preventDefault()
    focus(win.id)
    const sx = e.clientX, sy = e.clientY
    const b = { x: g.x, y: g.y, w: g.w, h: g.h }
    const el = ref.current!
    let last = b
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      last =
        mode === "move"
          ? { ...b, x: Math.max(-b.w + 120, Math.min(view.w - 120, b.x + dx)), y: Math.max(0, Math.min(view.h - 60, b.y + dy)) }
          : { ...b, w: Math.max(Math.min(520, view.w - 16), Math.min(view.w - b.x - 8, b.w + dx)), h: Math.max(360, Math.min(view.h - b.y - 8, b.h + dy)) }
      el.style.left = last.x + "px"
      el.style.top = last.y + "px"
      el.style.width = last.w + "px"
      el.style.height = last.h + "px"
    }
    const up = () => {
      window.removeEventListener("pointermove", mv)
      window.removeEventListener("pointerup", up)
      patch(win.id, last)
    }
    window.addEventListener("pointermove", mv)
    window.addEventListener("pointerup", up)
  }

  const minimizedTarget = tb.position === "bottom" ? { y: 300 } : tb.position === "top" ? { y: -300 } : tb.position === "left" ? { x: -300 } : { x: 300 }

  return (
    <motion.div
      ref={ref}
      className="absolute"
      style={{ left: g.x, top: g.y, width: g.w, height: g.h, zIndex: win.z, pointerEvents: win.minimized ? "none" : "auto" }}
      // abertura curta e opaca: a opacidade chega a 100% em 0,12s (antes uma mola longa deixava a janela "meio transparente")
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={win.minimized ? { opacity: 0, scale: 0.4, ...minimizedTarget } : { opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.14, ease: "easeIn" } }}
      transition={{
        default: { type: "spring", stiffness: 520, damping: 38, mass: 0.7 },
        opacity: { duration: win.minimized ? 0.18 : 0.12, ease: "easeOut" },
      }}
      onPointerDown={() => focus(win.id)}
    >
      <div className="surface flex h-full w-full flex-col overflow-hidden">
        <div className="titlebar flex shrink-0 items-center gap-3 px-4 py-2.5" onPointerDown={(e) => drag(e, "move")} onDoubleClick={() => patch(win.id, { maximized: !win.maximized })}>
          <AppIcon id={win.id} size={22} />
          <div className={cn("font-display flex-1 font-semibold", theme === "retro" && "text-sm")}>{meta.label}</div>
          <div className="-my-1 flex gap-1.5">
            <button className="win-btn" title="Minimizar" onClick={() => patch(win.id, { minimized: true })}><Minus size={15} strokeWidth={2.4} /></button>
            <button className="win-btn" title={win.maximized ? "Restaurar" : "Maximizar"} onClick={() => patch(win.id, { maximized: !win.maximized })}>
              {win.maximized ? <Copy size={13} strokeWidth={2.2} /> : <Square size={13} strokeWidth={2.2} />}
            </button>
            <button className="win-btn win-btn-close" title="Fechar" onClick={() => close(win.id)}><X size={16} strokeWidth={2.4} /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <ErrorBoundary label={meta.label}>
            <Suspense fallback={null}>
              <View />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      {!win.maximized && <div className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize" onPointerDown={(e) => drag(e, "resize")} />}
    </motion.div>
  )
}
