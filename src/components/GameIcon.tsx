import type { GameInfo } from "@/lib/gaming"

/** ícone do jogo (tirado do .exe) ou a inicial na cor do jogo */
export function GameIcon({ info, size = 40 }: { info?: GameInfo; size?: number }) {
  if (info?.icon) return <img src={info.icon} style={{ width: size, height: size }} className="shrink-0 rounded-[22%] object-contain" draggable={false} />
  return (
    <div className="flex shrink-0 items-center justify-center rounded-[22%] font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.45, background: `linear-gradient(150deg, ${info?.color || "#8f9bff"}, color-mix(in srgb, ${info?.color || "#8f9bff"} 55%, #000))` }}>
      {(info?.name ?? "?")[0]?.toUpperCase()}
    </div>
  )
}
