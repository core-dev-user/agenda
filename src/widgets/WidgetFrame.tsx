import { useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { Crop, GripHorizontal, ImagePlus, Move, Settings2, Trash2, Wand2, X } from "lucide-react"
import { useStore } from "@/lib/store"
import { useTilt } from "@/lib/useTilt"
import { mediaUrl } from "@/lib/bridge"
import { fitGeo, useViewport, widgetGeo } from "@/lib/viewport"
import type { Geo, MediaItem, Widget, WidgetType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FONTS } from "@/lib/fonts"
import { ColorPicker, Modal, Segmented, Slider, Switch } from "@/components/ui/controls"
import { MediaPicker } from "@/components/MediaPicker"
import { DEFAULT_FRAME, frameImgStyle, ImageFramer, type Frame } from "@/components/ImageFramer"
import { PhotoEditor } from "@/components/PhotoEditor"
import { LivingStudio } from "@/components/LivingStudio"
import { ClockWidget } from "./Clock"
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
import { SECTIONS } from "@/components/sections-meta"

export const WIDGET_META: Record<WidgetType, { label: string; emoji: string }> = {
  clock: { label: "Relógio", emoji: "🕐" },
  stopwatch: { label: "Cronômetro / Timer", emoji: "⏱️" },
  weather: { label: "Clima", emoji: "⛅" },
  news: { label: "Notícias", emoji: "📰" },
  photo: { label: "Quadro de fotos", emoji: "🖼️" },
  calendar: { label: "Calendário", emoji: "📅" },
  note: { label: "Nota", emoji: "📝" },
  shortcut: { label: "Atalho de aba", emoji: "🔗" },
  music: { label: "Música (YouTube Music)", emoji: "🎵" },
  cs2: { label: "CS2 (jogos e resultados)", emoji: "🎯" },
  valorant: { label: "Valorant (vlr.gg)", emoji: "🔺" },
  football: { label: "Futebol (placares ao vivo)", emoji: "⚽" },
  lyrics: { label: "Letra da música (sincronizada)", emoji: "🎤" },
  tasks: { label: "Tarefas", emoji: "✅" },
  discord: { label: "Discord (call atual)", emoji: "🎧" },
  ifood: { label: "iFood (pedidos)", emoji: "🍔" },
  whatsapp: { label: "WhatsApp (conversas)", emoji: "💬" },
}

/** Opções do menu "Adicionar widget": widgets comuns + um atalho para cada aba. */
export const WIDGET_CHOICES: { type: WidgetType; config: Record<string, any>; label: string; emoji: string; group: "widget" | "atalho" }[] = [
  ...(Object.keys(WIDGET_META) as WidgetType[])
    .filter((t) => t !== "shortcut")
    .map((t) => ({ type: t, config: {}, label: WIDGET_META[t].label, emoji: WIDGET_META[t].emoji, group: "widget" as const })),
  ...SECTIONS.filter((s) => !["settings", "music", "discord", "ifood", "whatsapp"].includes(s.id)).map((s) => ({
    type: "shortcut" as WidgetType,
    config: { section: s.id },
    label: s.label,
    emoji: ({ habits: "✅", studies: "🎓", services: "💼", lists: "🛒", gallery: "🖼️" } as Record<string, string>)[s.id] ?? "🔗",
    group: "atalho" as const,
  })),
]

// Só campos de digitação bloqueiam o arrasto; botões e links funcionam: clique = clica, segurar e mover = arrasta.
const NO_DRAG = "input,textarea,select,[contenteditable=true],[data-nodrag]"
const DRAG_THRESHOLD = 5

type Mode = "move" | "se" | "e" | "s"

export function WidgetFrame({ w }: { w: Widget }) {
  const setGeo = useStore((s) => s.setWidgetGeo)
  const remove = useStore((s) => s.removeWidget)
  const front = useStore((s) => s.bringWidgetFront)
  const locked = useStore((s) => s.settings.widgetsLocked)
  const layoutRef = useStore((s) => s.settings.layoutRef)
  const media = useStore((s) => s.media)
  const view = useViewport()
  const [pos, setPos] = useState<Geo | null>(null)
  const [dragging, setDragging] = useState<Mode | null>(null)
  const [cfgOpen, setCfgOpen] = useState(false)
  const [aspect, setAspect] = useState<number | null>(null)
  const inner = useRef<HTMLDivElement>(null)
  useTilt(inner, 1, !dragging)

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
  const bgMedia = bg ? media.find((m) => m.id === bg.id) : undefined
  const bare = !!w.config.bare
  const lightText = bare || !!bgMedia
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
  }

  const ease = "cubic-bezier(.2,.8,.2,1)"
  return (
    <>
      <motion.div
        className={cn("group absolute", !locked && "cursor-grab", dragging === "move" && "cursor-grabbing")}
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
      >
        <div
          ref={inner}
          onDragStart={(e) => e.preventDefault()}
          className={cn("h-full w-full overflow-hidden will-change-transform", bare ? "rounded-[var(--r)]" : "surface")}
          style={{
            transformStyle: "preserve-3d",
            boxShadow: dragging ? "0 40px 80px -20px rgb(0 0 0 / .6)" : undefined,
            opacity: w.config.opacity ?? 1,
            textShadow: lightText ? "0 2px 12px rgb(0 0 0 / .55)" : undefined,
            color: lightText ? "#fff" : undefined,
          }}
        >
          {bgMedia && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: "inherit", opacity: bg?.opacity ?? 1 }}>
              <img src={mediaUrl(bgMedia.file)} className="h-full w-full" style={frameImgStyle(bg)} draggable={false} />
              {!!bg?.dim && <div className="absolute inset-0" style={{ background: `rgb(0 0 0 / ${bg.dim})` }} />}
            </div>
          )}
          <div className="glare" />
          <div className="relative h-full w-full">{body}</div>
        </div>

        {!locked && (
          <>
            <div
              className={cn("absolute -top-3 left-1/2 z-10 -translate-x-1/2 transition-opacity", dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
              title="Segure e arraste para mover"
            >
              <div className="surface flex h-6 items-center gap-1 !rounded-full px-3 text-[11px] text-fg-muted">
                <GripHorizontal size={14} /> {dragging && dragging !== "move" ? `${Math.round(cur.w)} × ${Math.round(cur.h)}` : "mover"}
              </div>
            </div>
            <div className="absolute -top-3 right-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
      <WidgetSettings w={w} geo={cur} autoFit={autoFit} open={cfgOpen} onClose={() => setCfgOpen(false)} />
    </>
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
  const photos = ((c.ids ?? []) as string[]).map((id) => media.find((m) => m.id === id)).filter(Boolean) as MediaItem[]
  const frames = (c.frames ?? {}) as Record<string, Partial<Frame>>
  const framingMedia = framing ? media.find((m) => m.id === framing) : undefined

  return (
    <Modal open={open} onClose={onClose} title={`${WIDGET_META[w.type].emoji} ${WIDGET_META[w.type].label}`} width={520}>
      <div className="space-y-3">
        {w.type === "music" && (
          <>
            <div className="text-sm text-fg-muted">Estilo do player</div>
            <Segmented value={c.style ?? "card"} onChange={(v) => set({ style: v })} options={[{ value: "card", label: "Cartão" }, { value: "vinyl", label: "Vinil girando" }, { value: "compact", label: "Compacto" }]} />
            <Switch label="Mostrar o clipe passando (como no app)" checked={!!c.video} onChange={(v) => set({ video: v })} />
            <Switch label="Mostrar a letra sincronizada" checked={c.lyrics !== false} onChange={(v) => set({ lyrics: v })} />
            <Switch label="Mostrar a fila (A seguir)" checked={!!c.queue} onChange={(v) => set({ queue: v })} />
            <div className="text-xs text-fg-muted">Com o card alto (aumente a altura), a letra aparece rolando com várias linhas e a fila fica embaixo de tudo. Em cards baixos, a letra vira karaokê e a fila abre por cima.</div>
            {c.lyrics !== false && <LyricsLookSettings c={c} set={set} />}
            <div className="text-xs text-fg-muted">Dica: no widget, o botão 🎬 alterna entre capa e clipe, e a roda do mouse sobre o ícone de som ajusta o volume.</div>
          </>
        )}
        {w.type === "whatsapp" && (
          <Switch label="Mostrar só conversas com mensagens novas" checked={!!c.onlyUnread} onChange={(v) => set({ onlyUnread: v })} />
        )}
        {w.type === "calendar" && (
          <Switch label="Mostrar um pontinho nos dias com tarefas" checked={!!c.taskDots} onChange={(v) => set({ taskDots: v })} />
        )}
        {w.type === "tasks" && (
          <div className="text-sm text-fg-muted">
            Escreva a data junto com a tarefa e ela vai para o dia certo: <b>hoje</b>, <b>amanhã</b>, <b>sexta</b>, <b>dia 12</b>, <b>12/11</b>, com horário como <b>15h</b> ou <b>às 9</b>. Ou toque no 📅 para escolher no calendário.
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
                ["digital", "Digital", "12:34"], ["analog", "Analógico", "🕐"], ["flip", "Flip", "▤ 12"], ["lcd", "LCD retrô", "▭ 88"],
                ["minimal", "Minimal", "12.34"], ["stacked", "Empilhado", "12\n34"], ["neon", "Neon", "✦ 12:34"], ["nixie", "Nixie", "▯▯▯▯"],
                ["words", "Por extenso", "Aa"], ["rings", "Anéis", "◎"], ["gradient", "Degradê", "🌈"],
              ] as const).map(([v, label, ico]) => (
                <button key={v} onClick={() => set({ style: v })} className={cn("flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px]", (c.style ?? "digital") === v ? "border-brand bg-brand/15" : "border-line hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]")}>
                  <span className="font-num text-sm leading-none whitespace-pre">{ico}</span>{label}
                </button>
              ))}
            </div>
            <div className="text-sm">Cor dos números</div>
            <div className="flex items-center gap-3">
              <ColorPicker value={c.color ?? "#ffffff"} onChange={(v) => set({ color: v })} swatches={["#ffffff", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff", "#ff9a3c"]} />
              {c.color && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ color: undefined })}>padrão</button>}
            </div>
            <Slider label="Tamanho dos números" value={c.size ?? 1} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ size: v })} format={(v) => Math.round(v * 100) + "%"} />
            <Slider label="Espessura" value={c.weight ?? 600} min={100} max={900} step={100} onChange={(v) => set({ weight: v })} />
            <Switch label="Brilho (glow)" checked={!!c.glow} onChange={(v) => set({ glow: v })} />
            <Switch label="Dois-pontos piscando" checked={c.blink ?? true} onChange={(v) => set({ blink: v })} />
            <Switch label="Mostrar segundos" checked={c.seconds ?? true} onChange={(v) => set({ seconds: v })} />
            <Switch label="Formato 12h (AM/PM)" checked={!!c.h12} onChange={(v) => set({ h12: v })} />
            <Switch label="Mostrar data" checked={c.showDate ?? true} onChange={(v) => set({ showDate: v })} />
            <FontSelect value={c.font ?? ""} onChange={(v) => set({ font: v || undefined })} />
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
            <button className="btn w-full" onClick={() => setPicker(true)}>🖼️ Escolher fotos ({photos.length})</button>
            {photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p) => (
                  <div key={p.id} className="overflow-hidden rounded-xl border border-line">
                    <div className="relative h-24">
                      <img src={mediaUrl(p.file)} className="h-full w-full" style={frameImgStyle(frames[p.id])} draggable={false} />
                      {p.animated && <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-[10px] font-bold text-white">{p.living ? "✨ VIVA" : "GIF"}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 p-1.5">
                      <button className="btn px-2 py-0.5 text-xs" onClick={() => setFraming(p.id)}><Move size={12} /> Enquadrar</button>
                      {!p.animated && <button className="btn px-2 py-0.5 text-xs" onClick={() => setEditing(p)}><Crop size={12} /> Editar</button>}
                      {!p.animated && <button className="btn px-2 py-0.5 text-xs" onClick={() => setLiving(p)}><Wand2 size={12} /> Viva</button>}
                      <button className="btn px-2 py-0.5 text-xs hover:!text-red-400" title="Tirar do quadro" onClick={() => set({ ids: (c.ids as string[]).filter((x) => x !== p.id) })}><X size={12} /></button>
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
            <MediaPicker open={picker} onClose={() => setPicker(false)} multi selected={c.ids ?? []} onPick={(ids) => set({ ids })} />
            <Modal open={!!framingMedia} onClose={() => setFraming(null)} title="Enquadrar foto" width={520}>
              {framingMedia && (
                <ImageFramer
                  media={framingMedia}
                  aspect={autoFit ? framingMedia.width / Math.max(1, framingMedia.height) : geo.w / geo.h}
                  value={frames[framingMedia.id] ?? {}}
                  effects={false}
                  onChange={(f) => set({ frames: { ...frames, [framingMedia.id]: f } })}
                />
              )}
            </Modal>
            <PhotoEditor m={editing} onClose={() => setEditing(null)} onSaved={(n) => { if (editing && n.id !== editing.id) set({ ids: (c.ids as string[]).map((x) => (x === editing.id ? n.id : x)) }) }} />
            <LivingStudio m={living} onClose={() => setLiving(null)} onCreated={(n) => { if (living) set({ ids: (c.ids as string[]).map((x) => (x === living.id ? n.id : x)) }) }} />
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
        {w.type !== "photo" && (
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

        <div className="border-t border-line pt-3">
          <Switch label="Sem fundo (flutuando sobre o papel de parede)" checked={!!c.bare} onChange={(v) => set({ bare: v })} />
          <Slider label="Opacidade do widget" value={c.opacity ?? 1} min={0.2} max={1} step={0.05} onChange={(v) => set({ opacity: v })} format={(v) => Math.round(v * 100) + "%"} />
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
        {lists.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.name}</option>)}
      </select>
    </label>
  )
}

/** Fonte, cor e tamanho da letra (separados do resto do widget). */
function LyricsLookSettings({ c, set }: { c: Record<string, any>; set: (p: Record<string, any>) => void }) {
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="text-sm font-semibold">Aparência da letra</div>
      <label className="block text-sm">
        Fonte
        <select className="field mt-1 w-full" value={c.lyFont ?? ""} onChange={(e) => set({ lyFont: e.target.value || undefined })}>
          <option value="">Padrão do tema</option>
          {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>)}
        </select>
      </label>
      <div className="text-sm">Cor</div>
      <div className="flex items-center gap-3">
        <ColorPicker value={c.lyColor ?? "#ffffff"} onChange={(v) => set({ lyColor: v })} swatches={["#ffffff", "#ffd6e8", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff"]} />
        {c.lyColor && <button className="text-xs text-fg-muted hover:text-fg" onClick={() => set({ lyColor: undefined })}>padrão</button>}
      </div>
      <Slider label="Tamanho" value={c.lyScale ?? 1} min={0.7} max={1.8} step={0.05} onChange={(v) => set({ lyScale: v })} format={(v) => Math.round(v * 100) + "%"} />
      <div
        className="rounded-lg p-2 text-center font-semibold"
        style={{ background: "rgb(0 0 0 / .25)", fontFamily: c.lyFont ? FONTS.find((f) => f.id === c.lyFont)?.family : "var(--font-display)", color: c.lyColor || "var(--fg)", fontSize: Math.round(16 * (c.lyScale ?? 1)) }}
      >
        Never gonna give you up ♪
      </div>
    </div>
  )
}

function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      Fonte dos números
      <select className="field mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Padrão do tema</option>
        {FONTS.map((f) => <option key={f.id} value={f.id} style={{ fontFamily: f.family }}>{f.label}</option>)}
      </select>
    </label>
  )
}
