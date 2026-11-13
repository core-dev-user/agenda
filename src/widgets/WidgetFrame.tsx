import { memo, useEffect, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import {
  CalendarClock, CalendarDays, Hourglass, ChartColumn, Clapperboard, Clock, CloudSun, Cpu, Crosshair, Gamepad2, GripHorizontal, Headphones, Image, Link, ListChecks,
  MessageCircle, Mic, Moon, Music, Sun, Newspaper, Settings2, Shield, StickyNote, Target, Timer, Trash2, Triangle, UtensilsCrossed, Volleyball, Wallet, type LucideIcon,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { useTilt } from "@/lib/useTilt"
import { mediaUrl } from "@/lib/bridge"
import { fitGeo, useViewport, widgetGeo } from "@/lib/viewport"
import type { Geo, Widget, WidgetType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ensureFont } from "@/lib/fonts"
import { frameImgStyle, type Frame } from "@/components/ImageFramer"
import { ClockWidget } from "./Clock"
import { StopwatchWidget } from "./Stopwatch"
import { WeatherWidget } from "./Weather"
import { NewsWidget } from "./News"
import { PhotoWidget, CalendarWidget, NoteWidget, PHOTO_FRAME_PAD } from "./Misc"
import { SectionWidget } from "./SectionWidget"
import { MusicWidget } from "./MusicWidget"
import { SportsWidget } from "./Sports"
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
import { ValAgentWidget } from "./ValAgentWidget"
import { SysMonWidget } from "./SysMonWidget"
import { PcMusicWidget } from "./PcMusicWidget"
import { CountdownWidget } from "./Countdown"
import { TeamWidget } from "./TeamWidget"
import { hoverClass, lookOfWidget, lookStyle } from "./widgetLook"
import { WidgetInspector, closeInspector, openInspector, useInspector } from "./WidgetInspector"
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
  team: { label: "Meu time (logo, último e próximo jogo)", icon: Shield, color: "#ff4655" },
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
  football: "esportes", team: "esportes",
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
  // painel de personalizar: só um aberto por vez (o id do dono fica em useInspector)
  const cfgOpen = useInspector((s) => s.id === w.id)
  // o painel só é montado depois de aberto uma vez
  const [cfgMounted, setCfgMounted] = useState(false)
  const setCfgOpen = (v: boolean) => (v ? openInspector(w.id) : closeInspector(w.id))
  useEffect(() => { if (cfgOpen) setCfgMounted(true) }, [cfgOpen])
  useEffect(() => () => closeInspector(w.id), [w.id])
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
    case "team": body = <TeamWidget w={W} onConfigure={() => setCfgOpen(true)} />; break
  }
  if (resting) body = <RestingBody w={w} onWake={() => toggleRest(w.id)} />
  body = <ErrorBoundary label="widget" compact>{body}</ErrorBoundary>

  const ease = "cubic-bezier(.2,.8,.2,1)"
  return (
    <>
      <motion.div
        data-widget={w.id}
        className={cn("group absolute", hoverClass(look), !locked && "cursor-grab", dragging === "move" && "cursor-grabbing", cfgOpen && "wi-target")}
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
      {cfgMounted && <WidgetInspector w={w} geo={cur} autoFit={autoFit} open={cfgOpen} onClose={() => setCfgOpen(false)} meta={WIDGET_META[w.type]} onRest={() => toggleRest(w.id)} />}
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
