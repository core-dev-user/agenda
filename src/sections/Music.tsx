import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ExternalLink, Home, Library, Loader2, LogOut, MicVocal, MonitorDown, Search } from "lucide-react"
import { bridge } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import { Switch } from "@/components/ui/controls"
import { Artwork, Controls, Progress, useMusic, VolumeControl } from "@/components/MusicPlayer"
import { LyricsScroll } from "@/components/Lyrics"
import { cn } from "@/lib/utils"

/**
 * Mantém o player do YouTube Music encaixado exatamente sobre `slot`.
 * O player é uma camada nativa (fica por cima de tudo), então ele só aparece quando a janela
 * Música está na frente, não minimizada e sem nenhuma caixa de diálogo aberta.
 */
function useEmbedSlot(slot: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let last = ""
    const loop = () => {
      const el = slot.current
      const st = useStore.getState()
      const me = st.windows.find((w) => w.id === "music")
      const open = st.windows.filter((w) => !w.minimized)
      const top = open.length ? Math.max(...open.map((w) => w.z)) : -1
      let key = "off"
      let b: { x: number; y: number; w: number; h: number; radius: number } | null = null
      if (el && me && !me.minimized && me.z === top && !document.querySelector("[data-modal]")) {
        const r = el.getBoundingClientRect()
        // recorta na área visível da tela
        const x = Math.max(0, r.left), y = Math.max(0, r.top)
        const w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y
        if (w > 40 && h > 40) {
          const radius = parseFloat(getComputedStyle(el).borderRadius) || 0
          b = { x, y, w, h, radius }
          key = [x, y, w, h].map(Math.round).join(",")
        }
      }
      if (key !== last) {
        last = key
        bridge.music.embed(b)
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      bridge.music.embed(null)
    }
  }, [enabled])
}

export default function Music() {
  const m = useMusic()
  const [q, setQ] = useState("")
  const auto = useStore((s) => s.settings.musicAutostart)
  const setSettings = useStore((s) => s.setSettings)
  const slot = useRef<HTMLDivElement>(null)
  const showLyrics = useStore((s) => s.settings.musicLyrics ?? false)
  useEffect(() => { bridge.music.open() }, [])
  useEmbedSlot(slot, !m.popped)

  return (
    <div className="flex h-full flex-col">
      {/* barra de cima: navegação do YouTube Music */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <button className="btn btn-ghost btn-icon" title="Voltar" onClick={() => bridge.music.cmd("back")}><ArrowLeft size={16} /></button>
        <form
          className="flex min-w-60 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const v = q.trim()
            if (!v) return
            if (/^https?:\/\/(www\.|music\.|m\.)?(youtube\.com|youtu\.be)\//.test(v)) { bridge.music.cmd("url", v); setQ("") }
            else bridge.music.cmd("search", v)
          }}
        >
          <Search size={15} className="text-fg-muted" />
          <input className="field flex-1" placeholder="Buscar música, artista, playlist… ou cole um link do YouTube" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <button className="btn" onClick={() => bridge.music.cmd("home")}><Home size={14} /> Início</button>
        <button className="btn" onClick={() => bridge.music.cmd("library")}><Library size={14} /> Biblioteca</button>
        {m.popped ? (
          <button className="btn" onClick={() => bridge.music.dock()} title="Trazer o YouTube Music de volta para dentro do Agenda"><MonitorDown size={14} /> Trazer para o Agenda</button>
        ) : (
          <button className="btn" onClick={() => bridge.music.popout()} title="A música continua tocando"><ExternalLink size={14} /> Abrir em janela separada</button>
        )}
      </div>

      {/* o YouTube Music fica aqui dentro */}
      <div className="relative flex min-h-0 flex-1 gap-3 p-3 pb-0">
        <div className="relative min-w-0 flex-1">
        {m.popped ? (
          <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[calc(var(--r)*0.6)] border border-line text-center">
            {m.art && <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `url("${m.art}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(50px) saturate(1.4)", transform: "scale(1.3)" }} />}
            <div className="relative"><Artwork size={180} /></div>
            <div className="relative">
              <div className="font-display text-xl font-semibold">Tocando em janela separada</div>
              <div className="mt-1 text-sm text-fg-muted">Fechar aquela janela traz o YouTube Music de volta para cá, sem parar a música.</div>
            </div>
            <button className="btn btn-accent relative" onClick={() => bridge.music.dock()}><MonitorDown size={15} /> Trazer para o Agenda</button>
          </div>
        ) : (
          <div ref={slot} className="relative flex h-full items-center justify-center overflow-hidden rounded-[calc(var(--r)*0.6)] bg-[#030303] text-fg-muted">
            {/* aparece só enquanto o YouTube Music carrega (o player cobre esta área) */}
            <Loader2 className="mr-2 animate-spin" size={18} /> Carregando o YouTube Music…
          </div>
        )}
        </div>
        {showLyrics && (
          <div className="relative w-[min(38%,400px)] shrink-0 overflow-hidden rounded-[calc(var(--r)*0.6)] border border-line">
            {m.art && <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `url("${m.art}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(40px) saturate(1.5)", transform: "scale(1.4)" }} />}
            <LyricsScroll className="relative" />
          </div>
        )}
      </div>

      {/* barra de baixo no estilo do Agenda */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        {m.ready ? (
          <>
            <Artwork size={46} />
            <div className="min-w-0 w-56">
              <div className="truncate font-semibold">{m.ad && <span className="mr-1.5 rounded bg-[#ffd36e] px-1 text-[10px] font-bold text-black">ANÚNCIO</span>}{m.title}</div>
              <div className="truncate text-sm text-fg-muted">{m.artist}</div>
            </div>
            <div className="min-w-40 flex-1"><Progress /></div>
            <Controls extra />
            <button
              className={cn("btn btn-ghost btn-icon", showLyrics && "text-brand")}
              title={showLyrics ? "Esconder a letra" : "Mostrar a letra sincronizada"}
              onClick={() => setSettings({ musicLyrics: !showLyrics })}
            >
              <MicVocal size={16} />
            </button>
            <VolumeControl />
          </>
        ) : (
          <div className="flex-1 text-sm text-fg-muted">Escolha uma música no YouTube Music acima. Os controles aparecem aqui e nos widgets.</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-1.5 text-xs">
        <div className="min-w-60 flex-1">
          <Switch label="Carregar o YouTube Music junto com o Agenda (em segundo plano)" checked={auto} onChange={(v) => setSettings({ musicAutostart: v })} />
        </div>
        <span className="text-fg-muted">Fechar a aba Música não para a música.</span>
        <button className="btn btn-ghost text-xs" onClick={() => confirm("Sair da conta Google no YouTube Music do Agenda?") && bridge.music.logout()}><LogOut size={13} /> Sair da conta</button>
      </div>
    </div>
  )
}
