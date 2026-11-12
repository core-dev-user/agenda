import { useEffect, useId, useState, type ReactNode } from "react"
import { Cpu, HardDrive, MemoryStick, Monitor, Network, Thermometer, Zap } from "lucide-react"
import { bridge, type SysStats } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Segmented, Switch } from "@/components/ui/controls"

/* ---------- dados compartilhados entre todos os widgets de desempenho ---------- */
const HIST = 60
let latest: SysStats | null = null
const hist: Record<"cpu" | "gpu" | "ram" | "vram" | "net" | "disk", number[]> = { cpu: [], gpu: [], ram: [], vram: [], net: [], disk: [] }
const listeners = new Set<() => void>()
let off: (() => void) | null = null
const push = (k: keyof typeof hist, v: number | null | undefined) => {
  if (v == null || Number.isNaN(v)) return
  hist[k].push(v)
  if (hist[k].length > HIST) hist[k].shift()
}
function ensure() {
  if (off) return
  off = bridge.sysmon.onData((d) => {
    latest = d
    push("cpu", d.cpu.usage)
    push("ram", (d.mem.used / d.mem.total) * 100)
    push("gpu", d.gpu?.usage)
    if (d.gpu?.memUsed != null && d.gpu.memTotal) push("vram", (d.gpu.memUsed / d.gpu.memTotal) * 100)
    if (d.net) push("net", d.net.rx + d.net.tx)
    if (d.disk) push("disk", d.disk.busy)
    listeners.forEach((f) => f())
  })
}
export function useSysStats() {
  const id = useId()
  const [, force] = useState(0)
  useEffect(() => {
    ensure()
    const f = () => force((n) => n + 1)
    listeners.add(f)
    bridge.sysmon.sub(id)
    return () => {
      listeners.delete(f)
      bridge.sysmon.unsub(id)
    }
  }, [id])
  return { d: latest, hist }
}

/* ---------- formatação ---------- */
const GB = 1024 ** 3
export const fmtGB = (b: number) => (b / GB >= 100 ? Math.round(b / GB) : (b / GB).toFixed(1)) + " GB"
const fmtRate = (b: number) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB/s" : b >= 1024 ? Math.round(b / 1024) + " KB/s" : Math.round(b) + " B/s")
const fmtUp = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m} min` }
const shortCpu = (n?: string) => (n ?? "CPU").replace(/\(R\)|\(TM\)|CPU|Processor|\d+-Core/gi, "").replace(/@.*$/, "").replace(/\s+/g, " ").trim()
const shortGpu = (n?: string) => (n ?? "GPU").replace(/NVIDIA |GeForce |AMD |Radeon\(TM\) |Graphics/gi, "").trim() || "GPU"

/** cor pela carga (verde → âmbar → vermelho) ou a cor de destaque do tema */
function loadColor(p: number, mode: string) {
  if (mode !== "load") return "var(--wacc, var(--accent))"
  return p < 50 ? "#5ee3a1" : p < 80 ? "#ffc15e" : "#ff6b6b"
}

export type MetricKey = "cpu" | "gpu" | "ram" | "vram" | "temp" | "disk" | "net" | "drives" | "top" | "uptime"
export const METRICS: { k: MetricKey; label: string }[] = [
  { k: "cpu", label: "Processador (CPU)" },
  { k: "gpu", label: "Placa de vídeo (GPU)" },
  { k: "ram", label: "Memória RAM" },
  { k: "vram", label: "Memória da GPU (VRAM)" },
  { k: "temp", label: "Temperatura e energia da GPU" },
  { k: "disk", label: "Atividade do disco" },
  { k: "net", label: "Rede (download/upload)" },
  { k: "drives", label: "Espaço nos discos" },
  { k: "top", label: "O que mais usa memória" },
  { k: "uptime", label: "Tempo ligado" },
]
const DEFAULT_ON: MetricKey[] = ["cpu", "gpu", "ram", "temp"]

/* ---------- peças visuais ---------- */
function Spark({ data, color, h = 28, fill = true }: { data: number[]; color: string; h?: number; fill?: boolean }) {
  const max = Math.max(100, ...data)
  if (data.length < 2) return <div style={{ height: h }} />
  const pts = data.map((v, i) => `${(i / (HIST - 1)) * 100},${h - (v / max) * (h - 2) - 1}`)
  const off = ((HIST - data.length) / (HIST - 1)) * 100
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }}>
      <g transform={`translate(${off} 0) scale(${(100 - off) / 100} 1)`}>
        {fill && <polygon points={`0,${h} ${pts.join(" ")} 100,${h}`} fill={color} opacity={0.16} />}
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

function Ring({ value, label, sub, color, size }: { value: number | null; label: string; sub?: string; color: string; size: number }) {
  const r = 42, c = 2 * Math.PI * r
  const v = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="color-mix(in srgb, var(--fg) 12%, transparent)" strokeWidth="7" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1), stroke .4s" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-num font-semibold leading-none" style={{ fontSize: size * 0.24 }}>{value == null ? "–" : Math.round(v)}<span style={{ fontSize: size * 0.12 }} className="text-fg-muted">%</span></span>
        </div>
      </div>
      <div className="text-[11px] font-semibold tracking-wide uppercase">{label}</div>
      {sub && <div className="max-w-full truncate text-[10px] text-fg-muted">{sub}</div>}
    </div>
  )
}

function Row({ icon, label, value, pct, color, data, detail }: { icon: ReactNode; label: string; value: string; pct?: number | null; color: string; data?: number[]; detail?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-fg-muted">{icon}</span>
        <span className="font-medium">{label}</span>
        {detail && <span className="min-w-0 flex-1 truncate text-[10px] text-fg-muted">{detail}</span>}
        <span className={cn("font-num font-semibold", !detail && "ml-auto")}>{value}</span>
      </div>
      {data && data.length > 1 ? (
        <Spark data={data} color={color} h={22} />
      ) : pct != null ? (
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 12%, transparent)" }}>
          {/* a barra cheia desliza para dentro da trilha (transform): mesmo efeito de antes, mas animado pela
              placa de vídeo. Animar a largura refazia o layout do widget a cada quadro, a cada leitura. */}
          <div className="h-full w-full rounded-full" style={{ transform: `translateX(${Math.max(2, Math.min(100, pct)) - 100}%)`, background: color, transition: "transform .8s cubic-bezier(.2,.8,.2,1), background-color .4s" }} />
        </div>
      ) : null}
    </div>
  )
}

/* ---------- widget ---------- */
export function SysMonWidget({ w }: { w: Widget }) {
  const { d, hist: H } = useSysStats()
  const c = w.config
  const style: string = c.style ?? "rings"
  const mode: string = c.colorMode ?? "accent"
  const on = new Set<MetricKey>(c.metrics ?? DEFAULT_ON)
  if (!d) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-fg-muted">
        <Cpu size={22} className="animate-pulse" />
        Lendo o desempenho do PC…
      </div>
    )
  }
  const cpu = d.cpu.usage
  const ram = (d.mem.used / d.mem.total) * 100
  const gpu = d.gpu?.usage ?? null
  const vram = d.gpu?.memUsed != null && d.gpu.memTotal ? (d.gpu.memUsed / d.gpu.memTotal) * 100 : null
  const gpuSub = [d.gpu?.temp != null && on.has("temp") ? `${d.gpu.temp}°C` : null, d.gpu?.power != null && on.has("temp") ? `${Math.round(d.gpu.power)} W` : null].filter(Boolean).join(" · ")

  const extras = (
    <>
      {on.has("vram") && style !== "rings" && vram != null && (
        <Row icon={<Monitor size={13} />} label="VRAM" value={`${(d.gpu!.memUsed! / 1024).toFixed(1)} / ${(d.gpu!.memTotal! / 1024).toFixed(0)} GB`} pct={vram} color={loadColor(vram, mode)} />
      )}
      {on.has("disk") && d.disk && (
        <Row icon={<HardDrive size={13} />} label="Disco" detail={`L ${fmtRate(d.disk.read)} · G ${fmtRate(d.disk.write)}`} value={`${Math.round(d.disk.busy)}%`} pct={d.disk.busy} color={loadColor(d.disk.busy, mode)} />
      )}
      {on.has("net") && d.net && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-fg-muted"><Network size={13} /></span>
            <span className="font-medium">Rede</span>
            <span className="ml-auto font-num text-[11px]">↓ {fmtRate(d.net.rx)}</span>
            <span className="font-num text-[11px] text-fg-muted">↑ {fmtRate(d.net.tx)}</span>
          </div>
          {style === "graph" && <Spark data={H.net.map((v) => (v / Math.max(1, ...H.net)) * 100)} color="var(--wacc, var(--accent))" h={20} />}
        </div>
      )}
      {on.has("drives") && d.drives.map((dr) => {
        const used = ((dr.size - dr.free) / dr.size) * 100
        return <Row key={dr.id} icon={<HardDrive size={13} />} label={dr.id} detail={`${fmtGB(dr.free)} livres`} value={`${Math.round(used)}%`} pct={used} color={loadColor(used, mode)} />
      })}
      {on.has("top") && d.top.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Mais memória</div>
          {d.top.slice(0, c.topCount ?? 3).map((p) => (
            <div key={p.name} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-num text-fg-muted">{p.mem >= GB ? (p.mem / GB).toFixed(1) + " GB" : Math.round(p.mem / 1048576) + " MB"}</span>
            </div>
          ))}
        </div>
      )}
      {on.has("uptime") && <div className="text-[11px] text-fg-muted">Ligado há {fmtUp(d.uptime)}</div>}
    </>
  )

  if (style === "compact") {
    const items = [
      on.has("cpu") && ["CPU", cpu],
      on.has("gpu") && gpu != null && ["GPU", gpu],
      on.has("ram") && ["RAM", ram],
      on.has("vram") && vram != null && ["VRAM", vram],
    ].filter(Boolean) as [string, number][]
    return (
      <div className="flex h-full items-center justify-around gap-2 px-3">
        {items.map(([l, v]) => (
          <div key={l} className="flex flex-col items-center">
            <span className="font-num text-2xl font-semibold leading-none" style={{ color: mode === "load" ? loadColor(v, mode) : undefined }}>{Math.round(v)}<span className="text-xs text-fg-muted">%</span></span>
            <span className="mt-1 text-[10px] font-semibold tracking-widest text-fg-muted">{l}</span>
          </div>
        ))}
        {on.has("temp") && d.gpu?.temp != null && (
          <div className="flex flex-col items-center">
            <span className="font-num text-2xl font-semibold leading-none">{d.gpu.temp}<span className="text-xs text-fg-muted">°</span></span>
            <span className="mt-1 text-[10px] font-semibold tracking-widest text-fg-muted">GPU</span>
          </div>
        )}
      </div>
    )
  }

  if (style === "rings") {
    type R = { k: string; value: number | null; label: string; sub?: string; color: string }
    const rings = [
      on.has("cpu") && { k: "cpu", value: cpu, label: "CPU", sub: `${(d.cpu.speed / 1000).toFixed(1)} GHz`, color: loadColor(cpu, mode) },
      on.has("gpu") && d.gpu && { k: "gpu", value: gpu, label: "GPU", sub: gpuSub || shortGpu(d.gpu.name), color: loadColor(gpu ?? 0, mode) },
      on.has("ram") && { k: "ram", value: ram, label: "RAM", sub: `${fmtGB(d.mem.used)} de ${fmtGB(d.mem.total)}`, color: loadColor(ram, mode) },
      on.has("vram") && vram != null && { k: "vram", value: vram, label: "VRAM", sub: `${(d.gpu!.memUsed! / 1024).toFixed(1)} GB`, color: loadColor(vram, mode) },
    ].filter(Boolean) as R[]
    const n = Math.max(1, rings.length)
    const size = Math.max(54, Math.min((w.w - 28) / n - 12, w.h * 0.42, 130))
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {c.showTitle !== false && <Header d={d} />}
        <div className="flex justify-around gap-2">{rings.map((r) => <Ring key={r.k} value={r.value} label={r.label} sub={r.sub} color={r.color} size={size} />)}</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden">{extras}</div>
      </div>
    )
  }

  // "bars" e "graph"
  const graph = style === "graph"
  return (
    <div className="flex h-full flex-col gap-2.5 overflow-hidden p-3.5">
      {c.showTitle !== false && <Header d={d} />}
      {on.has("cpu") && <Row icon={<Cpu size={13} />} label="CPU" detail={shortCpu(d.cpu.name)} value={`${Math.round(cpu)}%`} pct={cpu} color={loadColor(cpu, mode)} data={graph ? H.cpu : undefined} />}
      {on.has("gpu") && d.gpu && <Row icon={<Monitor size={13} />} label="GPU" detail={shortGpu(d.gpu.name)} value={gpu == null ? "–" : `${Math.round(gpu)}%`} pct={gpu} color={loadColor(gpu ?? 0, mode)} data={graph ? H.gpu : undefined} />}
      {on.has("temp") && d.gpu && (d.gpu.temp != null || d.gpu.power != null) && (
        <div className="flex gap-3 text-xs">
          {d.gpu.temp != null && <span className="flex items-center gap-1"><Thermometer size={13} className="text-fg-muted" /><span className="font-num font-semibold" style={{ color: mode === "load" ? loadColor(((d.gpu.temp - 30) / 55) * 100, mode) : undefined }}>{d.gpu.temp}°C</span></span>}
          {d.gpu.power != null && <span className="flex items-center gap-1"><Zap size={13} className="text-fg-muted" /><span className="font-num font-semibold">{Math.round(d.gpu.power)} W</span>{d.gpu.powerLimit ? <span className="text-fg-muted">/ {Math.round(d.gpu.powerLimit)}</span> : null}</span>}
          {d.gpu.fan != null && <span className="text-fg-muted">ventoinha <span className="font-num text-fg">{d.gpu.fan}%</span></span>}
        </div>
      )}
      {on.has("ram") && <Row icon={<MemoryStick size={13} />} label="RAM" detail={`${fmtGB(d.mem.used)} de ${fmtGB(d.mem.total)}`} value={`${Math.round(ram)}%`} pct={ram} color={loadColor(ram, mode)} data={graph ? H.ram : undefined} />}
      {extras}
    </div>
  )
}

function Header({ d }: { d: SysStats }) {
  return (
    <div className="flex items-center gap-2">
      <Cpu size={15} className="text-fg-muted" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shortCpu(d.cpu.name)}</span>
      {d.gpu && <span className="truncate text-[11px] text-fg-muted">{shortGpu(d.gpu.name)}</span>}
    </div>
  )
}

const COMPACT_METRICS: MetricKey[] = ["cpu", "gpu", "ram", "vram", "temp"]

export function SysMonSettings({ w, set }: { w: Widget; set: (p: Record<string, any>) => void }) {
  const c = w.config
  const on = new Set<MetricKey>(c.metrics ?? DEFAULT_ON)
  const toggle = (k: MetricKey, v: boolean) => {
    const n = new Set(on)
    if (v) n.add(k); else n.delete(k)
    set({ metrics: METRICS.map((m) => m.k).filter((x) => n.has(x)) })
  }
  return (
    <>
      <div className="text-sm text-fg-muted">Estilo</div>
      <Segmented value={c.style ?? "rings"} onChange={(v) => set({ style: v })} options={[{ value: "rings", label: "Anéis" }, { value: "bars", label: "Barras" }, { value: "graph", label: "Gráficos" }, { value: "compact", label: "Compacto" }]} />
      <div className="text-sm text-fg-muted">Cor</div>
      <Segmented value={c.colorMode ?? "accent"} onChange={(v) => set({ colorMode: v })} options={[{ value: "accent", label: "Cor de destaque" }, { value: "load", label: "Pela carga (verde → vermelho)" }]} />
      <div className="text-sm text-fg-muted">O que mostrar</div>
      <div className="grid grid-cols-2 gap-x-4">
        {METRICS.filter((m) => c.style !== "compact" || COMPACT_METRICS.includes(m.k)).map((m) => <Switch key={m.k} label={m.label} checked={on.has(m.k)} onChange={(v) => toggle(m.k, v)} />)}
      </div>
      {c.style === "compact" && <div className="text-xs text-fg-muted">O estilo compacto mostra só os números principais. Disco, rede e o resto aparecem nos outros estilos.</div>}
      {c.style !== "compact" && <Switch label="Mostrar o nome do processador no topo" checked={c.showTitle !== false} onChange={(v) => set({ showTitle: v })} />}
      <div className="text-xs text-fg-muted">Atualiza a cada 1,5 s e só enquanto o widget está na tela. Temperatura, energia e ventoinha vêm da placa NVIDIA. A temperatura do processador o Windows não informa sem programas extras.</div>
    </>
  )
}
