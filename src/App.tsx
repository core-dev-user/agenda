import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Image, Lock, LockOpen, Settings } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { importDropped, pasteImages } from "@/components/MediaPicker"
import { fontFamily } from "@/lib/fonts"
import { cn, todayISO } from "@/lib/utils"
import type { WidgetType } from "@/lib/types"
import { Splash } from "@/components/Splash"
import { AutoStylePrompt } from "@/components/AutoStylePrompt"
import { Wallpaper, Overlays } from "@/components/Wallpaper"
import { CursorLayer } from "@/components/CursorLayer"
import { Taskbar } from "@/components/Taskbar"
import { AppWindow, preloadSections } from "@/components/AppWindow"
import { WidgetFrame, WIDGET_CHOICES } from "@/widgets/WidgetFrame"
import { useBackground } from "@/lib/watchers"
import { usePerf } from "@/lib/perf"
import { CommandPalette } from "@/components/CommandPalette"
import { FocusBar, useFocusActive } from "@/components/FocusBar"
import { DEFAULT_FOCUS } from "@/lib/store"

function useThemeVars() {
  const s = useStore((x) => x.settings)
  useEffect(() => {
    const r = document.documentElement
    r.dataset.theme = s.theme
    r.classList.toggle("dark", s.dark)
    r.classList.toggle("no-anim", !s.animations)
    const set = (k: string, v: string) => r.style.setProperty(k, v)
    set("--accent", s.accent)
    set("--r", s.radius + "px")
    set("--blur", s.blur + "px")
    set("--sa", String(s.surfaceOpacity))
    set("--font-ui", fontFamily(s.uiFont))
    set("--font-num", fontFamily(s.numFont))
    set("--font-display", fontFamily(s.displayFont))
    set("--tb-size", s.taskbar.size + "px")
    r.style.fontSize = 16 * s.fontScale + "px"
  }, [s])
}

export default function App() {
  useThemeVars()
  const musicAuto = useStore((s) => s.settings.musicAutostart)
  useEffect(() => { if (musicAuto) bridge.music.open() }, [])
  useEffect(() => { const t = setTimeout(preloadSections, 600); return () => clearTimeout(t) }, [])
  // avisos, agendas, foco, hibernação: tudo em segundo plano
  useBackground()
  usePerf()
  // tela "Hoje" ao abrir
  useEffect(() => { if (useStore.getState().settings.todayOnStart) setTimeout(() => useStore.getState().openWindow("today"), 900) }, [])
  // salvamento automático extra: regrava a cada 20 s e garante a gravação ao fechar a janela
  useEffect(() => {
    const save = () => useStore.setState({})
    const id = setInterval(save, 20000)
    const bye = () => { save(); bridge.store.flush?.() }
    window.addEventListener("beforeunload", bye)
    return () => { clearInterval(id); window.removeEventListener("beforeunload", bye) }
  }, [])
  useDesktopDrop()
  useEffect(() => {
    // liga versões ampliadas antigas à original (para o comparador antes/depois)
    const { media } = useStore.getState()
    const fixed = media.map((m) => {
      if (!m.upscaled || m.sourceId) return m
      const base = m.file.replace(/-(8k|4k|hd)(-[a-z0-9]+)?\.[^.]+$/, "")
      const src = media.find((x) => x.id !== m.id && x.file.replace(/\.[^.]+$/, "") === base)
      return src ? { ...m, sourceId: src.id } : m
    })
    if (fixed.some((m, i) => m !== media[i])) useStore.setState({ media: fixed })
  }, [])
  const splashOn = useStore((s) => s.settings.sakura.splash)
  const splashDone = useStore((s) => s.splashDone)
  const allWidgets = useStore((s) => s.widgets)
  // modo foco com "só o essencial": esconde os widgets que distraem
  const focusOn = useFocusActive()
  const hideInFocus = useStore((s) => s.settings.focus?.hideWidgets ?? DEFAULT_FOCUS.hideWidgets)
  const widgets = focusOn && hideInFocus ? allWidgets.filter((w) => ["clock", "stopwatch", "music", "lyrics", "tasks", "calendar", "agenda", "note"].includes(w.type)) : allWidgets
  const windows = useStore((s) => s.windows)
  const showSplash = splashOn && !splashDone
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)

  return (
    <div className="fixed inset-0 overflow-hidden" onContextMenu={(e) => { e.preventDefault(); if ((e.target as Element).closest("[data-desktop]")) setCtx({ x: e.clientX, y: e.clientY }) }}>
      <Wallpaper />
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={showSplash ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="absolute inset-0" data-desktop onPointerDown={() => setCtx(null)}>
          <AnimatePresence>{widgets.map((w) => <WidgetFrame key={w.id} w={w} />)}</AnimatePresence>
        </div>
        <AnimatePresence>{windows.map((w) => <AppWindow key={w.id} win={w} />)}</AnimatePresence>
        <Taskbar />
        <AnimatePresence>{ctx && <DesktopMenu at={ctx} close={() => setCtx(null)} />}</AnimatePresence>
      </motion.div>
      <FocusBar />
      <CommandPalette />
      <AutoStylePrompt />
      <Overlays />
      <AnimatePresence>{showSplash && <Splash />}</AnimatePresence>
      <CursorLayer />
    </div>
  )
}

/** Colar (Ctrl+V) ou soltar imagens na área de trabalho cria um quadro de fotos. */
function useDesktopDrop() {
  useEffect(() => {
    const busy = () => !!document.querySelector("[data-modal]") || useStore.getState().windows.some((w) => w.id === "gallery" && !w.minimized)
    const typing = (t: EventTarget | null) => !!(t as Element | null)?.closest?.("input,textarea,[contenteditable=true]")
    const place = (items: MediaItem[], x?: number, y?: number) => {
      if (!items.length) return
      const s = useStore.getState()
      s.addWidget("photo", { ids: items.map((m) => m.id) })
      if (x != null && y != null) {
        const w = useStore.getState().widgets.at(-1)!
        s.setWidgetGeo(w.id, { x: x - w.w / 2, y: y - w.h / 2, w: w.w, h: w.h })
      }
    }
    const key = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "v" || typing(e.target) || busy()) return
      e.preventDefault()
      place(await pasteImages())
    }
    const over = (e: DragEvent) => { if (!busy() && e.dataTransfer?.types.includes("Files")) e.preventDefault() }
    const drop = async (e: DragEvent) => {
      if (busy() || !e.dataTransfer?.files.length) return
      e.preventDefault()
      place(await importDropped(e.dataTransfer.files), e.clientX, e.clientY)
    }
    window.addEventListener("keydown", key)
    window.addEventListener("dragover", over)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("keydown", key)
      window.removeEventListener("dragover", over)
      window.removeEventListener("drop", drop)
    }
  }, [])
}

function DesktopMenu({ at, close }: { at: { x: number; y: number }; close: () => void }) {
  const add = useStore((s) => s.addWidget)
  const open = useStore((s) => s.openWindow)
  const s = useStore((x) => x.settings)
  const setSettings = useStore((x) => x.setSettings)
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
  return (
    <>
      <div className="fixed inset-0 z-[900]" onPointerDown={close} />
      <motion.div
        data-modal
        className="surface fixed z-[901] max-h-[calc(100vh-16px)] w-56 overflow-y-auto p-1.5"
        style={{ left: Math.min(at.x, innerWidth - 240), top: Math.max(8, Math.min(at.y, innerHeight - 560)), transformOrigin: "top left" }}
        initial={{ opacity: 0, scale: 0.9, rotateX: 15 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        <div className="px-3 py-1 text-xs text-fg-muted uppercase">Adicionar widget</div>
        {WIDGET_CHOICES.filter((c) => c.group === "widget").map((c) => (
          <button key={c.label} className={item} onClick={() => { add(c.type, c.config); close() }}><c.icon size={15} className="shrink-0 text-fg-muted" /> <span className="truncate">{c.label}</span></button>
        ))}
        <div className="px-3 pt-2 pb-1 text-xs text-fg-muted uppercase">Atalho de aba</div>
        {WIDGET_CHOICES.filter((c) => c.group === "atalho").map((c) => (
          <button key={c.label} className={item} onClick={() => { add(c.type, c.config); close() }}><c.icon size={15} className="shrink-0 text-fg-muted" /> <span className="truncate">{c.label}</span></button>
        ))}
        <div className="my-1 h-px bg-line" />
        <button className={item} onClick={() => { setSettings({ widgetsLocked: !s.widgetsLocked }); close() }}>{s.widgetsLocked ? <><LockOpen size={15} className="text-fg-muted" /> Destravar widgets</> : <><Lock size={15} className="text-fg-muted" /> Travar widgets</>}</button>
        <button className={item} onClick={() => { open("gallery"); close() }}><Image size={15} className="text-fg-muted" /> Trocar papel de parede</button>
        <button className={cn(item)} onClick={() => { open("settings"); close() }}><Settings size={15} className="text-fg-muted" /> Configurações</button>
      </motion.div>
    </>
  )
}
