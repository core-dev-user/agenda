import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Bell, Bot, ChevronUp, Search, Volume2, Wifi } from "lucide-react"
import { bridge, type BarMenu, type PcWindow } from "@/lib/bridge"
import { Logo } from "@/components/Logo"
import { cn } from "@/lib/utils"
import { exeKey, useBarSync } from "./sync"

interface Group { key: string; exe: string; name: string; icon: string; wins: PcWindow[]; pinned: boolean }

/** ícone de um programa (fixado e fechado não vem na lista de janelas: pede ao Windows) */
function useIcon(file: string, given: string) {
  const [url, setUrl] = useState(given)
  useEffect(() => { if (given) setUrl(given); else if (file) bridge.bar.icon(file).then(setUrl) }, [file, given])
  return url
}

function AppBtn({ g, size, fg, onClick, onRight }: { g: Group; size: number; fg: string; onClick: () => void; onRight: () => void }) {
  const icon = useIcon(g.exe, g.icon)
  const running = g.wins.length > 0
  const isFg = g.wins.some((w) => w.h === fg)
  const title = g.wins.length ? g.wins.map((w) => w.title).join("\n") : g.name
  return (
    <button
      className="bar-btn shrink-0"
      style={{ width: size, height: size }}
      data-on={isFg}
      title={title + (g.pinned ? "\n(clique direito: desafixar)" : "\n(clique direito: fixar na barra)")}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onRight() }}
      onAuxClick={(e) => { if (e.button === 1) bridge.bar.launch(g.exe) }}
    >
      {icon ? <img src={icon} alt="" draggable={false} style={{ width: size * 0.58, height: size * 0.58 }} /> : <span className="text-xs font-semibold">{g.name.slice(0, 2)}</span>}
      {g.wins.length > 1 && <span className="absolute top-0.5 right-1 font-num text-[9px] text-fg-muted">{g.wins.length}</span>}
      {running && <span className="bar-dot" data-fg={isFg} />}
    </button>
  )
}

export function SystemBar() {
  const sync = useBarSync()
  const [wins, setWins] = useState<PcWindow[]>([])
  const [fg, setFg] = useState("")
  const [menu, setMenu] = useState<BarMenu | "">("")
  const [peek, setPeek] = useState(false)
  const [now, setNow] = useState(new Date())
  const [W, setW] = useState(innerWidth)
  const H = innerHeight
  const center = useRef<HTMLDivElement>(null)
  useEffect(() => bridge.bar.onWins((d) => { setWins(d.wins); setFg(d.fg) }), [])
  useEffect(() => bridge.bar.onMenuState(setMenu), [])
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t) }, [])
  useLayoutEffect(() => { const f = () => setW(innerWidth); addEventListener("resize", f); return () => removeEventListener("resize", f) }, [])

  // fixados primeiro (na ordem), depois os abertos — janelas do mesmo programa ficam juntas
  const pins = sync?.pins ?? []
  const groups: Group[] = pins.map((p) => ({ key: exeKey(p.path), exe: p.path, name: p.name, icon: "", wins: [], pinned: true }))
  for (const w of wins) {
    const k = exeKey(w.exe || w.h)
    let g = groups.find((x) => x.key === k)
    if (!g) { g = { key: k, exe: w.exe, name: w.name, icon: w.icon, wins: [], pinned: false }; groups.push(g) }
    if (!g.icon) g.icon = w.icon
    g.wins.push(w)
  }

  // responsivo: os botões encolhem quando não cabem
  const reserved = 2 * 64 + 290
  const base = Math.min(48, H - 12)
  const size = Math.max(28, Math.min(base, Math.floor((W - reserved) / Math.max(1, groups.length + 2)) - 4))
  const compact = W < 900

  const click = (g: Group) => {
    if (!g.wins.length) return bridge.bar.launch(g.exe)
    if (g.wins.length === 1) return bridge.bar.click(g.wins[0].h, g.wins[0].min)
    // várias janelas: vai passando por elas
    const i = g.wins.findIndex((w) => w.h === fg)
    const next = g.wins[(i + 1) % g.wins.length]
    bridge.bar.click(next.h, true)
  }
  const pin = (g: Group) => bridge.bar.toMain(g.pinned ? { type: "unpin", path: g.exe } : { type: "pin", app: { path: g.exe, name: g.name } })
  const openMenu = (kind: BarMenu, el: HTMLElement, w: number, h: number) => {
    const r = el.getBoundingClientRect()
    bridge.bar.menu(kind, r.left + r.width / 2, w, h)
  }

  return (
    <div className="bar-bg fixed inset-0 flex items-center px-2 text-fg" onContextMenu={(e) => e.preventDefault()}>
      {/* esquerda: avisos do Agenda e busca */}
      <div className="flex w-[160px] shrink-0 items-center gap-1">
        <button className="bar-btn h-10 gap-1.5 px-2.5 text-sm" title="Busca rápida do Agenda (Ctrl+K)" onClick={() => bridge.bar.toMain({ type: "palette" })}>
          <Search size={16} /> {!compact && <span className="text-fg-muted">Pesquisar</span>}
        </button>
        <button className="bar-btn size-10" title="Assistente (IA)" onClick={() => bridge.bar.toMain({ type: "assistant" })}><Bot size={17} /></button>
      </div>

      {/* centro: Iniciar + programas */}
      <div ref={center} className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden">
        <button className="bar-btn shrink-0" style={{ width: size, height: size }} data-on={menu === "start"} title="Iniciar" onClick={(e) => openMenu("start", e.currentTarget, 640, 660)}>
          <Logo size={Math.round(size * 0.72)} />
        </button>
        {groups.map((g) => <AppBtn key={g.key} g={g} size={size} fg={fg} onClick={() => click(g)} onRight={() => pin(g)} />)}
      </div>

      {/* direita: bandeja, som, rede, avisos, relógio, mostrar área de trabalho */}
      <div className="flex shrink-0 items-center justify-end gap-0.5">
        <button className="bar-btn size-9" data-on={peek} title={peek ? "Esconder a bandeja do Windows" : "Mostrar a bandeja do Windows (ícones perto do relógio)"} onClick={() => { setPeek(!peek); bridge.bar.peek(!peek) }}>
          <ChevronUp size={16} className={cn("transition-transform", peek && "rotate-180")} />
        </button>
        {!compact && <button className="bar-btn size-9" title="Rede" onClick={() => bridge.bar.power("network")}><Wifi size={16} /></button>}
        {!compact && <button className="bar-btn size-9" title="Som" onClick={() => bridge.bar.power("volume")}><Volume2 size={16} /></button>}
        <button className="bar-btn size-9" title="Avisos do Agenda" onClick={() => bridge.bar.toMain({ type: "bell" })}>
          <Bell size={16} />
          {!!sync?.unread && <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--accent)] px-0.5 font-num text-[9px] text-white">{sync.unread > 9 ? "9+" : sync.unread}</span>}
        </button>
        <button className="bar-btn h-10 flex-col !items-end px-2.5 font-num leading-tight" data-on={menu === "clock"} onClick={(e) => openMenu("clock", e.currentTarget, 340, 400)}>
          <span className="text-[13px] font-semibold">{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="text-[11px] text-fg-muted">{now.toLocaleDateString("pt-BR")}</span>
        </button>
        <button className="ml-1 h-10 w-1.5 rounded-sm hover:bg-[color-mix(in_srgb,var(--fg)_25%,transparent)]" title="Mostrar a área de trabalho" onClick={() => bridge.bar.desktop()} />
      </div>
    </div>
  )
}
