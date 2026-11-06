import { Suspense, useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Copy, Minus, Search, Square, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import { cn } from "@/lib/utils"
import type { SectionId } from "@/lib/types"
import { useBackground } from "@/lib/watchers"
import { usePerf } from "@/lib/perf"
import { useHistory } from "@/lib/history"
import { Toast, useAutosave, useThemeVars } from "@/App"
import { Wallpaper } from "./Wallpaper"
import { SECTIONS } from "./sections-meta"
import { AppIcon } from "./AppIcon"
import { Logo } from "./Logo"
import { VIEWS, preloadSections } from "./AppWindow"
import { ErrorBoundary } from "./ErrorBoundary"
import { CommandPalette } from "./CommandPalette"
import { BellIcon, NotificationPanel } from "./NotificationCenter"

const drag = { WebkitAppRegion: "drag" } as React.CSSProperties
const noDrag = { WebkitAppRegion: "no-drag" } as React.CSSProperties

/**
 * Modo "Aplicativo": uma janela comum com as abas na lateral.
 * Sem widgets nem área de trabalho — abre e fecha como qualquer programa.
 */
export default function AppShell() {
  useThemeVars()
  useBackground()
  usePerf()
  useHistory()
  useAutosave()
  useEffect(() => { const t = setTimeout(preloadSections, 600); return () => clearTimeout(t) }, [])
  const windows = useStore((s) => s.windows)
  const open = useStore((s) => s.openWindow)
  // a aba mostrada é a última aberta (a busca rápida e os avisos também abrem abas por aqui)
  const top = windows.reduce<(typeof windows)[number] | null>((a, w) => (!a || w.z > a.z ? w : a), null)
  const active: SectionId = top?.id ?? "today"
  useEffect(() => { if (!windows.length) open("today") }, [windows.length])
  const [maxed, setMaxed] = useState(false)
  useEffect(() => bridge.win.onState((s) => setMaxed(s.maximized)), [])
  const [bell, setBell] = useState(false)
  const meta = SECTIONS.find((s) => s.id === active)!
  const View = VIEWS[active]

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <Wallpaper />
      <aside className="surface relative z-10 m-2 mr-0 flex w-[208px] shrink-0 flex-col !rounded-[calc(var(--r)*1.1)] p-2" style={drag}>
        <div className="flex items-center gap-2 px-2 pt-1 pb-3">
          <Logo size={28} />
          <div className="font-display text-lg font-semibold">Agenda</div>
        </div>
        <button
          style={noDrag}
          className="mb-2 flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left text-sm text-fg-muted hover:text-fg"
          onClick={() => useStore.setState({ paletteOpen: true })}
        >
          <Search size={14} /> Procurar <span className="ml-auto text-[10px]">Ctrl+K</span>
        </button>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto" style={noDrag}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => open(s.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_8%,transparent)]",
                active === s.id && "bg-[color-mix(in_srgb,var(--fg)_13%,transparent)] font-medium",
              )}
            >
              <AppIcon id={s.id} size={26} />
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 pr-1.5 pl-5" style={drag}>
          <div className="font-display flex-1 truncate text-base font-semibold">{meta.label}</div>
          <div className="relative" style={noDrag}>
            <button className="btn btn-ghost btn-icon" title="Avisos" onClick={() => setBell((v) => !v)}><BellIcon size={16} /></button>
            <AnimatePresence>
              {bell && (
                <>
                  <div className="fixed inset-0 z-[790]" onPointerDown={() => setBell(false)} />
                  <motion.div data-modal className="surface absolute top-10 right-0 z-[810] max-h-[70vh] w-[360px] overflow-y-auto p-4" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <NotificationPanel close={() => setBell(false)} />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="flex gap-1.5" style={noDrag}>
            <button className="win-btn" title="Minimizar" onClick={() => bridge.win.minimize()}><Minus size={15} strokeWidth={2.4} /></button>
            <button className="win-btn" title={maxed ? "Restaurar" : "Maximizar"} onClick={() => bridge.win.toggleMaximize()}>
              {maxed ? <Copy size={13} strokeWidth={2.2} /> : <Square size={13} strokeWidth={2.2} />}
            </button>
            <button className="win-btn win-btn-close" title="Fechar" onClick={() => bridge.win.close()}><X size={16} strokeWidth={2.4} /></button>
          </div>
        </header>
        <div className="surface m-2 mt-0 min-h-0 flex-1 overflow-auto">
          <ErrorBoundary key={active} label={meta.label}>
            <Suspense fallback={null}>
              <View />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
      <CommandPalette />
      <Toast />
    </div>
  )
}
