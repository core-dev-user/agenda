import { useEffect, useState } from "react"
import { create } from "zustand"
import { ClipboardPaste, Copy, Crop, ImagePlus, Images, Layers, Moon, Move, RotateCcw, Sun, Trash2, Wand2, X, type LucideIcon } from "lucide-react"
import { useStore, WIDGET_SIZES } from "@/lib/store"
import { mediaUrl } from "@/lib/bridge"
import { fitGeo, useViewport } from "@/lib/viewport"
import type { Geo, MediaItem, PhotoGallery, Widget } from "@/lib/types"
import { uid } from "@/lib/utils"
import { copyWidget, pasteWidget, widgetClip } from "@/lib/widgetClip"
import { toast } from "@/lib/toast"
import { fontFamily } from "@/lib/fonts"
import { FontPicker } from "@/components/FontPicker"
import { Modal } from "@/components/ui/controls"
import { MediaPicker } from "@/components/MediaPicker"
import { DEFAULT_FRAME, frameImgStyle, ImageFramer, type Frame } from "@/components/ImageFramer"
import { PhotoEditor } from "@/components/PhotoEditor"
import { LivingStudio } from "@/components/LivingStudio"
import { SECTIONS } from "@/components/sections-meta"
import { CLOCK_OPTS } from "./Clock"
import { FEEDS } from "./News"
import { SportsSettings } from "./Sports"
import { ValAgentSettings, ValBackgroundSettings } from "./ValAgentWidget"
import { SysMonSettings } from "./SysMonWidget"
import { PcMusicSettings } from "./PcMusicWidget"
import { CountdownSettings } from "./Countdown"
import { TeamSettings } from "./TeamWidget"
import { lookLimits, lookOfWidget, LookPanel } from "./widgetLook"
import { CLOCK_PREVIEWS, Choice, Group, InspectorPanel, MiniButton, Range, Row, Select, Swatches, TextField, Tiles, Toggle, type MenuItem } from "./inspector"

/** Só um painel de personalizar aberto por vez: aqui fica o id do widget dono dele. */
export const useInspector = create<{ id: string | null }>(() => ({ id: null }))
export const openInspector = (id: string) => useInspector.setState({ id })
export const closeInspector = (id?: string) => useInspector.setState((s) => (id && s.id !== id ? s : { id: null }))

type Tab = "content" | "look" | "size"
type Set = (p: Record<string, any>) => void

/** tipos que têm opções próprias (os outros só têm Aparência e Tamanho) */
const HAS_CONTENT = new Set(["clock", "weather", "news", "photo", "calendar", "note", "shortcut", "music", "cs2", "valorant", "football", "lyrics", "tasks", "whatsapp", "valagent", "sysmon", "pcmusic", "countdown", "team"])

const CLOCK_STYLES = [
  ["digital", "Digital"], ["analog", "Analógico"], ["flip", "Flip"], ["lcd", "LCD"], ["minimal", "Minimal"], ["stacked", "Empilhado"],
  ["neon", "Neon"], ["nixie", "Nixie"], ["words", "Por extenso"], ["rings", "Anéis"], ["gradient", "Degradê"],
] as const

/** O painel de personalizar de um widget. */
export function WidgetInspector({ w, geo, autoFit, open, onClose, meta, onRest }: {
  w: Widget; geo: Geo; autoFit: boolean; open: boolean; onClose: () => void
  meta: { label: string; icon: LucideIcon; color: string }; onRest: () => void
}) {
  const upd = useStore((s) => s.updateWidgetConfig)
  const remove = useStore((s) => s.removeWidget)
  const c = w.config
  const set: Set = (p) => upd(w.id, p)
  const hasContent = HAS_CONTENT.has(w.type)
  const [tab, setTab] = useState<Tab>(hasContent ? "content" : "look")
  const [clipT, setClipT] = useState(() => widgetClip()?.type)
  useEffect(() => { if (open) setClipT(widgetClip()?.type) }, [open])

  const look = lookOfWidget(c)
  const menu: MenuItem[] = [
    { label: "Copiar configuração", icon: Copy, hint: "Ou Ctrl+C com o mouse em cima do widget", onClick: () => { copyWidget(w); setClipT(widgetClip()?.type); toast("Configuração copiada") } },
    { label: !clipT || clipT === w.type ? "Colar configuração" : "Colar só a aparência", icon: ClipboardPaste, disabled: !clipT, hint: clipT ? (clipT === w.type ? "Cola tudo" : "A configuração copiada é de outro tipo de widget") : "Copie a configuração de um widget primeiro",
      onClick: () => { const r = pasteWidget(w.id); if (r) toast(r === "tudo" ? "Configuração colada" : "Aparência colada") } },
    { label: "Modo descanso", icon: c.rest ? Sun : Moon, checked: !!c.rest, hint: "O widget fica no lugar, mas nada roda por trás", onClick: onRest },
    { label: "Usar esta aparência em todos", icon: Layers, sep: true, onClick: () => {
      const st = useStore.getState()
      if (!confirm("Usar a aparência deste widget em todos os outros?")) return
      for (const x of st.widgets) if (x.id !== w.id) st.updateWidgetConfig(x.id, { look: { ...look }, bare: undefined })
    } },
    { label: "Voltar a aparência ao padrão", icon: RotateCcw, disabled: !c.look && !c.bare && !c.bg && c.opacity == null, onClick: () => upd(w.id, { look: undefined, bare: undefined, bg: undefined, opacity: undefined }) },
    { label: "Remover widget", icon: Trash2, danger: true, sep: true, onClick: () => { onClose(); remove(w.id) } },
  ]

  return (
    <InspectorPanel
      open={open} onClose={onClose} title={meta.label.split(" (")[0]} icon={meta.icon} color={meta.color} anchor={geo} menu={menu}
      tabs={[...(hasContent ? [{ id: "content" as Tab, label: "Conteúdo" }] : []), { id: "look" as Tab, label: "Aparência" }, { id: "size" as Tab, label: "Tamanho" }]}
      tab={tab} onTab={setTab}
    >
      {c.rest && (
        <div className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-[12.5px]" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
          <span className="flex items-center gap-2"><Moon size={14} className="shrink-0" /> Em descanso: nada roda por trás.</span>
          <MiniButton onClick={onRest}><Sun size={12} /> Acordar</MiniButton>
        </div>
      )}
      {tab === "content" && <Content w={w} set={set} geo={geo} autoFit={autoFit} />}
      {tab === "look" && w.type === "valagent" && <ValBackgroundSettings w={w} set={set} />}
      {tab === "look" && <LookPanel id={w.id} type={w.type} config={c} afterBackground={<BackgroundImage w={w} geo={geo} set={set} />} />}
      {tab === "size" && <SizeTab w={w} geo={geo} autoFit={autoFit} />}
    </InspectorPanel>
  )
}

/* ------------------------------------------------------------------ Tamanho ------------------------------------------------------------------ */
function SizeTab({ w, geo, autoFit }: { w: Widget; geo: Geo; autoFit: boolean }) {
  const setGeo = useStore((s) => s.setWidgetGeo)
  const view = useViewport()
  const [dw, dh] = WIDGET_SIZES[w.type]
  const apply = (g: Partial<Geo>) => setGeo(w.id, fitGeo({ ...geo, ...g }, view))
  const quick = [["Pequeno", 0.8], ["Padrão", 1], ["Grande", 1.3]] as const
  const which = quick.find(([, k]) => Math.abs(geo.w - Math.round(dw * k)) <= 2 && (autoFit || Math.abs(geo.h - Math.round(dh * k)) <= 2))?.[0] ?? ""
  return (
    <>
      <Group title="Tamanhos rápidos" flush>
        <div className="p-2">
          <Choice label="Tamanhos rápidos" value={which} onChange={(v) => { const k = quick.find(([n]) => n === v)![1]; apply({ w: Math.round(dw * k), h: Math.round(dh * k) }) }} options={quick.map(([n]) => ({ value: n, label: n }))} />
        </div>
      </Group>
      <Group title="Dimensões" note={<>Também dá para arrastar a borda direita, a de baixo ou o canto do widget. {view.portrait ? "Este tamanho vale para o monitor em pé." : "Este tamanho vale para o monitor deitado."}</>}>
        <Range label="Largura" value={Math.round(geo.w)} min={140} max={Math.max(160, view.w - 16)} onChange={(v) => apply({ w: v })} format={(v) => v + " px"} />
        {autoFit
          ? <Row label="Altura" hint="Acompanha o formato de cada foto. Desligue “Ajustar ao formato da foto” em Conteúdo para escolher." />
          : <Range label="Altura" value={Math.round(geo.h)} min={100} max={Math.max(120, view.h - 16)} onChange={(v) => apply({ h: v })} format={(v) => v + " px"} />}
      </Group>
      <Group title="Posição">
        <Row label="Centralizar na tela">
          <MiniButton onClick={() => apply({ x: Math.round((view.w - geo.w) / 2), y: Math.round((view.h - geo.h) / 2) })}><Move size={12} /> Centralizar</MiniButton>
        </Row>
      </Group>
    </>
  )
}

/* ------------------------------------------------------------------ imagem de fundo ------------------------------------------------------------------ */
function BackgroundImage({ w, geo, set }: { w: Widget; geo: Geo; set: Set }) {
  const [picker, setPicker] = useState(false)
  const bg = w.config.bg as (Partial<Frame> & { id: string }) | undefined
  const bgMedia = useStore((s) => (bg ? s.media.find((m) => m.id === bg.id) : undefined))
  if (w.type === "photo" || lookLimits(w.type, w.config).ownBg) return null
  return (
    <Group title="Imagem de fundo" flush>
      <Row label={bgMedia ? "Imagem escolhida" : "Nenhuma imagem"}>
        <MiniButton onClick={() => setPicker(true)}><ImagePlus size={12} /> {bgMedia ? "Trocar" : "Escolher"}</MiniButton>
        {bgMedia && <MiniButton danger onClick={() => set({ bg: undefined })}>Remover</MiniButton>}
      </Row>
      {bgMedia && (
        <div className="border-t border-line p-3">
          <ImageFramer max={300} media={bgMedia} aspect={geo.w / geo.h} value={bg ?? {}} onChange={(f) => set({ bg: { ...f, id: bgMedia.id } })} />
        </div>
      )}
      <MediaPicker open={picker} onClose={() => setPicker(false)} onPick={([id]) => set({ bg: { ...DEFAULT_FRAME, dim: 0.3, id } })} />
    </Group>
  )
}

/* ------------------------------------------------------------------ Conteúdo ------------------------------------------------------------------ */
function Content({ w, set, geo, autoFit }: { w: Widget; set: Set; geo: Geo; autoFit: boolean }) {
  const c = w.config
  switch (w.type) {
    case "clock": return <ClockContent c={c} set={set} />
    case "music": return (
      <>
        <Group title="Player">
          <Row stack label="Estilo">
            <Choice label="Estilo do player" value={c.style ?? "card"} onChange={(v) => set({ style: v })} options={[{ value: "card", label: "Cartão" }, { value: "vinyl", label: "Vinil" }, { value: "compact", label: "Compacto" }]} />
          </Row>
          <Toggle label="Letra sincronizada" hint="No card alto ela rola em várias linhas; no baixo vira karaokê." checked={c.lyrics !== false} onChange={(v) => set({ lyrics: v })} />
          <Toggle label="Fila (a seguir)" checked={!!c.queue} onChange={(v) => set({ queue: v })} />
        </Group>
        {c.lyrics !== false && <LyricsLook c={c} set={set} />}
      </>
    )
    case "lyrics": return (
      <>
        <Group title="Como a letra aparece">
          <Row stack label="Modo">
            <Choice label="Modo da letra" value={c.style ?? "scroll"} onChange={(v) => set({ style: v })} options={[{ value: "scroll", label: "Rolagem" }, { value: "karaoke", label: "Karaokê (linha atual)" }]} />
          </Row>
          {(c.style ?? "scroll") === "scroll" && (
            <Row stack label="Alinhamento">
              <Choice label="Alinhamento" value={c.align ?? "left"} onChange={(v) => set({ align: v })} options={[{ value: "left", label: "À esquerda" }, { value: "center", label: "Centralizada" }]} />
            </Row>
          )}
        </Group>
        <LyricsLook c={c} set={set} note="Clique numa linha da letra para pular para aquele trecho. Letras da LRCLIB (base aberta)." />
      </>
    )
    case "weather": return (
      <Group title="Cidade" note="Vazio usa a cidade padrão das Configurações.">
        <Row stack><TextField label="Cidade" value={c.city ?? ""} placeholder="Ex.: Curitiba" onCommit={(v) => set({ city: v.trim() || undefined })} /></Row>
      </Group>
    )
    case "news": {
      const known = FEEDS.some((f) => f.url === c.feed)
      return (
        <Group title="Fonte de notícias">
          <Row label="Fonte">
            <Select label="Fonte de notícias" value={known ? c.feed : c.feed ? "__custom" : ""} onChange={(v) => v !== "__custom" && set({ feed: v || undefined })}
              options={[{ value: "", label: "Padrão das Configurações" }, ...FEEDS.map((f) => ({ value: f.url, label: f.label })), ...(c.feed && !known ? [{ value: "__custom", label: "Endereço próprio" }] : [])]} />
          </Row>
          <Row stack label="Ou o endereço de um feed RSS">
            <TextField label="Endereço do feed RSS" value={known ? "" : c.feed ?? ""} placeholder="https://…" onCommit={(v) => set({ feed: v.trim() || undefined })} />
          </Row>
        </Group>
      )
    }
    case "note": return (
      <Group title="Texto">
        <Range label="Tamanho do texto" value={c.size ?? 16} min={11} max={40} onChange={(v) => set({ size: v })} format={(v) => v + " px"} def={16} />
      </Group>
    )
    case "calendar": return (
      <Group title="Calendário">
        <Toggle label="Marcar os dias com tarefas" hint="Um ponto embaixo do dia que tem tarefa." checked={!!c.taskDots} onChange={(v) => set({ taskDots: v })} />
      </Group>
    )
    case "whatsapp": return (
      <Group title="Conversas">
        <Toggle label="Só conversas com mensagens novas" checked={!!c.onlyUnread} onChange={(v) => set({ onlyUnread: v })} />
      </Group>
    )
    case "tasks": return (
      <Group title="Como escrever uma tarefa" flush>
        <div className="space-y-1.5 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-muted">
          <p>A data pode ir junto com o texto: <b className="font-medium text-fg">hoje</b>, <b className="font-medium text-fg">amanhã</b>, <b className="font-medium text-fg">sexta</b>, <b className="font-medium text-fg">dia 12</b>, <b className="font-medium text-fg">12/11</b>.</p>
          <p>Com horário (<b className="font-medium text-fg">15h</b>, <b className="font-medium text-fg">às 9</b>) a tarefa avisa na hora.</p>
          <p>Dois cliques numa tarefa para editar.</p>
        </div>
      </Group>
    )
    case "shortcut": return <ShortcutContent c={c} set={set} />
    case "photo": return <PhotoContent w={w} set={set} geo={geo} autoFit={autoFit} />
    case "cs2": case "valorant": case "football": return <SportsSettings w={w} set={set} />
    case "valagent": return <ValAgentSettings w={w} set={set} />
    case "sysmon": return <SysMonSettings w={w} set={set} />
    case "pcmusic": return <PcMusicSettings w={w} set={set} />
    case "countdown": return <CountdownSettings w={w} set={set} />
    case "team": return <TeamSettings w={w} set={set} />
    default: return null
  }
}

function ClockContent({ c, set }: { c: Record<string, any>; set: Set }) {
  const style = (c.style ?? "digital") as string
  const has = new Set(CLOCK_OPTS[style] ?? CLOCK_OPTS.digital)
  const analog = style === "analog"
  return (
    <>
      <Group title="Estilo" flush>
        <div className="p-1.5">
          <Tiles label="Estilo do relógio" cols={4} value={style} onChange={(v) => set({ style: v })}
            options={CLOCK_STYLES.map(([value, label]) => ({ value, label, preview: CLOCK_PREVIEWS[value] }))} />
        </div>
      </Group>
      {(has.has("color") || has.has("size") || has.has("weight") || has.has("font") || has.has("glow")) && (
        <Group title={analog ? "Ponteiros" : "Números"}>
          {has.has("color") && (
            <Row stack label={analog ? "Cor dos ponteiros e marcas" : "Cor"}>
              <Swatches label="Cor do relógio" auto="Do tema" value={c.color} onChange={(v) => set({ color: v })} colors={["#ffffff", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff", "#ff9a3c"]} />
            </Row>
          )}
          {has.has("size") && <Range label="Tamanho" value={c.size ?? 1} min={0.6} max={1.6} step={0.05} onChange={(v) => set({ size: v })} format={(v) => Math.round(v * 100) + "%"} def={1} />}
          {has.has("weight") && <Range label="Espessura" value={c.weight ?? 600} min={100} max={900} step={100} onChange={(v) => set({ weight: v })} def={600} />}
          {has.has("glow") && <Toggle label="Brilho em volta" checked={!!c.glow} onChange={(v) => set({ glow: v })} />}
          {has.has("font") && <div className="p-2"><FontPicker label="Fonte dos números" value={c.font ?? ""} onChange={(v) => set({ font: v || undefined })} allowDefault defaultLabel="Do tema" sample="12:45" /></div>}
        </Group>
      )}
      {(has.has("seconds") || has.has("blink") || has.has("h12") || has.has("date")) && (
        <Group title="O que mostrar">
          {has.has("seconds") && <Toggle label={analog ? "Ponteiro dos segundos" : "Segundos"} checked={c.seconds ?? true} onChange={(v) => set({ seconds: v })} />}
          {has.has("blink") && <Toggle label={style === "minimal" ? "Ponto piscando" : "Dois-pontos piscando"} checked={c.blink ?? true} onChange={(v) => set({ blink: v })} />}
          {has.has("h12") && <Toggle label="Formato de 12 horas" hint="AM e PM, em vez de 24 horas." checked={!!c.h12} onChange={(v) => set({ h12: v })} />}
          {has.has("date") && <Toggle label="Data" checked={c.showDate ?? true} onChange={(v) => set({ showDate: v })} />}
        </Group>
      )}
    </>
  )
}

function ShortcutContent({ c, set }: { c: Record<string, any>; set: Set }) {
  const lists = useStore((s) => s.lists)
  return (
    <Group title="Atalho">
      <Row label="Aba">
        <Select label="Aba" value={c.section ?? "habits"} onChange={(v) => set({ section: v })} options={SECTIONS.map((s) => ({ value: s.id, label: s.label }))} />
      </Row>
      {c.section === "lists" && (
        <Row label="Lista mostrada">
          <Select label="Lista mostrada" value={c.listId ?? ""} onChange={(v) => set({ listId: v || undefined })} options={[{ value: "", label: "Primeira lista" }, ...lists.map((l) => ({ value: l.id, label: l.name }))]} />
        </Row>
      )}
    </Group>
  )
}

/** Fonte, cor e tamanho da letra da música (separados do resto do widget), com uma linha de prévia. */
function LyricsLook({ c, set, note }: { c: Record<string, any>; set: Set; note?: string }) {
  return (
    <Group title="Aparência da letra" note={note}>
      <div className="px-3 py-3 text-center font-semibold" style={{ background: "rgb(0 0 0 / .22)", fontFamily: c.lyFont ? fontFamily(c.lyFont) : "var(--font-display)", color: c.lyColor || "var(--fg)", fontSize: Math.round(15 * (c.lyScale ?? 1)) }}>
        A letra aparece assim ♪
      </div>
      <Row stack label="Cor">
        <Swatches label="Cor da letra" auto="Do tema" value={c.lyColor} onChange={(v) => set({ lyColor: v })} colors={["#ffffff", "#ffd6e8", "#ff8fb8", "#ffd36e", "#8cf0b0", "#7cc8ff", "#c49bff"]} />
      </Row>
      <Range label="Tamanho" value={c.lyScale ?? 1} min={0.7} max={1.8} step={0.05} onChange={(v) => set({ lyScale: v })} format={(v) => Math.round(v * 100) + "%"} def={1} />
      <div className="p-2"><FontPicker label="Fonte da letra" value={c.lyFont ?? ""} onChange={(id) => set({ lyFont: id || undefined })} allowDefault defaultLabel="Do tema" sample="Minha música favorita" /></div>
    </Group>
  )
}

function PhotoContent({ w, set, geo, autoFit }: { w: Widget; set: Set; geo: Geo; autoFit: boolean }) {
  const c = w.config
  const media = useStore((s) => s.media)
  const galleries = useStore((s) => s.photoGalleries)
  const [picker, setPicker] = useState(false)
  const [framing, setFraming] = useState<string | null>(null)
  const [editing, setEditing] = useState<MediaItem | null>(null)
  const [living, setLiving] = useState<MediaItem | null>(null)
  const [galName, setGalName] = useState("")
  // fotos: da galeria ligada ao quadro (vale para todos os quadros que usam ela) ou só deste quadro
  const gal = c.gallery ? galleries.find((g) => g.id === c.gallery) : undefined
  const curIds = (gal ? gal.ids : c.ids ?? []) as string[]
  const photos = curIds.map((id) => media.find((m) => m.id === id)).filter(Boolean) as MediaItem[]
  const frames = (gal ? gal.frames : c.frames ?? {}) as Record<string, Partial<Frame>>
  const setGalleries = (fn: (g: PhotoGallery[]) => PhotoGallery[]) => useStore.setState((st) => ({ photoGalleries: fn(st.photoGalleries) }))
  const setPhotos = (p: { ids?: string[]; frames?: Record<string, any> }) => (gal ? setGalleries((all) => all.map((g) => (g.id === gal.id ? { ...g, ...p, updatedAt: Date.now() } : g))) : set(p))
  const framingMedia = framing ? media.find((m) => m.id === framing) : undefined
  const many = photos.length > 1
  return (
    <>
      <Group title="Fotos" flush action={<MiniButton onClick={() => setPicker(true)}><Images size={12} /> {photos.length ? "Escolher fotos" : "Adicionar fotos"}</MiniButton>}>
        {photos.length === 0 ? (
          <button type="button" onClick={() => setPicker(true)} className="flex w-full flex-col items-center gap-1.5 px-3 py-7 text-fg-muted transition-colors hover:text-fg">
            <Images size={22} strokeWidth={1.5} />
            <span className="text-[12.5px]">Nenhuma foto ainda. Clique para escolher.</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-1.5">
            {photos.map((p) => (
              <div key={p.id} className="group/p relative aspect-square overflow-hidden rounded-[8px]" style={{ background: "rgb(0 0 0 / .3)" }}>
                <img src={mediaUrl(p.file)} className="h-full w-full" style={frameImgStyle(frames[p.id])} draggable={false} alt="" />
                {p.animated && <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[9px] font-bold tracking-wide text-white">{p.living ? "VIVA" : "GIF"}</span>}
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/55 opacity-0 transition-opacity group-hover/p:opacity-100 focus-within:opacity-100">
                  <PhotoAction title="Enquadrar" onClick={() => setFraming(p.id)}><Move size={13} /></PhotoAction>
                  {!p.animated && <PhotoAction title="Editar (cortar, ajustar)" onClick={() => setEditing(p)}><Crop size={13} /></PhotoAction>}
                  {!p.animated && <PhotoAction title="Dar vida à foto" onClick={() => setLiving(p)}><Wand2 size={13} /></PhotoAction>}
                  <PhotoAction title="Tirar do quadro" onClick={() => setPhotos({ ids: curIds.filter((x) => x !== p.id) })}><X size={13} /></PhotoAction>
                </div>
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group title="Galeria" note={gal ? "Mudar as fotos aqui muda em todos os quadros que usam esta galeria." : "Uma galeria guarda este conjunto de fotos para usar em outros quadros."}>
        <Row label="Usar">
          <Select label="Galeria" value={c.gallery ?? ""} onChange={(v) => {
            // desligar: o quadro fica com uma cópia das fotos da galeria
            if (!v) set({ gallery: undefined, ids: gal ? [...gal.ids] : c.ids, frames: gal ? { ...gal.frames } : c.frames })
            else set({ gallery: v })
          }} options={[{ value: "", label: "Fotos só deste quadro" }, ...galleries.map((g) => ({ value: g.id, label: `${g.name} (${g.ids.length})` }))]} />
        </Row>
        {gal ? (
          <Row stack label="Nome da galeria" trailing={
            <MiniButton danger onClick={() => {
              if (!confirm(`Excluir a galeria "${gal.name}"? Os quadros que usam ela ficam com uma cópia das fotos.`)) return
              const st = useStore.getState()
              for (const x of st.widgets) if (x.type === "photo" && x.config.gallery === gal.id) st.updateWidgetConfig(x.id, { gallery: undefined, ids: [...gal.ids], frames: { ...gal.frames } })
              setGalleries((all) => all.filter((g) => g.id !== gal.id))
            }}><Trash2 size={12} /> Excluir</MiniButton>
          }>
            <TextField key={gal.id} label="Nome da galeria" value={gal.name} onCommit={(v) => { const n = v.trim(); if (n) setGalleries((all) => all.map((g) => (g.id === gal.id ? { ...g, name: n } : g))) }} />
          </Row>
        ) : (
          <Row stack label="Salvar estas fotos como galeria">
            <div className="flex gap-2">
              <input className="wi-input" aria-label="Nome da nova galeria" placeholder="Nome (ex.: Viagem, Amigos)" value={galName} onChange={(e) => setGalName(e.target.value)} />
              <MiniButton disabled={!curIds.length} title={curIds.length ? undefined : "Escolha fotos primeiro"} onClick={() => {
                const g: PhotoGallery = { id: uid(), name: galName.trim() || `Galeria ${galleries.length + 1}`, ids: [...curIds], frames: { ...frames }, createdAt: Date.now(), updatedAt: Date.now() }
                setGalleries((all) => [...all, g]); set({ gallery: g.id }); setGalName("")
              }}>Salvar</MiniButton>
            </div>
          </Row>
        )}
      </Group>

      <Group title="Quadro">
        <Row stack label="Moldura">
          <Choice label="Moldura" value={c.frame ?? "none"} onChange={(v) => set({ frame: v })} options={[{ value: "none", label: "Nenhuma" }, { value: "polaroid", label: "Polaroid" }, { value: "film", label: "Filme" }]} />
        </Row>
        {c.frame === "polaroid" && <Row stack label="Legenda"><TextField label="Legenda da polaroid" value={c.caption ?? ""} placeholder="Escreva algo embaixo da foto" onCommit={(v) => set({ caption: v })} /></Row>}
        <Toggle label="Ajustar ao formato da foto" hint="O quadro muda de proporção para cada foto." checked={c.autoFit !== false} onChange={(v) => set({ autoFit: v })} />
        {c.autoFit === false && (
          <Row stack label="Encaixe">
            <Choice label="Encaixe da foto" value={c.fit ?? "cover"} onChange={(v) => set({ fit: v })} options={[{ value: "cover", label: "Preencher" }, { value: "contain", label: "Foto inteira" }]} />
          </Row>
        )}
      </Group>

      {many && (
        <Group title="Troca de fotos">
          <Row stack label="Transição">
            <Choice label="Transição entre fotos" value={c.effect ?? "fade"} onChange={(v) => set({ effect: v })} options={[{ value: "fade", label: "Esmaecer" }, { value: "zoom", label: "Zoom" }, { value: "flip", label: "Giro 3D" }, { value: "slide", label: "Deslizar" }]} />
          </Row>
          <Range label="Trocar a cada" value={c.interval ?? 8} min={3} max={120} onChange={(v) => set({ interval: v })} format={(v) => (v < 60 ? v + " s" : Math.floor(v / 60) + " min" + (v % 60 ? " " + (v % 60) + " s" : ""))} def={8} />
        </Group>
      )}

      <MediaPicker open={picker} onClose={() => setPicker(false)} multi selected={curIds} onPick={(ids) => setPhotos({ ids })} />
      <Modal open={!!framingMedia} onClose={() => setFraming(null)} title="Enquadrar foto" width={520}>
        {framingMedia && (
          <ImageFramer media={framingMedia} aspect={autoFit ? framingMedia.width / Math.max(1, framingMedia.height) : geo.w / geo.h} value={frames[framingMedia.id] ?? {}} effects={false}
            onChange={(f) => setPhotos({ frames: { ...frames, [framingMedia.id]: f } })} />
        )}
      </Modal>
      <PhotoEditor m={editing} onClose={() => setEditing(null)} onSaved={(n) => { if (editing && n.id !== editing.id) setPhotos({ ids: curIds.map((x) => (x === editing.id ? n.id : x)) }) }} />
      <LivingStudio m={living} onClose={() => setLiving(null)} onCreated={(n) => { if (living) setPhotos({ ids: curIds.map((x) => (x === living.id ? n.id : x)) }) }} />
    </>
  )
}

function PhotoAction({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="flex size-7 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30">
      {children}
    </button>
  )
}
