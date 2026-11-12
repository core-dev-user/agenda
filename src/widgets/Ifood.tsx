import { useEffect, useState } from "react"
import { perfPaused } from "@/lib/perf"
import { RefreshCw, Map as MapIcon } from "lucide-react"
import { bridge, type IfoodOrder, type IfoodRead } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

const RED = "#EA1D2C"
const STEPS = [
  { key: "confirmado", label: "Confirmado", re: /aguardando|confirmad/i },
  { key: "preparo", label: "Preparando", re: /preparo|preparando|pronto/i },
  { key: "caminho", label: "A caminho", re: /saiu|caminho|chegando|chegou/i },
  { key: "entregue", label: "Entregue", re: /entregue|conclu/i },
]
const stepOf = (s: string) => {
  let k = -1
  STEPS.forEach((st, i) => { if (st.re.test(s)) k = i })
  return k
}
const isActive = (o: IfoodOrder) => !/entregue|conclu|cancelad/i.test(o.status)

/** Widget do iFood: acompanha o pedido em andamento e mostra os últimos. */
export function IfoodWidget({ w }: { w: Widget }) {
  const open = useStore((s) => s.openWindow)
  const [data, setData] = useState<IfoodRead | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setBusy(true)
    bridge.webapp.ifoodOrders().then((r) => alive && setData(r)).catch(() => {}).finally(() => alive && setBusy(false))
    return () => { alive = false }
  }, [tick])
  const active = data?.orders.find(isActive)
  // mapa do motoboy: foto da área do mapa da página de acompanhamento, atualizada a cada 6 s
  const [map, setMap] = useState<string | null>(null)
  const rectKey = data?.mapRect ? JSON.stringify(data.mapRect) : ""
  useEffect(() => {
    if (!data?.mapRect) { setMap(null); return }
    let alive = true
    const fetchNow = () => bridge.webapp.ifoodMap(data.mapRect!).then((m) => alive && m && setMap(m)).catch(() => {})
    /* com o Widgy escondido ou em pausa (jogo em foco) ninguém está vendo: não acorda a página do serviço */
    const snap = () => { if (!document.hidden && !perfPaused()) void fetchNow() }
    void fetchNow()
    const id = setInterval(snap, 6000)
    return () => { alive = false; clearInterval(id) }
  }, [rectKey])
  // só lê a página aberta no app iFood (rápido e sem tráfego extra): a cada 15 s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), data?.loading ? 3000 : 15_000)
    return () => clearInterval(id)
  }, [!!data?.loading])
  const seeOrders = () => { bridge.webapp.nav("ifood", "https://www.ifood.com.br/pedidos"); open("ifood") }

  const header = (
    <div className="flex items-center gap-2">
      <img src="logos/ifood.svg" className="h-6 w-6 rounded-md" draggable={false} />
      <div className="flex-1 text-sm font-semibold">Pedidos</div>
      <button className="btn btn-ghost btn-icon !p-1" title="Atualizar" onClick={() => setTick((t) => t + 1)}><RefreshCw size={12} className={cn(busy && "animate-spin")} /></button>
    </div>
  )

  if (!data)
    return <div className="flex h-full flex-col gap-3 p-3.5">{header}<div className="flex flex-1 items-center justify-center text-sm text-fg-muted"><span className="animate-pulse">Olhando seus pedidos…</span></div></div>

  if (data.check)
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-fg-muted">
          O iFood pediu uma verificação de segurança. Abra o iFood e confirme (é só uma vez de vez em quando).
          <button className="btn !py-1 text-xs text-white" style={{ background: RED, borderColor: RED }} onClick={() => open("ifood")}>Abrir o iFood</button>
        </div>
      </div>
    )

  if (data.loggedOut)
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-fg-muted">
          Entre na sua conta do iFood uma vez e o login fica salvo.
          <button className="btn !py-1 text-xs text-white" style={{ background: RED, borderColor: RED }} onClick={() => open("ifood")}>Entrar no iFood</button>
        </div>
      </div>
    )

  const rest = data.orders.filter((o) => o !== active)
  return (
    <div className="flex h-full flex-col gap-2.5 p-3.5">
      {header}
      {active ? (
        <button className="rounded-[calc(var(--r)*0.6)] p-3 text-left" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${RED} 30%, transparent), color-mix(in srgb, ${RED} 8%, transparent))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${RED} 35%, transparent)` }} onClick={() => open("ifood")}>
          <div className="flex items-center gap-2.5">
            {active.img ? <img src={active.img} className="h-10 w-10 rounded-full bg-white object-cover" draggable={false} /> : <div className="h-10 w-10 rounded-full" style={{ background: RED }} />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{active.name}</div>
              <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#ff5a63" }}>
                <span className="relative inline-flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-[#ff5a63] opacity-70" /><span className="relative h-2 w-2 rounded-full bg-[#ff5a63]" /></span>
                {active.status.replace(/^./, (c) => c.toUpperCase())}
              </div>
            </div>
          </div>
          {/* etapas */}
          <div className="mt-3 flex items-center gap-1">
            {STEPS.map((s, i) => {
              const k = stepOf(active.status)
              return (
                <div key={s.key} className="flex-1">
                  <div className="h-1.5 rounded-full transition-colors" style={{ background: i <= k ? RED : "color-mix(in srgb, var(--fg) 15%, transparent)" }} />
                  <div className={cn("mt-1 truncate text-center text-[9px]", i === k ? "font-semibold text-fg" : "text-fg-muted")}>{s.label}</div>
                </div>
              )
            })}
          </div>
          {active.when && <div className="mt-1.5 text-[11px] text-fg-muted">{active.when}</div>}
        </button>
      ) : null}
      {map ? (
        <button className="relative overflow-hidden rounded-[calc(var(--r)*0.6)] border border-line" style={{ height: Math.max(120, Math.min(260, w.h * 0.42)) }} onClick={() => open("ifood")} title="Abrir o acompanhamento no iFood">
          <img src={map} className="h-full w-full object-cover" draggable={false} />
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            <span className="relative inline-flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#ff5a63]" /><span className="relative h-1.5 w-1.5 rounded-full bg-[#ff5a63]" /></span> Onde está o entregador
          </span>
        </button>
      ) : active && !data.onOrders ? (
        <button className="btn !py-1 text-xs" onClick={() => { const o = active; if (o.link) bridge.webapp.nav("ifood", o.link); else bridge.webapp.nav("ifood", "https://www.ifood.com.br/pedidos"); open("ifood") }}><MapIcon size={12} /> Ver o mapa do entregador</button>
      ) : null}
      {!active && (
        <div className="rounded-[calc(var(--r)*0.6)] border border-line p-3 text-center text-sm text-fg-muted">
          {data.onOrders ? "Nenhum pedido a caminho." : "Depois de pedir, o acompanhamento aparece aqui sozinho."}
          <div className="mt-2 flex gap-1.5">
            <button className="btn flex-1 !py-1 text-xs text-white" style={{ background: RED, borderColor: RED }} onClick={() => open("ifood")}>Pedir no iFood</button>
            {!data.onOrders && <button className="btn flex-1 !py-1 text-xs" onClick={seeOrders}>Ver meus pedidos</button>}
          </div>
        </div>
      )}
      {w.h >= 260 && rest.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto" data-nodrag>
          <div className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-fg-muted uppercase">Últimos pedidos</div>
          {rest.map((o, i) => (
            <button key={i} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]" onClick={() => { if (o.link) bridge.webapp.nav("ifood", o.link); open("ifood") }}>
              {o.img ? <img src={o.img} className="h-7 w-7 rounded-full bg-white object-cover" draggable={false} /> : <div className="h-7 w-7 rounded-full bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px]">{o.name}</div>
                <div className="truncate text-[11px] text-fg-muted">{o.status}{o.when ? ` · ${o.when}` : ""}</div>
              </div>
              {o.price && <span className="font-num text-xs">{o.price}</span>}
            </button>
          ))}
        </div>
      )}
      {data.orders.length === 0 && w.h >= 260 && <div className="text-center text-[11px] text-fg-muted">O widget lê a página de pedidos/acompanhamento aberta no app iFood do Agenda.</div>}
    </div>
  )
}
