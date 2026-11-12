import { memo, useEffect, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import {
  CalendarClock, CalendarDays, Hourglass, ChartColumn, Clapperboard, Clock, CloudSun, Cpu, Crop, Crosshair, Gamepad2, GripHorizontal, Headphones, Image, ImagePlus, Images, Link,
  ClipboardPaste, Copy, ListChecks, MessageCircle, Mic, Moon, Move, Music, Sun, Newspaper, Settings2, StickyNote, Target, Timer, Trash2, Triangle, UtensilsCrossed, Volleyball, Wallet, Wand2, X,
  type LucideIcon,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { useTilt } from "@/lib/useTilt"
import { mediaUrl } from "@/lib/bridge"
import { fitGeo, useViewport, widgetGeo } from "@/lib/viewport"
import type { Geo, MediaItem, PhotoGallery, Widget, WidgetType } from "@/lib/types"
import { cn, uid } from "@/lib/utils"
import { copyWidget, pasteWidget, widgetClip } from "@/lib/widgetClip"
import { toast } from "@/lib/toast"
import { ensureFont, fontFamily } from "@/lib/fonts"
import { FontPicker } from "@/components/FontPicker"
import { ColorPicker, Modal, Segmented, Slider, Switch } from "@/components/ui/controls"
import { MediaPicker } from "@/components/MediaPicker"
import { DEFAULT_FRAME, frameImgStyle, ImageFramer, type Frame } from "@/components/ImageFramer"
import { PhotoEditor } from "@/components/PhotoEditor"
import { LivingStudio } from "@/components/LivingStudio"
import { ClockWidget, CLOCK_OPTS } from "./Clock"
import { StopwatchWidget } from "./Stopwatch"
import { WeatherWidget } from "./Weather"
import { NewsWidget, FEEDS } from "./News"
import { PhotoWidget, CalendarWidget, NoteWidget, PHOTO_FRAME_PAD } from "./Misc"
import { SectionWidget } from "./SectionWidget"
import { MusicWidget } from "./MusicWidget"
import { SportsWidget, SportsSettings } from "./Sports"
import { LyricsWidget } from "./LyricsWidget"
import { TasksWidget } from "./Tasks"
import { DiscordWidget } from "./Discord"
import { IfoodWidget } from "./Ifood"
import { WhatsappWidget } from "./Whatsapp"
import { FinanceWidget } from "./FinanceWidget"
import { AgendaWidget } from "./AgendaWidget"
import { MusicStatsWidget } from "./MusicStatsWidget"
import { GamingWidget } from "./GamingWidget"
import { MusicClipWidget } from "./MusicClipWidget"
import { ValAgentWidget, ValAgentSettings } from "./ValAgentWidget"
import { SysMonWidget, SysMonSettings } from "./SysMonWidget"
import { PcMusicWidget, PcMusicSettings } from "./PcMusicWidget"
import { CountdownWidget, CountdownSettings } from "./Countdown"
import { hoverClass, lookLimits, lookOfWidget, lookStyle, LookSettings } from "./widgetLook"
import { GlyphTile } from "@/components/Glyph"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { SECTIONS } from "@/components/sections-meta"

export const WIDGET_META: Record<WidgetType, { label: string; icon: LucideIcon; color: string }> = {
  clock: { label: "Relógio", icon: Clock, color: "#8f9bff" },
  stopwatch: { label: "Cronômetro / Timer", icon: Timer, color: "#ff9a3c" },
  weather: { label: "Clima", icon: CloudSun, color: "#5aa9ff" },
  news: { label: "Notícias", icon: Newspaper, color: "#9aa3b5" },
  photo: { label: "Quadro de fotos", icon: Image, color: "#ff8fb8" },
  calendar: { label: "Calendário", icon: CalendarDays, color: "#ff6b6b" },
  note: { label: "Nota", icon: StickyNote, color: "#ffc15e" },
  shortcut: { label: "Atalho de aba", icon: Link, color: "#a0a0b0" },
  music: { label: "Música (YouTube Music)", icon: Music, color: "#ff3b5c" },
  cs2: { label: "CS2 (jogos e resultados)", icon: Crosshair, color: "#de9b35" },
  valorant: { label: "Valorant (vlr.gg)", icon: Triangle, color: "#ff4655" },
  football: { label: "Futebol (placares ao vivo)", icon: Volleyball, color: "#2fbf71" },
  lyrics: { label: "Letra da música (sincronizada)", icon: Mic, color: "#c49bff" },
  tasks: { label: "Tarefas", icon: ListChecks, color: "#5ee3a1" },
  discord: { label: "Discord (call atual)", icon: Headphones, color: "#5865F2" },
  ifood: { label: "iFood (pedidos)", icon: UtensilsCrossed, color: "#EA1D2C" },
  whatsapp: { label: "WhatsApp (conversas)", icon: MessageCircle, color: "#25D366" },
  finance: { label: "Finanças (gastos do mês)", icon: Wallet, color: "#1baf7a" },
  agenda: { label: "Agenda do Google (próximos eventos)", icon: CalendarClock, color: "#4285f4" },
  musicstats: { label: "Música: o que mais ouço", icon: ChartColumn, color: "#ff5c7a" },
  gaming: { label: "Jogando agora", icon: Gamepad2, color: "#a78bfa" },
  musicclip: { label: "Clipe da música (YouTube Music)", icon: Clapperboard, color: "#ff3b5c" },
  valagent: { label: "Valorant: agente (templates)", icon: Target, color: "#ff4655" },
  sysmon: { label: "Desempenho do PC (CPU, GPU, RAM)", icon: Cpu, color: "#3ccfcf" },
  pcmusic: { label: "Spotify e música do PC", icon: Headphones, color: "#1db954" },
  countdown: { label: "Contagem regressiva (dias para…)", icon: Hourglass, color: "#ff8fb8" },
}

/** Tópicos do menu "Adicionar widget" (na ordem em que aparecem). */
export const WIDGET_CATS = [
  { id: "rotina", label: "Rotina", icon: ListChecks },
  { id: "info", label: "Notícias e clima", icon: CloudSun },
  { id: "musica", label: "Música", icon: Music },
  { id: "esportes", label: "Esportes", icon: Volleyball },
  { id: "esports", label: "E-sports e jogos", icon: Gamepad2 },
  { id: "apps", label: "Conversas e apps", icon: MessageCircle },
  { id: "fotos", label: "Fotos", icon: Image },
  { id: "pc", label: "Computador", icon: Cpu },
  { id: "abas", label: "Atalhos das abas", icon: Link },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]
export type WidgetCat = (typeof WIDGET_CATS)[number]["id"]

const CAT_OF: Record<Exclude<WidgetType, "shortcut">, WidgetCat> = {
  clock: "rotina", stopwatch: "rotina", countdown: "rotina", calendar: "rotina", agenda: "rotina", tasks: "rotina", note: "rotina", finance: "rotina",
  weather: "info", news: "info",
  music: "musica", pcmusic: "musica", musicclip: "musica", lyrics: "musica", musicstats: "musica",
  football: "esportes",
  cs2: "esports", valorant: "esports", valagent: "esports", gaming: "esports",
  discord: "apps", whatsapp: "apps", ifood: "apps",
  photo: "fotos",
  sysmon: "pc",
}

/** Opções do menu "Adicionar widget": widgets comuns + um atalho para cada aba. */
export const WIDGET_CHOICES: { type: WidgetType; config: Record<string, any>; label: string; icon: LucideIcon; color: string; group: "widget" | "atalho"; cat: WidgetCat }[] = [
  ...(Object.keys(WIDGET_META) as WidgetType[])
    .filter((t): t is Exclude<WidgetType, "shortcut"> => t !== "shortcut")
    .map((t) => ({ type: t, config: {}, label: WIDGET_META[t].label, icon: WIDGET_META[t].icon, color: WIDGET_META[t].color, group: "widget" as const, cat: CAT_OF[t] })),
  ...SECTIONS.filter((s) => !["settings", "music", "discord", "ifood", "whatsapp"].includes(s.id)).map((s) => ({
    type: "shortcut" as WidgetType,
    config: { section: s.id },
    label: s.label,
    icon: s.icon,
    color: s.color,
    group: "atalho" as const,
    cat: "abas" as const,
  })),
]

// Só campos de digitação bloqueiam o arrasto; botões e links funcionam: clique = clica, segurar e mover = arrasta.
const NO_DRAG = "input,textarea,select,[contenteditable=true],[data-nodrag]"
const DRAG_THRESHOLD = 5

type Mode = "move" | "se" | "e" | "s"

/** widget com o mouse em cima (para Ctrl+C / Ctrl+V da configuração) */
export let hoveredWidget: string | null = null

/** liga/desliga o modo descanso: o widget fica no lugar, mas sem conteúdo rodando (não gasta memória nem CPU) */
export const toggleRest = (id: string) => {
  const st = useStore.getState()
  const w = st.widgets.find((x) => x.id === id)
  if (!w) return
  st.updateWidgetConfig(id, { rest: !w.config.rest })
}

export const WidgetFrame = memo(function WidgetFrame({ w }: { w: Widget }) {
  const setGeo = useStore((s) => s.setWidgetGeo)
  const remove = useStore((s) => s.removeWidget)
  const front = useStore((s) => s.bringWidgetFront)
  const locked = useStore((s) => s.settings.widgetsLocked)
  const layoutRef = useStore((s) => s.settings.layoutRef)
  useEffect(() => {
    for (const id of [w.config.look?.font, w.config.font, w.config.lyFont]) {
      if (typeof id === "string") void ensureFont(id)
    }
  }, [w.config.look?.font, w.config.font, w.config.lyFont])
  const bgId: string | undefined = w.config.bg?.id
  // só a imagem de fundo deste widget (não re-desenha todos os widgets quando a galeria muda)
  const bgMedia = useStore((s) => (bgId ? s.media.find((m) => m.id === bgId) : undefined))
  const openWindow = useStore((s) => s.openWindow)
  const view = useViewport()
  const [pos, setPos] = useState<Geo | null>(null)
  const [dragging, setDragging] = useState<Mode | null>(null)
  const [cfgOpen, setCfgOpenRaw] = useState(false)
  // o painel de configurar só é montado depois de aberto uma vez
  const [cfgMounted, setCfgMounted] = useState(false)
  const setCfgOpen = (v: boolean) => { if (v) setCfgMounted(true); setCfgOpenRaw(v) }
  const resting = !!w.config.rest
  const [aspect, setAspect] = useState<number | null>(null)
  const inner = useRef<HTMLDivElement>(null)
  const look = lookOfWidget(w.config)
  const hov = look.hover ?? "theme"
  useTilt(inner, 1, !dragging && hov === "theme")

  // posição para a orientação atual (em pé/deitado), sempre dentro da tela
  const geo = widgetGeo(w, view, layoutRef)
  const autoFit = w.type === "photo" && w.config.autoFit !== false && !!aspect
  const fitPhoto = (g: Geo): Geo => {
    if (!autoFit || !aspect) return g
    const pad = PHOTO_FRAME_PAD[w.config.frame ?? "none"] ?? PHOTO_FRAME_PAD.none
    let h = (g.w - pad.w) / aspect + pad.h
    let wd = g.w
    const maxH = view.h - 16
    if (h > maxH) { h = maxH; wd = (h - pad.h) * aspect + pad.w }
    return fitGeo({ ...g, w: Math.round(wd), h: Math.round(Math.max(110, h)) }, view)
  }
  const cur = fitPhoto(pos ?? geo)

  const startDrag = (e: React.PointerEvent, mode: Mode) => {
    if (e.button !== 0) return
    if (mode === "move" && (locked || (e.target as Element).closest(NO_DRAG))) return
    if (mode !== "move") { e.preventDefault(); e.stopPropagation() }
    const sx = e.clientX, sy = e.clientY
    const base = cur
    let latest = base
    let started = false
    const begin = () => {
      started = true
      front(w.id)
      setDragging(mode)
      window.getSelection()?.removeAllRanges()
    }
    if (mode !== "move") begin()
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!started) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        begin()
      }
      if (mode === "move") latest = { ...base, x: Math.max(8, Math.min(view.w - base.w - 8, base.x + dx)), y: Math.max(8, Math.min(view.h - base.h - 8, base.y + dy)) }
      else latest = {
        ...base,
        w: mode === "s" ? base.w : Math.max(140, Math.min(view.w - base.x - 8, base.w + dx)),
        h: mode === "e" ? base.h : Math.max(100, Math.min(view.h - base.y - 8, base.h + dy)),
      }
      setPos(latest)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      if (!started) return // foi só um clique: deixa o botão/link funcionar normalmente
      // depois de arrastar, engole o "click" que o navegador dispara ao soltar
      const swallow = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault() }
      window.addEventListener("click", swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0)
      setGeo(w.id, fitPhoto(fitGeo(latest, view)))
      setPos(null)
      setDragging(null)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  const bg = w.config.bg as (Partial<Frame> & { id: string }) | undefined
  const bare = look.surface === "none"
  const lightText = (bare || !!bgMedia) && !look.text
  const W = { ...w, ...cur }
  let body: ReactNode
  switch (w.type) {
    case "clock": body = <ClockWidget w={W} />; break
    case "stopwatch": body = <StopwatchWidget w={W} />; break
    case "weather": body = <WeatherWidget w={W} />; break
    case "news": body = <NewsWidget w={W} />; break
    case "photo": body = <PhotoWidget w={W} onConfigure={() => setCfgOpen(true)} onAspect={setAspect} />; break
    case "calendar": body = <CalendarWidget w={W} />; break
    case "note": body = <NoteWidget w={W} />; break
    case "shortcut": body = <SectionWidget w={W} />; break
    case "music": body = <MusicWidget w={W} />; break
    case "cs2": case "valorant": case "football": body = <SportsWidget w={W} />; break
    case "lyrics": body = <LyricsWidget w={W} />; break
    case "tasks": body = <TasksWidget w={W} />; break
    case "discord": body = <DiscordWidget w={W} />; break
    case "ifood": body = <IfoodWidget w={W} />; break
    case "whatsapp": body = <WhatsappWidget w={W} />; break
    case "finance": body = <FinanceWidget w={W} />; break
    case "agenda": body = <AgendaWidget w={W} />; break
    case "musicstats": body = <MusicStatsWidget w={W} />; break
    case "gaming": body = <GamingWidget w={W} />; break
    case "musicclip": body = <MusicClipWidget w={W} />; break
    case "valagent": body = <ValAgentWidget w={W} />; break
    case "sysmon": body = <SysMonWidget w={W} />; break
    case "pcmusic": body = <PcMusicWidget w={W} />; break
    case "countdown": body = <CountdownWidget w={W} />; break
  }
  if (resting) body = <RestingBody w={w} onWake={() => toggleRest(w.id)} />
  body = <ErrorBoundary label="widget" compact>{body}</ErrorBoundary>

  const ease = "cubic-bezier(.2,.8,.2,1)"
  return (
    <>
      <motion.div
        data-widget={w.id}
        className={cn("group absolute", hoverClass(look), !locked && "cursor-grab", dragging === "move" && "cursor-grabbing")}
        style={{
          left: cur.x, top: cur.y, width: cur.w, height: cur.h,
          zIndex: dragging ? 50 : undefined,
          // transição suave de tamanho (fotos de formatos diferentes, troca de monitor); desligada enquanto arrasta
          transition: dragging ? "none" : `width .6s ${ease}, height .6s ${ease}, left .45s ${ease}, top .45s ${ease}`,
        }}
        initial={{ opacity: 0, scale: 0.85, rotateX: 25 }}
        animate={{ opacity: 1, scale: dragging === "move" ? 1.03 : 1, rotateX: 0 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onPointerDown={(e) => startDrag(e, "move")}
        onPointerEnter={() => { hoveredWidget = w.id }}
        onPointerLeave={() => { if (hoveredWidget === w.id) hoveredWidget = null }}
        onDoubleClick={(e) => {
          // YouTube Music: dois cliques no widget abrem a aba (menos em cima dos botões)
          if (resting || (w.type !== "music" && w.type !== "musicclip") || (e.target as Element).closest("button,input,a,[data-nodrag]")) return
          openWindow("music")
        }}
      >
        <div
          ref={inner}
          onDragStart={(e) => e.preventDefault()}
          className={cn("wl-inner h-full w-full overflow-hidden will-change-transform", bare ? "rounded-[var(--r)]" : "surface")}
          style={{
            transformStyle: "preserve-3d",
            ...lookStyle(look),
            ...(dragging ? { boxShadow: "0 40px 80px -20px rgb(0 0 0 / .6)" } : null),
            opacity: w.config.opacity ?? 1,
            textShadow: lightText ? "0 2px 12px rgb(0 0 0 / .55)" : undefined,
            color: lightText ? "#fff" : undefined,
          }}
        >
          {bgMedia && !resting && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit", opacity: bg?.opacity ?? 1 }}>
              <img src={mediaUrl(bgMedia.file)} className="h-full w-full" style={frameImgStyle(bg)} draggable={false} />
              {!!bg?.dim && <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${bg.dim})` }} />}
            </div>
          )}
          {hov === "theme" && <div className="glare" />}
          <div className="relative h-full w-full">{body}</div>
        </div>

        {!locked && look.chrome === "minimal" && (
          <button className="btn btn-icon surface absolute top-1.5 right-1.5 z-10 !p-1 opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100" onClick={() => setCfgOpen(true)} title="Configurar (segure e arraste o widget para mover)"><Settings2 size={12} /></button>
        )}
        {!locked && (
          <>
            <div
              className={cn(look.chrome === "minimal" && "hidden", "absolute -top-3 left-1/2 z-10 -translate-x-1/2 transition-opacity", dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
              title="Segure e arraste para mover"
            >
              <div className="surface flex h-6 items-center gap-1 !rounded-full px-3 text-[11px] text-fg-muted">
                <GripHorizontal size={14} /> {dragging && dragging !== "move" ? `${Math.round(cur.w)} × ${Math.round(cur.h)}` : "mover"}
              </div>
            </div>
            <div className={cn(look.chrome === "minimal" && "hidden", "absolute -top-3 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100")}>
              <button className="btn btn-icon surface !p-1.5" onClick={() => toggleRest(w.id)} title={resting ? "Acordar o widget" : "Modo descanso: fica no lugar, mas não gasta nada"}>{resting ? <Sun size={13} /> : <Moon size={13} />}</button>
              <button className="btn btn-icon surface !p-1.5" onClick={() => setCfgOpen(true)} title="Configurar"><Settings2 size={13} /></button>
              <button className="btn btn-icon surface !p-1.5 hover:!text-red-400" onClick={() => remove(w.id)} title="Remover"><Trash2 size={13} /></button>
            </div>
            {/* alças de tamanho: borda direita (largura), borda de baixo (altura) e canto (as duas) */}
            <div className="absolute top-3 -right-1 bottom-5 z-10 w-2.5 cursor-ew-resize" onPointerDown={(e) => startDrag(e, "e")} data-nodrag title="Arraste para mudar a largura">
            </div>
            {!autoFit && (
              <div className="absolute right-5 -bottom-1 left-3 z-10 h-2.5 cursor-ns-resize" onPointerDown={(e) => startDrag(e, "s")} data-nodrag title="Arraste para mudar a altura">
              </div>
            )}
            <div
              className="absolute right-0 bottom-0 z-10 h-5 w-5 cursor-nwse-resize opacity-0 transition-opacity group-hover:opacity-100"
              onPointerDown={(e) => startDrag(e, "se")}
              data-nodrag
              title="Arraste para mudar o tamanho"
            >
              <svg viewBox="0 0 10 10" className="h-full w-full p-1 opacity-70"><path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
            </div>
          </>
        )}
      </motion.div>
      {cfgMounted && <WidgetSettings w={w} geo={cur} autoFit={autoFit} open={cfgOpen} onClose={() => setCfgOpen(false)} />}
    </>
  )
})

/** widget em descanso: só o nome e o ícone, nada rodando por trás */
function RestingBody({ w, onWake }: { w: Widget; onWake: () => void }) {
  const M = WIDGET_META[w.type]
  const small = w.h < 150 || w.w < 220
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center" style={{ opacity: 0.72 }}>
      <div className="flex items-center gap-2">
        <GlyphTile icon={M.icon} color={M.color} size={small ? 22 : 28} />
        {!small && <span className="text-sm font-medium">{M.label.split(" (")[0]}</span>}
      </div>
      <button className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg" style={{ background: "color-mix(in srgb, var(--fg) 8%, transparent)" }} onClick={onWake} title="Acordar o widget">
        <Moon size={11} /> em descanso · acordar
      </button>
    </div>
  )
}

function WidgetSettings({ w, geo, autoFit, open, onClose }: { w: Widget; geo: Geo; autoFit: boolean; open: boolean; onClose: () => void }) {
  const upd = useStore((s) => s.updateWidgetConfig)
  const setGeo = useStore((s) => s.setWidgetGeo)
  const media = useStore((s) => s.media)
  const view = useViewport()
  const c = w.config
  const set = (p: Record<string, any>) => upd(w.id, p)
  const [picker, setPicker] = useState(false)
  const [bgPicker, setBgPicker] = useState(false)
  const [framing, setFraming] = useState<string | null>(null)
  const [editing, setEditing] = useState<MediaItem | null>(null)
  const [living, setLiving] = useState<MediaItem | null>(null)
  const bg = c.bg as (Partial<Frame> & { id: string }) | undefined
  const bgMedia = bg ? media.find((m) => m.id === bg.id) : undefined
  // fotos: da galeria ligada ao quadro (vale para todos os quadros que usam ela) ou só deste quadro
  const galleries = useStore((s) => s.photoGalleries)
  const gal = c.gallery ? galleries.find((g) => g.id === c.gallery) : undefined
  const curIds = (gal ? gal.ids : c.ids ?? []) as string[]
  const photos = curIds.map((id) => media.find((m) => m.id === id)).filter(Boolean) as MediaItem[]
  const frames = (gal ? gal.frames : c.frames ?? {}) as Record<string, Partial<Frame>>
  const setGalleries = (fn: (g: PhotoGallery[]) => PhotoGallery[]) => useStore.setState((st) => ({ photoGalleries: fn(st.photoGalleries) }))
  const setPhotos = (p: { ids?: string[]; frames?: Record<string, any> }) => (gal ? setGalleries((all) => all.map((g) => (g.id === gal.id ? { ...g, ...p, updatedAt: Date.now() } : g))) : set(p))
  const [galName, setGalName] = useState("")
  const [clipT, setClipT] = useState(() => widgetClip()?.type)
  const framingMedia = framing ? media.find((m) => m.id === framing) : undefined

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2.5"><GlyphTile icon={WIDGET_META[w.type].icon} color={WIDGET_META[w.type].color} size={24} />{WIDGET_META[w.type].label}</span>} width={520}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className="btn !py-1 text-xs" onClick={() => { copyWidget(w); setClipT(widgetClip()?.type); toast("Configuração copiada") }} title="Copiar a configuração deste widget (ou Ctrl+C com o mouse em cima dele)"><Copy size={12} /> Copiar configuração</button>
          <button className="btn !py-1 text-xs" disabled={!clipT} onClick={() => { const r = pasteWidget(w.id); if (r) toast(r === "tudo" ? "Configuração colada" : "Aparência colada (widget de outro tipo)") }} title={clipT ? (clipT === w.type ? "Colar tudo" : "Widget de outro tipo: cola só a aparência") : "Copie a configuração de um widget primeiro"}><ClipboardPaste size={12} /> Colar{clipT && clipT !== w.type ? " aparência" : ""}</button>
          <button className="btn !py-1 text-xs" onClick={() => toggleRest(w.id)}>{c.rest ? <><Sun size={12} /> Acordar</> : <><Moon size={12} /> Modo descanso</>}</button>
        </div>
        {c.rest && <div className="text-xs text-fg-muted">Em descanso: o widget fica no mesmo lugar, mas nada roda por trás (não gasta memória nem processador).</div>}
        {w.type === "music" && (
          <>
            <div className="text-sm text-fg-muted">Estilo do player</div>
            <Segmented value={c.style ?? "card"} onChange={(v) => set({ style: v })} options={[{ value: "card", label: "Cartão" }, { value: "vinyl", label: "Vinil girando" }, { value: "compact", label: "Compacto" }]} />
            <Switch label="Mostrar a letra sincronizada" checked={c.lyrics !== false} onChange={(v) => set({ lyrics: v })} />
            <Switch label="Mostrar a fila (A seguir)" checked={!!c.queue} onChange={(v) => set({ queue: v })} />
            <div className="text-xs text-fg-muted">Com o card alto (aumente a altura), a letra aparece rolando com várias linhas e a fila fica embaixo de tudo. Em cards baixos, a letra vira karaokê e a fila abre por cima.</div>
            {c.lyrics !== false && <LyricsLookSettings c={c} set={set} />}
            <div className="text-xs text-fg-muted">Dica: no widget, o botão de clipe abre o vídeo num widget próprio, e a roda do mouse sobre o ícone de som ajusta o volume.</div>
          </>
        )}
        {w.type === "valagent" && <ValAgentSettings w={w} set={set} />}
        {w.type === "sysmon" && <SysMonSettings w={w} set={set} />}
        {w.type === "pcmusic" && <PcMusicSettings w={w} set={set} />}
        {w.type === "countdown" && <CountdownSettings w={w} set={set} />}
        {w.type === "whatsapp" && (
          <Switch label="Mostrar só conversas com mensagens novas" checked={!!c.onlyUnread} onChange={(v) => set({ onlyUnread: v })} />
        )}
        {w.type === "calendar" && (
          <Switch label="Mostrar um pontinho nos dias com tarefas" checked={!!c.taskDots} onChange={(v) => set({ taskDots: v })} />
        )}
        {w.type === "tasks" && (
          <div className="text-sm text-fg-muted">
            Escreva a data junto com a tarefa e ela vai para o dia certo: <b>hoje</b>, <b>amanhã</b>, <b>sexta</b>, <b>dia 12</b>, <b>12/11</b>, com horário como <b>15h</b> ou <b>às 9</b>. Ou toque no ícone de calendário para escolher o dia.
            Tarefas com horário mostram um aviso do Windows na hora. Clique duas vezes numa tarefa para editar.
          </div>
        )}
        {w.type === "lyrics" && (
          <>
            <LyricsLookSettings c={c} set={set} />
            <div className="text-sm text-fg-muted">Estilo</div>
            <Segmented value={c.style ?? "scroll"} onChange={(v) => set({ style: v })} options={[{ value: "scroll", label: "Rolagem" }, { value: "karaoke", label: "Karaokê (linha atual)" }]} />
            {(c.style ?? "scroll") === "scroll" && <Segmented value={c.align ?? "left"} onChange={(v) => set({ align: v })} options={[{ value: "left", label: "À esquerda" }, { value: "center", label: "Centralizada" }]} />}
            <div className="text-xs text-fg-muted">Letras da LRCLIB (base aberta). Clique numa linha para pular para aquele trecho da música.</div>
          </>
        )}
        {(w.type === "cs2" || w.type === "valorant" || w.type === "football") && <SportsSettings w={w} set={set} />}
        {w.type === "shortcut" && (
          <>
            <label className="block text-sm">Aba
              <select className="field mt-1 w-full" value={c.section ?? "habits"} onChange={(e) => set({ section: e.target.value })}>
                {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            {c.section === "lists" && <ListSelect value={c.listId ?? ""} onChange={(v) => set({ listId: v || undefined })} />}
          </>
        )}
        {w.type === "clock" && (
          <>
            <div className="text-sm text-fg-muted">Estilo</div>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ["digital", "Digital", "12:34"], ["analog", "Analógico", "◷"], ["flip", "Flip", "▤ 12"], ["lcd", "LCD retrô", "▭ 88"],
                ["minimal", "Minimal", "12.34"], ["stacked", "Empilhado", "12\n34"], ["neon", "Neon", "✦ 12:34"], ["nixie", "Nixie", "▯▯▯▯"],
                ["words", "Por extenso", "Aa"], ["rings", "Anéis", "◎"], ["gradient", "Degradê", "12:34"],
              ] as const).map(([v, label, ico]) => (
                <button key={v} onClick={() => set({ style: v })} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px]", (c.style ?? "digital") === v ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
                  <span className="font-num text-sm leading-none whitespace-pre">{ico}</span>{label}
                </button>
              ))}
            </div>
            {(() => {
              const has = new Set(CLOCK_OPTS[c.style ?? "digital"] ?? CLOCK_OPTS.digital)
              return (
                <>
                  {has.has("color") && (
                    <>
                      <div className="text-sm">{c.style === "analog" ? "Cor dos ponteiros e marcas" : "Cor dos números"}</div>
                      <div className="flex items-center gap-3">
                        <ColorPicker value={c.color ?? "#ffffff"} onChange={(v) => set({ color: v })} swatches={["#ffffff", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff", "#ff9a3c"]} />
                        {c.color && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ color: undefined })}>padrão</button>}
                      </div>
                    </>
                  )}
                  {has.has("size") && <Slider label="Tamanho dos números" value={c.size ?? 1} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ size: v })} format={(v) => Math.round(v * 100) + "%"} />}
                  {has.has("weight") && <Slider label="Espessura" value={c.weight ?? 600} min={100} max={900} step={100} onChange={(v) => set({ weight: v })} />}
                  {has.has("glow") && <Switch label="Brilho (glow)" checked={!!c.glow} onChange={(v) => set({ glow: v })} />}
                  {has.has("blink") && <Switch label={c.style === "minimal" ? "Ponto piscando" : "Dois-pontos piscando"} checked={c.blink ?? true} onChange={(v) => set({ blink: v })} />}
                  {has.has("seconds") && <Switch label={c.style === "analog" ? "Ponteiro dos segundos" : "Mostrar segundos"} checked={c.seconds ?? true} onChange={(v) => set({ seconds: v })} />}
                  {has.has("h12") && <Switch label="Formato 12h (AM/PM)" checked={!!c.h12} onChange={(v) => set({ h12: v })} />}
                  {has.has("date") && <Switch label="Mostrar data" checked={c.showDate ?? true} onChange={(v) => set({ showDate: v })} />}
                  {has.has("font") && <FontSelect value={c.font ?? ""} onChange={(v) => set({ font: v || undefined })} />}
                </>
              )
            })()}
          </>
        )}
        {w.type === "weather" && (
          <label className="block text-sm">
            Cidade (vazio = padrão das configurações)
            <input className="field mt-1 w-full" defaultValue={c.city ?? ""} onBlur={(e) => set({ city: e.target.value.trim() || undefined })} placeholder="Ex.: Curitiba" />
          </label>
        )}
        {w.type === "news" && (
          <>
            <div className="text-sm">Fonte de notícias</div>
            <select className="field w-full" value={c.feed ?? ""} onChange={(e) => set({ feed: e.target.value || undefined })}>
              <option value="">Padrão das configurações</option>
              {FEEDS.map((f) => <option key={f.url} value={f.url}>{f.label}</option>)}
            </select>
            <input className="field w-full" placeholder="…ou cole a URL de um feed RSS" defaultValue={FEEDS.some((f) => f.url === c.feed) ? "" : c.feed ?? ""} onBlur={(e) => e.target.value && set({ feed: e.target.value.trim() })} />
          </>
        )}
        {w.type === "photo" && (
          <>
            <div className="space-y-2 rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Galeria</span>
                <select className="field flex-1 !py-1 text-sm" value={c.gallery ?? ""} onChange={(e) => {
                  const v = e.target.value
                  // desligar: o quadro fica com uma cópia das fotos da galeria
                  if (!v) set({ gallery: undefined, ids: gal ? [...gal.ids] : c.ids, frames: gal ? { ...gal.frames } : c.frames })
                  else set({ gallery: v })
                }}>
                  <option value="">Fotos só deste quadro</option>
                  {galleries.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.ids.length})</option>)}
                </select>
              </div>
              {gal ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input className="field flex-1 !py-1 text-sm" defaultValue={gal.name} key={gal.id} onBlur={(e) => { const n = e.target.value.trim(); if (n && n !== gal.name) setGalleries((all) => all.map((g) => (g.id === gal.id ? { ...g, name: n } : g))) }} title="Nome da galeria" />
                  <button className="btn !py-1 text-xs hover:!text-red-400" onClick={() => {
                    if (!confirm(`Excluir a galeria "${gal.name}"? Os quadros que usam ela ficam com uma cópia das fotos.`)) return
                    const st = useStore.getState()
                    for (const x of st.widgets) if (x.type === "photo" && x.config.gallery === gal.id) st.updateWidgetConfig(x.id, { gallery: undefined, ids: [...gal.ids], frames: { ...gal.frames } })
                    setGalleries((all) => all.filter((g) => g.id !== gal.id))
                  }}><Trash2 size={12} /> Excluir galeria</button>
                  <div className="w-full text-[11px] text-fg-muted">Mudar as fotos aqui muda em todos os quadros que usam esta galeria.</div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className="field flex-1 !py-1 text-sm" placeholder="Nome da galeria (ex.: Viagem, Amigos)" value={galName} onChange={(e) => setGalName(e.target.value)} />
                  <button className="btn !py-1 text-xs" disabled={!curIds.length} title={curIds.length ? "" : "Escolha fotos primeiro"} onClick={() => {
                    const g: PhotoGallery = { id: uid(), name: galName.trim() || `Galeria ${galleries.length + 1}`, ids: [...curIds], frames: { ...frames }, createdAt: Date.now(), updatedAt: Date.now() }
                    setGalleries((all) => [...all, g]); set({ gallery: g.id }); setGalName("")
                  }}>Salvar como galeria</button>
                </div>
              )}
            </div>
            <button className="btn w-full" onClick={() => setPicker(true)}><Images size={14} /> Escolher fotos ({photos.length})</button>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="overflow-hidden rounded-xl border border-line">
                    <div className="relative h-24">
                      <img src={mediaUrl(p.file)} className="h-full w-full" style={frameImgStyle(frames[p.id])} draggable={false} />
                      {p.animated && <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">{p.living ? "VIVA" : "GIF"}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 p-1.5">
                      <button className="btn px-2 py-0.5 text-xs" onClick={() => setFraming(p.id)}><Move size={12} /> Enquadrar</button>
                      {!p.animated && <button className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(p)}><Crop size={12} /> Editar</button>}
                      {!p.animated && <button className="btn px-2 py-0.5 text-xs" onClick={() => setLiving(p)}><Wand2 size={12} /> Viva</button>}
                      <button className="btn px-2 py-0.5 text-xs hover:!text-red-400" title="Tirar do quadro" onClick={() => setPhotos({ ids: curIds.filter((x) => x !== p.id) })}><X size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Switch label="Ajustar o quadro ao formato de cada foto (com transição)" checked={c.autoFit !== false} onChange={(v) => set({ autoFit: v })} />
            <div className="text-sm text-fg-muted">Moldura</div>
            <Segmented value={c.frame ?? "none"} onChange={(v) => set({ frame: v })} options={[{ value: "none", label: "Nenhuma" }, { value: "polaroid", label: "Polaroid" }, { value: "film", label: "Filme" }]} />
            <div className="text-sm text-fg-muted">Transição entre fotos</div>
            <Segmented value={c.effect ?? "fade"} onChange={(v) => set({ effect: v })} options={[{ value: "fade", label: "Fade" }, { value: "zoom", label: "Zoom" }, { value: "flip", label: "Giro 3D" }, { value: "slide", label: "Deslizar" }]} />
            {c.autoFit === false && <Segmented value={c.fit ?? "cover"} onChange={(v) => set({ fit: v })} options={[{ value: "cover", label: "Preencher" }, { value: "contain", label: "Inteira" }]} />}
            <Slider label="Trocar a cada" value={c.interval ?? 8} min={3} max={120} onChange={(v) => set({ interval: v })} format={(v) => v + "s"} />
            {c.frame === "polaroid" && <input className="field w-full" placeholder="Legenda da polaroid" defaultValue={c.caption ?? ""} onBlur={(e) => set({ caption: e.target.value })} />}
            <MediaPicker open={picker} onClose={() => setPicker(false)} multi selected={curIds} onPick={(ids) => setPhotos({ ids })} />
            <Modal open={!!framingMedia} onClose={() => setFraming(null)} title="Enquadrar foto" width={520}>
              {framingMedia && (
                <ImageFramer
                  media={framingMedia}
                  aspect={autoFit ? framingMedia.width / Math.max(1, framingMedia.height) : geo.w / geo.h}
                  value={frames[framingMedia.id] ?? {}}
                  effects={false}
                  onChange={(f) => setPhotos({ frames: { ...frames, [framingMedia.id]: f } })}
                />
              )}
            </Modal>
            <PhotoEditor m={editing} onClose={() => setEditing(null)} onSaved={(n) => { if (editing && n.id !== editing.id) setPhotos({ ids: curIds.map((x) => (x === editing.id ? n.id : x)) }) }} />
            <LivingStudio m={living} onClose={() => setLiving(null)} onCreated={(n) => { if (living) setPhotos({ ids: curIds.map((x) => (x === living.id ? n.id : x)) }) }} />
          </>
        )}
        {w.type === "note" && (
          <Slider label="Tamanho do texto" value={c.size ?? 16} min={11} max={40} onChange={(v) => set({ size: v })} format={(v) => v + "px"} />
        )}

        {/* ---------- tamanho ---------- */}
        <div className="border-t border-line pt-3">
          <div className="mb-1 text-sm font-medium">Tamanho</div>
          <Slider label="Largura" value={Math.round(geo.w)} min={140} max={Math.max(160, view.w - 16)} onChange={(v) => setGeo(w.id, fitGeo({ ...geo, w: v }, view))} format={(v) => v + " px"} />
          {autoFit ? (
            <div className="text-xs text-fg-muted">A altura acompanha o formato de cada foto. Desligue o ajuste automático para escolher a altura.</div>
          ) : (
            <Slider label="Altura" value={Math.round(geo.h)} min={100} max={Math.max(120, view.h - 16)} onChange={(v) => setGeo(w.id, fitGeo({ ...geo, h: v }, view))} format={(v) => v + " px"} />
          )}
          <div className="text-xs text-fg-muted">Também dá para arrastar as bordas direita e de baixo, ou o canto. {view.portrait ? "Este tamanho vale para o monitor em pé." : "Este tamanho vale para o monitor deitado."}</div>
        </div>

        {/* ---------- imagem de fundo ---------- */}
        {w.type !== "photo" && !lookLimits(w.type, c).ownBg && (
          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Imagem de fundo</span>
              <div className="flex gap-1.5">
                <button className="btn text-xs" onClick={() => setBgPicker(true)}><ImagePlus size={13} /> {bgMedia ? "Trocar" : "Escolher"}</button>
                {bgMedia && <button className="btn text-xs hover:!text-red-400" onClick={() => set({ bg: undefined })}>Remover</button>}
              </div>
            </div>
            {bgMedia && (
              <ImageFramer media={bgMedia} aspect={geo.w / geo.h} value={bg ?? {}} onChange={(f) => set({ bg: { ...f, id: bgMedia.id } })} />
            )}
            <MediaPicker open={bgPicker} onClose={() => setBgPicker(false)} onPick={([id]) => set({ bg: { ...DEFAULT_FRAME, dim: 0.3, id } })} />
          </div>
        )}

        <LookSettings id={w.id} type={w.type} config={c} />
        <div className="border-t border-line pt-3">
          <Slider label="Opacidade do widget inteiro" value={c.opacity ?? 1} min={0.2} max={1} step={0.05} onChange={(v) => set({ opacity: v })} format={(v) => Math.round(v * 100) + "%"} />
        </div>
      </div>
    </Modal>
  )
}

function ListSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lists = useStore((s) => s.lists)
  return (
    <label className="block text-sm">Lista mostrada
      <select className="field mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Primeira lista</option>
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  )
}

/** Fonte, cor e tamanho da letra (separados do resto do widget). */
function LyricsLookSettings({ c, set }: { c: Record<string, any>; set: (p: Record<string, any>) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="text-sm font-semibold">Aparência da letra</div>
      <FontPicker label="Fonte da letra da música" value={c.lyFont ?? ""} onChange={(id) => set({ lyFont: id || undefined })} allowDefault defaultLabel="Padrão do tema" sample="Minha música favorita" />
      <div className="text-sm">Cor</div>
      <div className="flex items-center gap-3">
        <ColorPicker value={c.lyColor ?? "#ffffff"} onChange={(v) => set({ lyColor: v })} swatches={["#ffffff", "#ffd6e8", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff"]} />
        {c.lyColor && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ lyColor: undefined })}>padrão</button>}
      </div>
      <Slider label="Tamanho" value={c.lyScale ?? 1} min={0.7} max={1.8} step={0.05} onChange={(v) => set({ lyScale: v })} format={(v) => Math.round(v * 100) + "%"} />
      <div
        className="rounded-lg p-2 text-center font-semibold"
        style={{ background: "rgb(0 0 0 / .25)", fontFamily: c.lyFont ? fontFamily(c.lyFont) : "var(--font-display)", color: c.lyColor || "var(--fg)", fontSize: Math.round(16 * (c.lyScale ?? 1)) }}
      >
        Never gonna give you up ♪
      </div>
    </div>
  )
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <FontPicker label="Fonte dos números" value={value} onChange={onChange} allowDefault defaultLabel="Padrão do tema" sample="12:45" />
}
