import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Globe, Lock, Moon, Pin, Power, RotateCcw, Search, Settings } from "lucide-react"
import { bridge, type BarMenu } from "@/lib/bridge"
import { SECTIONS } from "@/components/sections-meta"
import { GlyphTile } from "@/components/Glyph"
import { cn } from "@/lib/utils"
import { iconPackAppSrc, type IconPackStyle } from "@/lib/iconPack"
import { exeKey, useBarSync } from "./sync"

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const done = () => bridge.bar.closeMenu()

function LnkIcon({ file, name, style }: { file: string; name: string; style: IconPackStyle }) {
  const [url, setUrl] = useState("")
  useEffect(() => { let ok = true; bridge.bar.icon(file).then((u) => ok && setUrl(u)); return () => { ok = false } }, [file])
  const packed = iconPackAppSrc(name, file, style)
  return packed ? <img src={packed} alt="" className="size-7" draggable={false} /> :
    url ? <img src={url} alt="" className="size-7" draggable={false} /> :
    <span className="size-7 rounded-md bg-[color-mix(in_srgb,var(--fg)_10%,transparent)]" />
}

function StartMenu() {
  const sync = useBarSync()
  const [apps, setApps] = useState<{ name: string; path: string }[]>([])
  const [q, setQ] = useState("")
  const [confirm, setConfirm] = useState<"" | "restart" | "shutdown">("")
  useEffect(() => { bridge.bar.apps().then(setApps) }, [])
  const query = norm(q.trim())
  const list = useMemo(() => (query ? apps.filter((a) => norm(a.name).includes(query)) : apps), [apps, query])
  const sections = query ? SECTIONS.filter((s) => norm(s.label).includes(query)) : SECTIONS
  const pinned = new Set((sync?.pins ?? []).map((p) => exeKey(p.path)))
  const launch = (p: string) => { bridge.bar.launch(p); done() }
  const web = () => { bridge.bar.web(q); done() }
  const power = (k: "lock" | "sleep" | "restart" | "shutdown") => {
    if ((k === "restart" || k === "shutdown") && confirm !== k) return setConfirm(k)
    bridge.bar.power(k); done()
  }

  return (
    <div className="flex h-full flex-col p-4" onKeyDown={(e) => {
      if (e.key === "Escape") done()
      if (e.key === "Enter" && query) { if (sections[0]) { bridge.bar.toMain({ type: "open", id: sections[0].id }); done() } else if (list[0]) launch(list[0].path); else web() }
    }}>
      <label className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-line bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] px-4">
        <Search size={15} className="text-fg-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar apps e abas do Widgy" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>

      {sections.length > 0 && (
        <>
          <div className="mt-4 mb-2 text-xs font-semibold text-fg-muted">Widgy</div>
          <div className="grid shrink-0 grid-cols-6 gap-1">
            {sections.map((s) => (
              <button key={s.id} className="bar-btn flex-col gap-1.5 py-2.5 text-[11px]" onClick={() => { bridge.bar.toMain({ type: "open", id: s.id }); done() }}>
                <GlyphTile icon={s.icon} color={s.color} size={32} />
                <span className="w-full truncate px-0.5">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 mb-2 flex items-center text-xs font-semibold text-fg-muted">Programas <span className="ml-auto font-normal">clique direito: fixar na barra</span></div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="grid grid-cols-2 gap-0.5">
          {list.map((a) => (
            <button
              key={a.path}
              className="bar-btn !justify-start gap-2.5 px-2 py-1.5 text-left text-sm"
              onClick={() => launch(a.path)}
              onContextMenu={(e) => { e.preventDefault(); bridge.bar.toMain(pinned.has(exeKey(a.path)) ? { type: "unpin", path: a.path } : { type: "pin", app: { path: a.path, name: a.name } }) }}
            >
              <LnkIcon file={a.path} name={a.name} style={sync?.icons?.iconPackStyle ?? "original"} />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              {pinned.has(exeKey(a.path)) && <Pin size={12} className="shrink-0 text-fg-muted" />}
            </button>
          ))}
        </div>
        {!list.length && !query && <div className="py-6 text-center text-sm text-fg-muted">Carregando…</div>}
        {query && (
          <button className="bar-btn mt-1 w-full !justify-start gap-2.5 px-2 py-2 text-left text-sm" onClick={web}>
            <span className="flex size-7 items-center justify-center"><Globe size={17} className="text-fg-muted" /></span>
            <span className="min-w-0 flex-1 truncate">Pesquisar <b>{q.trim()}</b> na web</span>
          </button>
        )}
      </div>

      <div className="mt-3 flex shrink-0 items-center gap-1 border-t border-line pt-3">
        <button className="bar-btn gap-2 px-3 py-2 text-sm" onClick={() => { bridge.bar.power("settings"); done() }}><Settings size={15} /> Configurações do Windows</button>
        <div className="flex-1" />
        {confirm && <span className="mr-1 text-xs text-fg-muted">Clique de novo para {confirm === "restart" ? "reiniciar" : "desligar"}</span>}
        <button className="bar-btn size-9" title="Bloquear" onClick={() => power("lock")}><Lock size={15} /></button>
        <button className="bar-btn size-9" title="Suspender" onClick={() => power("sleep")}><Moon size={15} /></button>
        <button className={cn("bar-btn size-9", confirm === "restart" && "!bg-amber-500/30")} title="Reiniciar" onClick={() => power("restart")}><RotateCcw size={15} /></button>
        <button className={cn("bar-btn size-9", confirm === "shutdown" && "!bg-red-500/40")} title="Desligar" onClick={() => power("shutdown")}><Power size={15} /></button>
      </div>
    </div>
  )
}

function ClockMenu() {
  useBarSync()
  const [now, setNow] = useState(new Date())
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  const first = month.getDay()
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const isToday = (d: number) => d === now.getDate() && month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear()
  return (
    <div className="flex h-full flex-col p-5" onKeyDown={(e) => e.key === "Escape" && done()} tabIndex={-1}>
      <div className="font-num text-4xl font-semibold">{now.toLocaleTimeString("pt-BR")}</div>
      <div className="mb-4 text-sm text-fg-muted capitalize">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div className="mb-2 flex items-center">
        <div className="flex-1 text-sm font-semibold capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</div>
        <button className="bar-btn size-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={15} /></button>
        <button className="bar-btn size-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="py-1 text-fg-muted">{d}</div>)}
        {cells.map((d, i) => (
          <div key={i} className={cn("flex aspect-square items-center justify-center rounded-full font-num", d && isToday(d) && "bg-[var(--accent)] font-semibold text-white")}>{d ?? ""}</div>
        ))}
      </div>
    </div>
  )
}

export function BarMenuView({ kind }: { kind: BarMenu }) {
  return <div className="bar-bg fixed inset-0 text-fg">{kind === "clock" ? <ClockMenu /> : <StartMenu />}</div>
}
