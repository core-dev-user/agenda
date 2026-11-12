import { useEffect, useState } from "react"
import { bridge } from "@/lib/bridge"
import { useBarSync } from "./sync"

/** área de trabalho do Agenda nos monitores onde o Agenda principal não está: papel de parede e relógio */
export function Desk() {
  const sync = useBarSync()
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) setNow(new Date()) }, 30000); return () => clearInterval(t) }, [])
  const wall = sync?.wall
  return (
    <div
      className="fixed inset-0 overflow-hidden text-white select-none"
      onContextMenu={(e) => { e.preventDefault(); bridge.bar.menu("start", innerWidth / 2, 640, 660) }}
    >
      <div className="absolute -inset-4" style={{ background: wall?.bg ?? "#000", filter: wall?.filter }} />
      <div className="absolute inset-x-0 top-[14%] flex flex-col items-center [text-shadow:0_2px_24px_rgba(0,0,0,.35)]">
        <div className="font-display text-[132px] leading-none font-semibold tracking-tight tabular-nums">
          {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="mt-3 text-xl font-medium capitalize opacity-85">
          {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>
    </div>
  )
}
