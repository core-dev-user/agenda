import { useEffect, useState, type ReactNode } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, Image, Lock, LockOpen, Settings } from "lucide-react"
import { useStore } from "@/lib/store"
import { bridge, mediaUrl } from "@/lib/bridge"
import type { MediaItem } from "@/lib/types"
import { importDropped, pasteImages } from "@/components/MediaPicker"
import { fontFamily, ensureFont } from "@/lib/fonts"
import { cn, todayISO } from "@/lib/utils"
import type { SectionId, WidgetType } from "@/lib/types"
import type { BarSync } from "@/lib/bridge"
import { SECTIONS } from "@/components/sections-meta"
import { Splash } from "@/components/Splash"
import { AutoStylePrompt } from "@/components/AutoStylePrompt"
import { Wallpaper, Overlays, GRADIENTS } from "@/components/Wallpaper"
import { CursorLayer } from "@/components/CursorLayer"
import { Taskbar, WidgetMenu } from "@/components/Taskbar"
import { CarbonoChrome, CarbonoPanels, useCarbonoVars } from "@/shell/Carbono"
import { useIsImmersive } from "@/lib/immersive"
import { shellPrefs, useShell } from "@/shell/pack"
import { NotificationPanel } from "@/components/NotificationCenter"
import { useScreenList, useActiveScreen, setActiveScreen } from "@/lib/screens"
import type { ScreenRect } from "@/lib/bridge"
import { create } from "zustand"
import { AppWindow, preloadSections } from "@/components/AppWindow"
import { WidgetFrame, WIDGET_CATS, WIDGET_CHOICES, hoveredWidget, type WidgetCat } from "@/widgets/WidgetFrame"
import { useHistory } from "@/lib/history"
import { copyWidget, pasteWidget, widgetClip } from "@/lib/widgetClip"
import { toast } from "@/lib/toast"
import { queueShareLink } from "@/lib/templateShare"
import { useBackground } from "@/lib/watchers"
import { usePerf } from "@/lib/perf"
import { performanceBudget } from "@/lib/perf-policy"
import { CommandPalette } from "@/components/CommandPalette"
import { Assistant, openAssistant, useAssistant } from "@/components/Assistant"
import { FocusBar, useFocusActive } from "@/components/FocusBar"
import { DEFAULT_FOCUS } from "@/lib/store"
import { useUiMode } from "@/lib/uimode"
import { Pet, PET_DEFAULT } from "@/pet/Pet"
import { UpdatePrompt } from "@/components/Updates"
import { PawPrint } from "lucide-react"

/**
 * Um monitor dentro da página: o que estiver aqui dentro com "fixed" fica preso a ele
 * (o transform faz deste quadro a referência dos elementos fixos). Só os filhos recebem cliques.
 */
function ScreenFrame({ sc, children }: { sc: ScreenRect; children: ReactNode }) {
  return (
    <div className="screen-frame fixed" style={{ left: sc.x, top: sc.y, width: sc.w, height: sc.h, transform: "translateZ(0)" }}>
      {children}
    </div>
  )
}

/** painéis pedidos pela barra do PC: adicionar widget e avisos */
export const useBarPanels = create<{ panel: "" | "widgets" | "bell" }>(() => ({ panel: "" }))
function BarPanels() {
  const panel = useBarPanels((s) => s.panel)
  const readAll = useStore((x) => x.markNotificationsRead)
  const close = () => { if (panel === "bell") readAll(); useBarPanels.setState({ panel: "" }) }
  return (
    <AnimatePresence>
      {panel && (
        <>
          <div className="fixed inset-0 z-[790]" onPointerDown={close} />
          <motion.div
            data-modal
            className={cn("surface fixed bottom-6 left-1/2 z-[810] max-h-[calc(100%-48px)] -translate-x-1/2 overflow-y-auto p-4", panel === "widgets" ? "w-[min(640px,calc(100%-32px))]" : "w-[360px]")}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            {panel === "widgets" ? <WidgetMenu close={close} /> : <NotificationPanel close={close} />}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** O middleware persist grava nas alterações reais; não force setState({}) a cada 20s. */
export function useAutosave() {
  useEffect(() => {
    const flush = () => { void bridge.store.flush?.() }
    window.addEventListener("beforeunload", flush)
    document.addEventListener("visibilitychange", flush)
    return () => {
      window.removeEventListener("beforeunload", flush)
      document.removeEventListener("visibilitychange", flush)
    }
  }, [])
}

/** modo área de trabalho: com alguma aba aberta o Agenda vem para a frente; sem nenhuma, volta para o fundo */
function useDesktopLayer() {
  useEffect(() => {
    if (useUiMode.getState().mode !== "desktop") return
    let up = false
    const sync = () => {
      const s = useStore.getState()
      const sh = useShell.getState()
      const want = s.windows.some((w) => !w.minimized) || s.paletteOpen || useAssistant.getState().open || !!useBarPanels.getState().panel || sh.dash || sh.power
      if (want !== up) { up = want; bridge.mode.raise(want) }
    }
    const off = useStore.subscribe(sync)
    const offA = useAssistant.subscribe(sync)
    const offP = useBarPanels.subscribe(sync)
    const offS = useShell.subscribe(sync)
    // atalho global / bandeja: abre a busca rápida por cima de tudo
    const off2 = bridge.mode.onSummon(() => useStore.setState({ paletteOpen: true }))
    sync()
    return () => { off(); offA(); offP(); offS(); off2() }
  }, [])
}

/** barra principal do Windows (janela separada): manda aparência/fixados/avisos e atende os pedidos dela */
function useMainBar() {
  useEffect(() => {
    if (!useUiMode.getState().mainBar) return
    let last = ""
    const send = () => {
      const s = useStore.getState()
      const st = document.documentElement.style
      const vars: Record<string, string> = {}
      for (let i = 0; i < st.length; i++) if (st[i].startsWith("--")) vars[st[i]] = st.getPropertyValue(st[i])
      const data: BarSync = {
        pack: s.settings.shell?.pack ?? "none",
        vars, theme: s.settings.theme, dark: s.settings.dark, fontScale: s.settings.fontScale,
        style: s.settings.taskbar.style, showLabels: s.settings.taskbar.showLabels,
        pins: s.settings.pcPins ?? [], unread: s.notifications.filter((n) => !n.read).length,
        sections: SECTIONS.map((x) => ({ id: x.id, label: x.label, color: x.color })),
        wall: wallCss(s.settings.wallpaper),
        tb: s.settings.taskbar,
        locked: s.settings.widgetsLocked,
        icons: { iconStyle: s.settings.iconStyle, theme: s.settings.theme, iconShape: s.settings.iconShape, iconColors: s.settings.iconColors as Record<string, string> | undefined, iconPackStyle: s.settings.iconPackStyle ?? "original" },
        secs: (() => {
          const top = [...s.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
          return s.windows.map((w) => ({ id: w.id, min: w.minimized, top: top?.id === w.id }))
        })(),
      }
      const j = JSON.stringify(data)
      if (j !== last) { last = j; bridge.bar.sync(data) }
    }
    const t = setTimeout(send, 300)
    let pending: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (pending) return
      pending = setTimeout(() => { pending = null; send() }, 90)
    }
    // A barra só depende destas 3 partes do estado. Não reagir a relógios,
    // status de jogos, downloads ou outros widgets sem relação com ela.
    const off = useStore.subscribe((s, old) => {
      if (s.settings !== old.settings || s.windows !== old.windows || s.notifications !== old.notifications) schedule()
    })
    const off2 = bridge.bar.onMain((m) => {
      const s = useStore.getState()
      // pedido de uma barra: abre no monitor dela
      const from = (m as { screen?: number }).screen
      if (typeof from === "number") setActiveScreen(from)
      if (m.type === "shell-failed") { useUiMode.setState({ mainBar: false }); return }
      if (m.type === "open") s.openWindow(m.id as SectionId)
      else if (m.type === "section") {
        // como na barra do Agenda: clicar na aba que está na frente minimiza; senão abre/traz
        const id = m.id as SectionId
        const top = [...s.windows].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
        if (top?.id === id) s.patchWindow(id, { minimized: true })
        else s.openWindow(id)
      }
      else if (m.type === "lock") s.setSettings({ widgetsLocked: !s.settings.widgetsLocked })
      else if (m.type === "widgets") useBarPanels.setState({ panel: "widgets" })
      else if (m.type === "palette") useStore.setState({ paletteOpen: true })
      else if (m.type === "bell") useBarPanels.setState({ panel: "bell" })
      else if (m.type === "assistant") openAssistant()
      else if (m.type === "pin") { const pins = s.settings.pcPins ?? []; if (!pins.some((p) => p.path.toLowerCase() === m.app.path.toLowerCase())) s.setSettings({ pcPins: [...pins, m.app] }) }
      else if (m.type === "unpin") s.setSettings({ pcPins: (s.settings.pcPins ?? []).filter((p) => p.path.toLowerCase() !== m.path.toLowerCase()) })
    })
    return () => { clearTimeout(t); if (pending) clearTimeout(pending); off(); off2() }
  }, [])
}

/** papel de parede como CSS (o fundo dos outros monitores desenha igual) */
function wallCss(wp: ReturnType<typeof useStore.getState>["settings"]["wallpaper"]) {
  const bg =
    wp.type === "engine" ? "transparent"
    : wp.type === "image" && wp.image ? `center / cover no-repeat url("${mediaUrl(wp.image)}")`
    : wp.type === "color" ? wp.color
    : (GRADIENTS[wp.gradient] ?? GRADIENTS.dusk).css
  const filter = [wp.blur ? `blur(${wp.blur}px)` : "", wp.dim ? `brightness(${1 - wp.dim})` : ""].filter(Boolean).join(" ")
  return { bg, filter: filter || undefined }
}

export function useThemeVars() {
  const s = useStore((x) => x.settings)
  const mode = useUiMode((x) => x.mode)
  useEffect(() => {
    const r = document.documentElement
    r.dataset.theme = s.theme
    // Native desktop is transparent only when an external wallpaper is selected.
    r.dataset.wallpaperEngine = String(mode === "desktop" && (s.wallpaper.type === "engine" || Object.values(s.wallpaperBy ?? {}).some((v) => v.type === "engine")))
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
    for (const id of [s.uiFont, s.numFont, s.displayFont]) void ensureFont(id)
    set("--tb-size", s.taskbar.size + "px")
    r.style.fontSize = 16 * s.fontScale + "px"
  }, [s, mode])
}

export default function App() {
  useThemeVars()
  useEffect(() => {
    const accept = (link: string) => {
      queueShareLink(link)
      useStore.getState().openWindow("settings")
    }
    const off = bridge.templates.onLink(accept)
    void bridge.templates.take().then((value) => { if (value) accept(value) }).catch(() => {})
    return off
  }, [])
  const musicAuto = useStore((s) => s.settings.musicAutostart)
  useEffect(() => { if (musicAuto) bridge.music.open() }, [])
  useEffect(() => {
    const profile = performanceBudget(useStore.getState().settings, useStore.getState().gamesRunning.length > 0)
    if (profile.preload === "none") return
    let canceled = false
    let pendingIdle = 0
    const start = () => {
      if (canceled || document.hidden) return
      pendingIdle = requestIdleCallback(() => { if (!canceled) preloadSections(profile.preload) }, { timeout: 3500 })
      document.removeEventListener("visibilitychange", start)
    }
    const delay = useStore.getState().settings.perfPreset === "quality" ? 600 : 12000
    const timer = setTimeout(() => { document.addEventListener("visibilitychange", start); start() }, delay)
    return () => {
      canceled = true
      clearTimeout(timer)
      cancelIdleCallback(pendingIdle)
      document.removeEventListener("visibilitychange", start)
    }
  }, [])
  // avisos, agendas, foco, hibernação: tudo em segundo plano
  useBackground()
  usePerf()
  // tela "Hoje" ao abrir
  useEffect(() => { if (useStore.getState().settings.todayOnStart) setTimeout(() => useStore.getState().openWindow("today"), 900) }, [])
  useAutosave()
  useDesktopLayer()
  useMainBar()
  const mainBar = useUiMode((s) => s.mainBar)
  // pacote de interface (Carbono): troca a barra, a busca e ganha o painel de cima
  const shell = shellPrefs(useStore((s) => s.settings))
  const packed = shell.pack === "carbono"
  const immersive = useIsImmersive()
  useCarbonoVars(packed, shell)
  useDesktopDrop()
  useHistory()
  useAppWidgets()
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
  const screens = useScreenList()
  const active = useActiveScreen()
  const home = screens.find((x) => x.home) ?? screens[0]

  return (
    <div className="fixed inset-0 overflow-hidden" onContextMenu={(e) => { e.preventDefault(); if ((e.target as Element).closest("[data-desktop]")) setCtx({ x: e.clientX, y: e.clientY }) }}>
      {/* papel de parede desenhado em cada monitor (não esticado entre eles) */}
      {screens.map((sc) => (
        <div key={sc.id} className="absolute overflow-hidden" style={sc.full ? { left: sc.full.x, top: sc.full.y, width: sc.full.w, height: sc.full.h } : { left: sc.x, top: sc.y, width: sc.w, height: sc.h }}>
          <Wallpaper screenId={screens.length > 1 ? sc.id : undefined} />
        </div>
      ))}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={showSplash ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="absolute inset-0" data-desktop onPointerDown={() => setCtx(null)}>
          <AnimatePresence>{widgets.map((w) => <WidgetFrame key={w.id} w={w} />)}</AnimatePresence>
          {!showSplash && <Pet />}
        </div>
        <AnimatePresence>{windows.map((w) => <AppWindow key={w.id} win={w} />)}</AnimatePresence>
        {/* transmissão expandida ou vídeo em tela cheia: a barra (e a moldura do Carbono) saem da frente */}
        {!mainBar && !immersive && <ScreenFrame sc={home}>{packed ? <CarbonoChrome /> : <Taskbar />}</ScreenFrame>}
        <AnimatePresence>{ctx && <DesktopMenu at={ctx} close={() => setCtx(null)} />}</AnimatePresence>
      </motion.div>
      {/* busca, assistente e avisos abrem no monitor onde você está mexendo */}
      <ScreenFrame sc={active}>
        <FocusBar />
        <CommandPalette />
        {packed && <CarbonoPanels />}
        <Assistant />
        <AutoStylePrompt />
        <BarPanels />
        <AnimatePresence>{showSplash && <Splash />}</AnimatePresence>
        <Toast />
        <UpdatePrompt />
      </ScreenFrame>
      <Overlays />
      <CursorLayer />
    </div>
  )
}

/** aviso curtinho no rodapé ("Desfeito", "Configuração copiada") */
export function Toast() {
  const [t, setT] = useState<{ text: string; k: number } | null>(null)
  useEffect(() => {
    let k = 0
    let id: ReturnType<typeof setTimeout>
    const on = (e: Event) => {
      setT({ text: String((e as CustomEvent).detail), k: ++k })
      clearTimeout(id)
      id = setTimeout(() => setT(null), 1400)
    }
    window.addEventListener("agenda:toast", on)
    return () => { clearTimeout(id); window.removeEventListener("agenda:toast", on) }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tb-size)+28px)] z-[6000] flex justify-center">
      <AnimatePresence>
        {t && (
          <motion.div
            key={t.k}
            className="surface !rounded-full px-4 py-1.5 text-sm"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
          >
            {t.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** abrir a aba de um app (Discord, WhatsApp, iFood, YouTube Music) já coloca o widget dele na tela */
const APP_WIDGET: Partial<Record<string, WidgetType>> = { discord: "discord", whatsapp: "whatsapp", ifood: "ifood", music: "music" }
function useAppWidgets() {
  useEffect(() =>
    useStore.subscribe((s, prev) => {
      if (s.windows === prev.windows) return
      for (const win of s.windows) {
        const type = APP_WIDGET[win.id]
        if (!type || prev.windows.some((p) => p.id === win.id)) continue
        const ex = s.widgets.find((w) => w.type === type)
        if (!ex) s.addWidget(type)
        else if (ex.config.rest) s.updateWidgetConfig(ex.id, { rest: false })
      }
    }), [])
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
      if (!(e.ctrlKey || e.metaKey) || typing(e.target) || busy()) return
      const k = e.key.toLowerCase()
      // com o mouse em cima de um widget: Ctrl+C copia a configuração dele, Ctrl+V cola
      const hw = hoveredWidget ? useStore.getState().widgets.find((w) => w.id === hoveredWidget) : undefined
      if (k === "c" && hw && !window.getSelection()?.toString()) {
        copyWidget(hw)
        toast("Configuração copiada")
        return
      }
      if (k !== "v") return
      e.preventDefault()
      if (hw && widgetClip()) {
        const r = pasteWidget(hw.id)
        if (r) toast(r === "tudo" ? "Configuração colada" : "Aparência colada (widget de outro tipo)")
        return
      }
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
  const [sub, setSub] = useState<WidgetCat | null>(null)
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]"
  const left = Math.min(at.x, innerWidth - 240)
  const top = Math.max(8, Math.min(at.y, innerHeight - 420))
  const subItems = sub ? WIDGET_CHOICES.filter((c) => c.cat === sub) : []
  const subLeft = left + 224 + 4 + 260 > innerWidth ? left - 264 : left + 228
  return (
    <>
      <div className="fixed inset-0 z-[900]" onPointerDown={close} />
      {sub && (
        <div
          data-modal
          key={sub}
          className="surface fixed z-[902] max-h-[calc(100vh-16px)] w-[260px] overflow-y-auto p-1.5"
          style={{ left: subLeft, top: Math.max(8, Math.min(top, innerHeight - 16 - subItems.length * 34 - 12)) }}
        >
          {subItems.map((c) => (
            <button key={c.label} className={item} onClick={() => { add(c.type, c.config); close() }}><c.icon size={15} className="shrink-0" style={{ color: c.color }} /> <span className="truncate">{c.label}</span></button>
          ))}
        </div>
      )}
      <motion.div
        data-modal
        className="surface fixed z-[901] max-h-[calc(100vh-16px)] w-56 overflow-y-auto p-1.5"
        style={{ left, top, transformOrigin: "top left" }}
        initial={{ opacity: 0, scale: 0.9, rotateX: 15 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        <div className="px-3 py-1 text-xs text-fg-muted uppercase">Adicionar widget</div>
        {WIDGET_CATS.map((k) => (
          <div key={k.id} className="relative" onPointerEnter={() => setSub(k.id)}>
            <button className={cn(item, sub === k.id && "bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]")} onClick={() => setSub(k.id)}>
              <k.icon size={15} className="shrink-0 text-fg-muted" /> <span className="flex-1 truncate">{k.label}</span> <ChevronRight size={13} className="text-fg-muted" />
            </button>
          </div>
        ))}
        <div className="my-1 h-px bg-line" />
        <button className={item} onClick={() => { setSettings({ widgetsLocked: !s.widgetsLocked }); close() }}>{s.widgetsLocked ? <><LockOpen size={15} className="text-fg-muted" /> Destravar widgets</> : <><Lock size={15} className="text-fg-muted" /> Travar widgets</>}</button>
        <button className={item} onClick={() => { setSettings({ pet: { ...PET_DEFAULT, ...s.pet, on: !(s.pet?.on ?? PET_DEFAULT.on) } }); close() }}><PawPrint size={15} className="text-fg-muted" /> {(s.pet?.on ?? PET_DEFAULT.on) ? "Guardar o bichinho" : "Chamar o bichinho"}</button>
        <button className={item} onClick={() => { open("gallery"); close() }}><Image size={15} className="text-fg-muted" /> Trocar papel de parede</button>
        <button className={cn(item)} onClick={() => { open("settings"); close() }}><Settings size={15} className="text-fg-muted" /> Configurações</button>
      </motion.div>
    </>
  )
}
