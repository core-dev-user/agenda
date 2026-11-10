import { useEffect, useRef } from "react"
import { ArrowLeft, ExternalLink, Globe, Home, Loader2, MonitorDown, RotateCw } from "lucide-react"
import { bridge, type WebAppId } from "@/lib/bridge"
import { useEmbedSlot, useWebApps } from "@/lib/webapps"

const INFO: Record<WebAppId, { name: string; logo: string; bg: string; hint: string }> = {
  discord: { name: "Discord", logo: "logos/discord.svg", bg: "#313338", hint: "Fechar esta janela não te tira da call: o Discord continua rodando em segundo plano. Use o widget do Discord para mutar ou sair." },
  whatsapp: { name: "WhatsApp", logo: "logos/whatsapp.svg", bg: "#111b21", hint: "Na primeira vez, leia o QR code com o celular (WhatsApp > Aparelhos conectados). O login fica salvo e as mensagens chegam mesmo com a janela fechada." },
  ifood: { name: "iFood", logo: "logos/ifood.svg", bg: "#ffffff", hint: "Faça seu pedido aqui; o widget do iFood acompanha o status pela página de pedidos da sua conta." },
}

/** Janela de um app web (Discord / iFood) dentro do Widgy, com opção de janela separada. */
function WebAppView({ id }: { id: WebAppId }) {
  const st = useWebApps((s) => s[id])
  const slot = useRef<HTMLDivElement>(null)
  const info = INFO[id]
  useEffect(() => { bridge.webapp.open(id) }, [id])
  useEmbedSlot(id, slot, !st?.popped)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <div className="flex-1" />
        <button className="btn btn-ghost btn-icon" title="Voltar" onClick={() => bridge.webapp.nav(id, "back")}><ArrowLeft size={15} /></button>
        <button className="btn btn-ghost btn-icon" title="Recarregar" onClick={() => bridge.webapp.nav(id, "reload")}><RotateCw size={14} /></button>
        <button className="btn btn-ghost btn-icon" title="Início" onClick={() => bridge.webapp.nav(id, "home")}><Home size={14} /></button>
        <button className="btn btn-ghost btn-icon" title="Abrir esta página no seu navegador" onClick={async () => { const u = await bridge.webapp.url(id); if (u) bridge.app.openExternal(u) }}><Globe size={14} /></button>
        {st?.popped ? (
          <button className="btn" onClick={() => bridge.webapp.dock(id)}><MonitorDown size={14} /> Trazer para o Widgy</button>
        ) : (
          <button className="btn" onClick={() => bridge.webapp.popout(id)}><ExternalLink size={14} /> Abrir em janela separada</button>
        )}
      </div>
      <div className="relative min-h-0 flex-1 p-3">
        {st?.popped ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[calc(var(--r)*0.6)] border border-line text-center">
            <img src={info.logo} className="h-24 w-24 rounded-[22px] shadow-xl" draggable={false} />
            <div>
              <div className="font-display text-xl font-semibold">{info.name} está numa janela separada</div>
              <div className="mt-1 text-sm text-fg-muted">Fechar aquela janela traz ele de volta para cá, sem desconectar.</div>
            </div>
            <button className="btn btn-accent" onClick={() => bridge.webapp.dock(id)}><MonitorDown size={15} /> Trazer para o Widgy</button>
          </div>
        ) : (
          <div ref={slot} className="flex h-full items-center justify-center overflow-hidden rounded-[calc(var(--r)*0.6)] text-fg-muted" style={{ background: info.bg }}>
            <Loader2 className="mr-2 animate-spin" size={18} /> Carregando o {info.name}…
          </div>
        )}
      </div>
      <div className="border-t border-line px-4 py-1.5 text-xs text-fg-muted">{info.hint}</div>
    </div>
  )
}

export function DiscordView() { return <WebAppView id="discord" /> }
export function IfoodView() { return <WebAppView id="ifood" /> }
export function WhatsappView() { return <WebAppView id="whatsapp" /> }
