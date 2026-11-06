import { useEffect } from "react"
import { motion } from "framer-motion"
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react"
import { bridge } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import { useWebApps } from "@/lib/webapps"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

const BLURPLE = "#5865F2"

/** Widget do Discord: só a call em que você está, com mutar, ensurdecer e sair. */
export function DiscordWidget({ w }: { w: Widget }) {
  const st = useWebApps((s) => s.discord)
  const open = useStore((s) => s.openWindow)
  const d = st?.discord
  // com o widget na tela, o Discord fica carregado em segundo plano e é lido rápido
  useEffect(() => {
    bridge.webapp.watch("discord", true)
    return () => { bridge.webapp.watch("discord", false) }
  }, [])

  const header = (
    <div className="flex items-center gap-2">
      <img src="logos/discord.svg" className="h-6 w-6 rounded-md" draggable={false} />
      <div className="min-w-0 flex-1">
        {d?.inCall ? (
          <>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3ba55d]">
              <span className="h-2 w-2 rounded-full bg-[#3ba55d] shadow-[0_0_8px_#3ba55d]" /> Voz conectada
            </div>
            <button className="block max-w-full truncate text-left text-sm font-semibold" onClick={() => open("discord")} title="Abrir o Discord">
              <Volume2 size={13} className="mr-1 inline -translate-y-px opacity-70" />{d.channel || "Call"}
              {d.server && <span className="font-normal text-fg-muted"> · {d.server}</span>}
            </button>
          </>
        ) : (
          <div className="text-sm font-semibold">Discord</div>
        )}
      </div>
    </div>
  )

  if (!st?.open || !d)
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-fg-muted">
          <span className="animate-pulse">Conectando ao Discord…</span>
          <button className="btn !py-1 text-xs" onClick={() => open("discord")}>Abrir o Discord</button>
        </div>
      </div>
    )

  if (!d.loggedIn)
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-fg-muted">
          Entre na sua conta uma vez e o login fica salvo.
          <button className="btn btn-accent !py-1 text-xs" onClick={() => open("discord")}>Entrar no Discord</button>
        </div>
      </div>
    )

  if (!d.inCall)
    return (
      <div className="flex h-full flex-col gap-3 p-3.5">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className="text-sm text-fg-muted">Você não está em nenhuma call.</div>
          <button className="btn !py-1 text-xs" onClick={() => open("discord")}>Entrar numa call</button>
        </div>
      </div>
    )

  const big = w.h >= 200
  const ctrl = (on: boolean, danger: boolean, title: string, onClick: () => void, icon: React.ReactNode) => (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      title={title}
      className={cn("flex items-center justify-center rounded-full transition-colors", big ? "h-11 w-11" : "h-9 w-9")}
      style={{
        background: danger ? "#ed4245" : on ? "#ed4245" : "color-mix(in srgb, var(--fg) 12%, transparent)",
        color: danger || on ? "#fff" : "var(--fg)",
        boxShadow: danger ? "0 6px 16px -6px #ed4245" : undefined,
      }}
    >
      {icon}
    </motion.button>
  )

  return (
    <div className="flex h-full flex-col gap-2.5 p-3.5">
      {header}
      {/* quem está na call */}
      <div className="min-h-0 flex-1 overflow-auto" data-nodrag>
        {d.people.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <div
              className="rounded-full transition-shadow duration-100"
              style={{ width: big ? 48 : 32, height: big ? 48 : 32, boxShadow: d.meSpeaking ? "0 0 0 2.5px #23a55a, 0 0 16px #23a55aaa" : "0 0 0 1px rgb(255 255 255 / .1)" }}
            >
              {d.myAvatar ? <img src={d.myAvatar} className="h-full w-full rounded-full object-cover" draggable={false} /> : <div className="h-full w-full rounded-full" style={{ background: BLURPLE }} />}
            </div>
            {big && <div className="text-[10px] text-fg-muted">Em call</div>}
          </div>
        ) : (
          <div className={cn("flex flex-wrap gap-2", !big && "flex-nowrap overflow-hidden")}>
            {d.people.map((p) => (
              <div key={p.name} className="flex flex-col items-center gap-1" style={{ width: big ? 56 : 36 }} title={p.name}>
                <div
                  className="relative rounded-full transition-shadow duration-100"
                  style={{ width: big ? 44 : 30, height: big ? 44 : 30, boxShadow: p.speaking ? "0 0 0 2.5px #23a55a, 0 0 16px #23a55aaa" : "0 0 0 1px rgb(255 255 255 / .1)" }}
                >
                  {p.avatar ? <img src={p.avatar} className="h-full w-full rounded-full object-cover" draggable={false} /> : <div className="flex h-full w-full items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: BLURPLE }}>{p.name[0]?.toUpperCase()}</div>}
                  {(p.muted || p.deaf) && (
                    <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#ed4245] text-white">
                      {p.deaf ? <HeadphoneOff size={9} /> : <MicOff size={9} />}
                    </span>
                  )}
                </div>
                {big && <div className="w-full truncate text-center text-[10px] text-fg-muted">{p.name}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* controles */}
      <div className="flex items-center justify-center gap-3">
        {ctrl(d.muted, false, d.muted ? "Ativar o microfone" : "Mutar", () => bridge.webapp.discord("mute"), d.muted ? <MicOff size={18} /> : <Mic size={18} />)}
        {ctrl(d.deafened, false, d.deafened ? "Voltar a ouvir" : "Ensurdecer", () => bridge.webapp.discord("deafen"), d.deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />)}
        {ctrl(false, true, "Sair da call", () => bridge.webapp.discord("disconnect"), <PhoneOff size={18} />)}
      </div>
    </div>
  )
}
