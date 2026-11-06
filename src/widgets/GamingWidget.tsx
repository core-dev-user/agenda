import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Gamepad2 } from "lucide-react"
import { useStore } from "@/lib/store"
import { useNow } from "./Clock"
import type { Widget } from "@/lib/types"

const timer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const z = (n: number) => String(n).padStart(2, "0")
  const h = Math.floor(s / 3600)
  return h ? `${h}:${z(Math.floor(s / 60) % 60)}:${z(s % 60)}` : `${z(Math.floor(s / 60))}:${z(s % 60)}`
}

/** Widget "Jogando agora": a arte do jogo e há quanto tempo você está jogando. */
export function GamingWidget({ w }: { w: Widget }) {
  const running = useStore((s) => s.gamesRunning)
  const now = useNow(1000)
  const g = running[0]
  const [bad, setBad] = useState<Record<string, boolean>>({})
  const hero = g?.art?.hero && !bad[g.art.hero] ? g.art.hero : ""
  const logo = g?.art?.logo && !bad[g.art.logo] ? g.art.logo : ""
  const color = g?.color || "#8f9bff"
  const big = Math.min(w.w * 0.16, w.h * 0.26)

  return (
    <div className="relative h-full w-full overflow-hidden text-white">
      <AnimatePresence mode="wait">
        {g ? (
          <motion.div key={g.id} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            {/* fundo: arte do jogo (Steam) ou a cor do jogo */}
            {hero ? (
              <motion.img src={hero} onError={() => setBad((b) => ({ ...b, [hero]: true }))} className="absolute inset-0 h-full w-full object-cover" initial={{ scale: 1.12 }} animate={{ scale: 1.02 }} transition={{ duration: 8, ease: "easeOut" }} draggable={false} />
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(120% 100% at 30% 20%, color-mix(in srgb, ${color} 75%, #fff 0%), color-mix(in srgb, ${color} 35%, #000) 70%, #050308)` }} />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

            <div className="relative flex h-full flex-col items-center justify-center gap-1 px-4 pb-1">
              {logo ? (
                <img src={logo} onError={() => setBad((b) => ({ ...b, [logo]: true }))} className="max-h-[42%] max-w-[82%] object-contain drop-shadow-[0_6px_18px_rgb(0_0_0/.6)]" draggable={false} />
              ) : g.art?.icon ? (
                <img src={g.art.icon} className="drop-shadow-[0_0_24px_rgb(255_255_255/.25)]" style={{ width: big * 1.5, height: big * 1.5 }} draggable={false} />
              ) : (
                <div className="font-display text-center leading-tight font-bold drop-shadow-[0_4px_14px_rgb(0_0_0/.7)]" style={{ fontSize: Math.max(18, big * 0.55) }}>{g.name}</div>
              )}
              <div className="font-num mt-1 font-semibold tracking-tight drop-shadow-[0_2px_10px_rgb(0_0_0/.8)]" style={{ fontSize: Math.max(26, big * 0.75), fontVariantNumeric: "tabular-nums" }}>{timer(now.getTime() - g.start)}</div>
            </div>

            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full bg-[#5ee3a1]" /><span className="relative h-1.5 w-1.5 rounded-full bg-[#5ee3a1]" /></span>
              Jogando{running.length > 1 ? ` · +${running.length - 1}` : ""}
            </div>
          </motion.div>
        ) : (
          <motion.div key="none" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-fg-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Gamepad2 size={Math.max(22, big * 0.6)} strokeWidth={1.4} />
            <span className="text-xs">Nenhum jogo aberto</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
