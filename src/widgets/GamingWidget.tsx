import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Gamepad2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { agoText, emptyGaming, fmtClock, fmtDur, perGame, sessionEnd, since, type GameInfo } from "@/lib/gaming"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"

/** fundo do jogo: arte da Steam ou a cor do jogo com o ícone grande e apagado */
export function GameBackdrop({ info, dim = false, kenburns = true }: { info?: GameInfo; dim?: boolean; kenburns?: boolean }) {
  const [bad, setBad] = useState(false)
  const hero = info?.art?.hero && !bad ? info.art.hero : ""
  const color = info?.color || "#7c6cf0"
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ filter: dim ? "saturate(.35) brightness(.7)" : undefined }}>
      {hero ? (
        <motion.img src={hero} onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-cover" initial={kenburns ? { scale: 1.12 } : false} animate={{ scale: 1.02 }} transition={{ duration: 10, ease: "easeOut" }} draggable={false} />
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 80%, #000), color-mix(in srgb, ${color} 25%, #06040a))` }} />
          {info?.art?.icon && <img src={info.art.icon} className="absolute -right-6 -bottom-8 h-[130%] opacity-25" style={{ filter: "blur(1px)" }} draggable={false} />}
        </>
      )}
    </div>
  )
}

/** Widget "Jogando agora": nome do jogo, há quanto tempo, quanto jogou hoje e na semana. Dois cliques abrem o registro. */
export function GamingWidget({ w }: { w: Widget }) {
  const running = useStore((s) => s.gamesRunning)
  const g = useStore((s) => s.gaming) ?? emptyGaming()
  const open = useStore((s) => s.openWindow)
  const now = useNow(1000)
  const minute = Math.floor(now.getTime() / 60000)
  const today = useMemo(() => perGame(g, since(1)), [g, minute])
  const week = useMemo(() => perGame(g, since(7)), [g, minute])
  const cur = running[0]
  const info: GameInfo | undefined = cur ? { ...g.games[cur.id], name: cur.name, color: cur.color, art: cur.art } : undefined
  const todayCur = cur ? today.find((x) => x.id === cur.id)?.ms ?? 0 : 0
  const weekCur = cur ? week.find((x) => x.id === cur.id)?.ms ?? 0 : 0
  const last = [...g.sessions].filter((s) => !s.open).sort((a, b) => b.end - a.end)[0]
  const lastInfo = last ? g.games[last.game] : undefined
  const weekTotal = week.reduce((a, x) => a + x.ms, 0)
  const nameSize = Math.max(18, Math.min(34, w.w / 11))

  return (
    <div className="group/g relative h-full w-full overflow-hidden text-white" onDoubleClick={() => open("games")}>
      <AnimatePresence mode="wait">
        {cur ? (
          <motion.div key={cur.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }}>
            <GameBackdrop info={info} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/5" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/45 to-transparent" />

            <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase backdrop-blur-md">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#5ee3a1]" /><span className="relative h-1.5 w-1.5 rounded-full bg-[#5ee3a1]" /></span>
              Jogando agora
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3.5">
              {info?.art?.icon && !info.art.hero && <img src={info.art.icon} className="h-12 w-12 shrink-0 drop-shadow-[0_4px_14px_rgb(0_0_0/.6)]" draggable={false} />}
              <div className="min-w-0 flex-1">
                <div className="font-display truncate leading-tight font-bold drop-shadow-[0_2px_12px_rgb(0_0_0/.7)]" style={{ fontSize: nameSize }}>{cur.name}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-white/80">
                  <span>hoje <b className="font-num text-white">{fmtDur(Math.max(todayCur, now.getTime() - Math.max(cur.start, since(1))))}</b></span>
                  {weekCur > todayCur + 60000 && <span>na semana <b className="font-num text-white">{fmtDur(weekCur)}</b></span>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-semibold tracking-[0.18em] text-white/70 uppercase">sessão</div>
                <div className="font-num leading-none font-semibold drop-shadow-[0_2px_10px_rgb(0_0_0/.8)]" style={{ fontSize: Math.max(22, nameSize * 0.95), fontVariantNumeric: "tabular-nums" }}>{fmtClock(now.getTime() - cur.start)}</div>
              </div>
            </div>
          </motion.div>
        ) : last && lastInfo ? (
          <motion.div key="last" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <GameBackdrop info={lastInfo} dim kenburns={false} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-white/70 uppercase"><Gamepad2 size={12} /> Último jogo</div>
            <div className="absolute inset-x-0 bottom-0 p-3.5">
              <div className="font-display truncate leading-tight font-bold" style={{ fontSize: nameSize * 0.9 }}>{lastInfo.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-white/75">
                <span>{agoText(last.end)} · {fmtDur(sessionEnd(last) - last.start)}</span>
                {weekTotal > 0 && <span>semana <b className="font-num text-white">{fmtDur(weekTotal)}</b>{week.length > 1 ? ` em ${week.length} jogos` : ""}</span>}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="none" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-fg-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Gamepad2 size={26} strokeWidth={1.4} />
            <span className="text-xs">Abra um jogo e ele aparece aqui</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/80 opacity-0 backdrop-blur-sm transition-opacity group-hover/g:opacity-100">2 cliques: registro</div>
    </div>
  )
}
