import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Headphones, HeadphoneOff, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react"
import { bridge } from "@/lib/bridge"
import { useStore } from "@/lib/store"
import { useWebApps } from "@/lib/webapps"
import type { DiscordPerson } from "@/lib/bridge"
import type { Widget } from "@/lib/types"
import { cn } from "@/lib/utils"

const BLURPLE = "#5865F2"
const GREEN = "#23a55a"
const RED = "#ed4245"

/** quando a call começou (contado aqui, desde que o Agenda viu você entrar) */
let callSince = 0
function useCallTime(inCall: boolean) {
  const [, force] = useState(0)
  if (inCall && !callSince) callSince = Date.now()
  if (!inCall) callSince = 0
  useEffect(() => {
    if (!inCall) return
    const id = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [inCall])
  if (!callSince) return ""
  const s = Math.floor((Date.now() - callSince) / 1000)
  const z = (n: number) => String(n).padStart(2, "0")
  return s >= 3600 ? `${Math.floor(s / 3600)}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}` : `${z(Math.floor(s / 60))}:${z(s % 60)}`
}

/** avatar redondo com o anel verde de quem está falando */
function Avatar({ p, size }: { p: Pick<DiscordPerson, "name" | "avatar" | "speaking" | "muted" | "deaf">; size: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="h-full w-full overflow-hidden rounded-full transition-[box-shadow] duration-150"
        style={{ boxShadow: p.speaking ? `0 0 0 2.5px ${GREEN}, 0 0 16px 2px ${GREEN}88` : "0 0 0 1px rgb(255 255 255 / .12)" }}
      >
        {p.avatar
          ? <img src={p.avatar} className="h-full w-full object-cover" draggable={false} />
          : <div className="flex h-full w-full items-center justify-center font-semibold text-white" style={{ background: BLURPLE, fontSize: size * 0.4 }}>{p.name[0]?.toUpperCase()}</div>}
      </div>
      {(p.muted || p.deaf) && (
        <span className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full text-white" style={{ width: Math.max(14, size * 0.36), height: Math.max(14, size * 0.36), background: RED, boxShadow: "0 0 0 2px var(--dc-bg)" }}>
          {p.deaf ? <HeadphoneOff size={Math.max(8, size * 0.2)} /> : <MicOff size={Math.max(8, size * 0.2)} />}
        </span>
      )}
    </div>
  )
}

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

  const time = useCallTime(!!d?.inCall)
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

  // em você: quando a lista do canal não aparece, mostra só o seu avatar
  const people: DiscordPerson[] = d.people.length ? d.people : [{ name: d.myName || "Você", avatar: d.myAvatar, speaking: !!d.meSpeaking, muted: d.muted, deaf: d.deafened }]
  const n = people.length
  const roomy = w.h >= 230
  // tamanho dos avatares: cabe todo mundo na área do meio
  // (cabeçalho ~52px, controles 44, linha de quem fala 24, margens)
  const area = { w: w.w - 28, h: Math.max(30, w.h - 28 - 52 - 44 - 12 - (roomy ? 26 : 0)) }
  const fit = (sz: number) => {
    const nm = roomy && sz >= 36
    const cw = (nm ? sz + 14 : sz) + (nm ? 14 : 8)
    const ch = sz + (nm ? 18 : 0) + (nm ? 10 : 8)
    const cols = Math.max(1, Math.floor((area.w + (nm ? 14 : 8)) / cw))
    const rows = Math.max(1, Math.floor((area.h + (nm ? 10 : 8)) / ch))
    return { nm, cap: cols * rows }
  }
  let size = 64
  while (size > 24 && fit(size).cap < n) size -= 2
  const { nm: names, cap } = fit(size)
  // não coube todo mundo nem no menor tamanho: mostra "+N"
  const shown = cap < n ? people.slice(0, Math.max(1, cap - 1)) : people
  const extra = n - shown.length
  const speaking = people.filter((p) => p.speaking).map((p) => p.name)

  const ctrl = (active: boolean, title: string, onClick: () => void, icon: React.ReactNode) => (
    <motion.button
      whileTap={{ scale: 0.86 }}
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
      style={{ background: active ? RED : "transparent", color: active ? "#fff" : "var(--fg)" }}
    >
      {icon}
    </motion.button>
  )

  return (
    <div className="relative flex h-full flex-col overflow-hidden p-3.5" style={{ ["--dc-bg" as any]: "rgb(20 20 28)" }}>
      {/* brilho suave da cor do Discord atrás de quem está na call */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 opacity-60" style={{ background: `radial-gradient(70% 80% at 50% 0%, ${BLURPLE}38, transparent 70%)` }} />

      <div className="relative flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: GREEN }}>
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: GREEN }} /><span className="relative h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} /></span>
            Na call{time && <span className="font-num text-fg-muted tabular-nums">· {time}</span>}
          </div>
          <button className="mt-0.5 block max-w-full truncate text-left text-[15px] leading-tight font-semibold hover:underline" onClick={() => open("discord")} title="Abrir o Discord">
            {d.channel || "Call"}
          </button>
          {d.server && <div className="truncate text-[11px] text-fg-muted">{d.server}</div>}
        </div>
        <img src="logos/discord.svg" className="h-5 w-5 shrink-0 opacity-80" draggable={false} />
      </div>

      {/* quem está na call */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center py-2" data-nodrag>
        <div className="flex max-h-full flex-wrap content-center justify-center overflow-hidden" style={{ gap: names ? "10px 14px" : 8 }}>
          {shown.map((p) => (
            <div key={p.name} className="flex flex-col items-center gap-1" style={{ width: names ? size + 14 : size }} title={p.name}>
              <Avatar p={p} size={size} />
              {names && <div className={cn("w-full truncate text-center text-[10.5px]", p.speaking ? "text-fg" : "text-fg-muted")}>{p.name}</div>}
            </div>
          ))}
          {extra > 0 && (
            <div className="flex items-center justify-center rounded-full text-xs font-semibold text-fg-muted" style={{ width: size, height: size, background: "color-mix(in srgb, var(--fg) 10%, transparent)" }} title={people.slice(shown.length).map((p) => p.name).join(", ")}>+{extra}</div>
          )}
        </div>
      </div>

      {roomy && (
        <div className="relative mb-2 h-4 truncate text-center text-[11px] text-fg-muted">
          {speaking.length ? <><span style={{ color: GREEN }}>●</span> {speaking.slice(0, 2).join(", ")}{speaking.length > 2 ? ` +${speaking.length - 2}` : ""} falando</> : `${n} ${n === 1 ? "pessoa" : "pessoas"} na call`}
        </div>
      )}

      {/* controles: barra única, sair em vermelho */}
      <div className="relative flex items-center justify-center gap-2">
        <div className="flex items-center gap-0.5 rounded-full p-1" style={{ background: "color-mix(in srgb, var(--fg) 9%, transparent)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / .06)" }}>
          {ctrl(d.muted, d.muted ? "Ativar o microfone" : "Mutar", () => bridge.webapp.discord("mute"), d.muted ? <MicOff size={17} /> : <Mic size={17} />)}
          {ctrl(d.deafened, d.deafened ? "Voltar a ouvir" : "Ensurdecer", () => bridge.webapp.discord("deafen"), d.deafened ? <HeadphoneOff size={17} /> : <Headphones size={17} />)}
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => bridge.webapp.discord("disconnect")}
          title="Sair da call"
          className="flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-white"
          style={{ background: RED, boxShadow: `0 8px 20px -8px ${RED}` }}
        >
          <PhoneOff size={16} /> {w.w >= 260 && "Sair"}
        </motion.button>
      </div>
    </div>
  )
}
