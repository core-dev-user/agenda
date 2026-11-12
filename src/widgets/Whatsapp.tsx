import { useEffect, useState } from "react"
import { perfPaused } from "@/lib/perf"
import { bridge, type WhatsRead } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

const GREEN = "#25D366"

/** Widget do WhatsApp: conversas (não lidas primeiro). Clicar abre a conversa no app WhatsApp do Agenda. */
export function WhatsappWidget({ w }: { w: Widget }) {
  const open = useStore((s) => s.openWindow)
  const [data, setData] = useState<WhatsRead | null>(null)
  const [nativeError, setNativeError] = useState(false)
  useEffect(() => {
    let alive = true
    const fetchNow = () => bridge.webapp.whatsapp().then((r) => alive && setData(r)).catch(() => {})
    /* com o Widgy escondido ou em pausa (jogo em foco) ninguém está vendo: não acorda a página do serviço */
    const load = () => { if (!document.hidden && !perfPaused()) void fetchNow() }
    void fetchNow()
    const id = setInterval(load, 4000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  const onlyUnread = !!w.config.onlyUnread

  const header = (
    <div className="flex items-center gap-2">
      <img src="logos/whatsapp.svg" className="h-6 w-6 rounded-md" draggable={false} />
      <div className="flex-1 text-sm font-semibold">WhatsApp</div>
      {!!data?.totalUnread && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-black" style={{ background: GREEN }}>{data.totalUnread}</span>}
    </div>
  )

  if (!data || data.loading)
    return <div className="flex h-full flex-col gap-3 p-3.5">{header}<div className="flex flex-1 items-center justify-center text-sm text-fg-muted"><span className="animate-pulse">Abrindo o WhatsApp…</span></div></div>
  if (!data.loggedIn)
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-fg-muted">
          <span>{data.unsupported
            ? "O WhatsApp Web recusou o navegador incorporado. Abra o painel para tentar novamente."
            : data.nativeOpen
              ? "O WhatsApp do PC já está aberto. Para mostrar conversas aqui, conecte o Widgy uma vez pelo QR."
              : "Conecte o Widgy uma vez pelo QR Code. A sessão ficará salva neste computador."}</span>
          <button type="button" className="btn !py-1 text-xs text-black" style={{ background: GREEN, borderColor: GREEN }}
            onClick={() => { void bridge.webapp.nav("whatsapp", "home"); open("whatsapp") }}>
            {data.unsupported ? "Tentar novamente no Widgy" : "Conectar pelo QR Code"}
          </button>
          <button type="button" className="btn btn-ghost !py-1 text-xs"
            onClick={() => { void bridge.webapp.whatsappNative().then((ok) => setNativeError(!ok)) }}>
            {data.nativeOpen ? "Ir para o WhatsApp do PC" : "Abrir WhatsApp do PC"}
          </button>
          {nativeError && <span className="text-[11px]">Não foi possível abrir o aplicativo instalado.</span>}
        </div>
      </div>
    )

  let chats = [...data.chats].sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0))
  if (onlyUnread) chats = chats.filter((c) => c.unread > 0)
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {header}
      <div className="min-h-0 flex-1 overflow-auto" data-nodrag>
        {chats.length === 0 && <div className="p-4 text-center text-sm text-fg-muted">{onlyUnread ? "Nenhuma mensagem nova." : "Nenhuma conversa na lista."}</div>}
        {chats.map((c) => (
          <button
            key={c.name}
            onClick={() => { bridge.webapp.whatsappOpen(c.name); open("whatsapp") }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_7%,transparent)]"
          >
            {c.avatar ? <img src={c.avatar} className="h-9 w-9 shrink-0 rounded-full object-cover" draggable={false} /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2a3942] font-semibold text-white">{c.name[0]?.toUpperCase()}</div>}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", c.unread > 0 && "font-semibold")}>{c.name}</span>
                <span className={cn("shrink-0 text-[10px]", c.unread > 0 ? "font-semibold" : "text-fg-muted")} style={c.unread > 0 ? { color: GREEN } : undefined}>{c.time}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-xs", c.unread > 0 ? "text-fg" : "text-fg-muted")}>{c.last}</span>
                {c.unread > 0 && <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-black" style={{ background: GREEN }}>{c.unread}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
