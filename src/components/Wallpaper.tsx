import { useEffect, useRef } from "react"
import { useSettings } from "@/lib/store"
import { mediaUrl } from "@/lib/bridge"
import { perfPaused } from "@/lib/perf"
import { LockClock, LOCK_DEFAULT } from "./LockClock"
import { SakuraCanvas } from "./SakuraCanvas"

export const GRADIENTS: Record<string, { label: string; css: string }> = {
  dusk: { label: "Crepúsculo sakura", css: "radial-gradient(1200px 800px at 75% 15%, #ff8fb855, transparent 60%), radial-gradient(900px 700px at 10% 90%, #7a2a5c88, transparent 60%), linear-gradient(160deg, #1b0d1c 0%, #3a1835 45%, #12070f 100%)" },
  dawn: { label: "Amanhecer", css: "radial-gradient(1000px 700px at 20% 10%, #ffd6e8, transparent 60%), radial-gradient(900px 700px at 90% 80%, #ffc7a8aa, transparent 60%), linear-gradient(160deg, #fff1f6, #f7d6e6 50%, #e9c6ff)" },
  ocean: { label: "Oceano noturno", css: "radial-gradient(1100px 700px at 80% 20%, #4fb3ff44, transparent 60%), radial-gradient(900px 700px at 10% 90%, #2a5cff55, transparent 60%), linear-gradient(160deg, #06121f, #0b2442 50%, #050a14)" },
  aurora: { label: "Aurora", css: "radial-gradient(900px 600px at 20% 20%, #42ffb055, transparent 60%), radial-gradient(1000px 700px at 80% 30%, #7a5cff66, transparent 60%), radial-gradient(800px 600px at 50% 100%, #ff5fa255, transparent 60%), linear-gradient(160deg, #071018, #0e1630)" },
  sunset: { label: "Pôr do sol", css: "radial-gradient(1200px 800px at 50% 110%, #ff9a5a, transparent 60%), linear-gradient(180deg, #2b1055 0%, #7b2d6b 45%, #ff7a7a 80%, #ffc070 100%)" },
  forest: { label: "Bambuzal", css: "radial-gradient(1000px 700px at 70% 10%, #b8ffb444, transparent 60%), linear-gradient(160deg, #0b1a12, #163a26 55%, #08130c)" },
  win95: { label: "Retrô teal", css: "#008080" },
  crt: { label: "Fósforo CRT", css: "radial-gradient(ellipse at center, #062b12 0%, #010a04 70%, #000 100%)" },
  mono: { label: "Grafite", css: "linear-gradient(160deg, #1b1b1f, #2a2a30 50%, #111114)" },
  lavender: { label: "Lavanda", css: "radial-gradient(1000px 700px at 80% 20%, #c9a7ff66, transparent 60%), radial-gradient(900px 700px at 15% 85%, #ff9ad566, transparent 60%), linear-gradient(160deg, #1c1430, #2d1f4a 50%, #120d1f)" },
  peach: { label: "Pêssego", css: "radial-gradient(1100px 800px at 30% 20%, #ffd1b3, transparent 60%), radial-gradient(900px 700px at 85% 85%, #ff9fb4aa, transparent 60%), linear-gradient(160deg, #ffe9dc, #ffc8c8 55%, #f4b0d4)" },
  cyber: { label: "Cyberpunk", css: "radial-gradient(900px 600px at 15% 20%, #00f0ff55, transparent 60%), radial-gradient(1000px 700px at 85% 75%, #ff00a866, transparent 60%), linear-gradient(160deg, #07050f, #170a2a 55%, #05030a)" },
  galaxy: { label: "Galáxia", css: "radial-gradient(2px 2px at 20% 30%, #fff, transparent), radial-gradient(1.5px 1.5px at 70% 20%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 70%, #fffd, transparent), radial-gradient(1px 1px at 85% 60%, #fff, transparent), radial-gradient(1100px 700px at 60% 40%, #6b3fff44, transparent 60%), radial-gradient(900px 600px at 20% 80%, #ff4fa144, transparent 60%), linear-gradient(160deg, #04030c, #0d0a24 55%, #020107)" },
  mint: { label: "Menta", css: "radial-gradient(1000px 700px at 75% 20%, #b9ffe0, transparent 60%), linear-gradient(160deg, #e9fff6, #c8f3e4 55%, #a9e3d8)" },
  noir: { label: "Noir rosé", css: "radial-gradient(900px 600px at 80% 10%, #ff8fb833, transparent 60%), linear-gradient(160deg, #0a0a0c, #16121a 55%, #050507)" },
  sunsetsea: { label: "Mar ao entardecer", css: "linear-gradient(180deg, #1e2a5a 0%, #6b3b7a 35%, #ef7b6b 62%, #2b4c7a 63%, #142a4a 100%)" },
  matcha: { label: "Matcha", css: "radial-gradient(1000px 700px at 20% 15%, #d9f2a6aa, transparent 60%), linear-gradient(160deg, #23301a, #3c4f26 55%, #19220f)" },
}

/** screenId: monitor (cada um pode ter um papel de parede próprio) */
export function Wallpaper({ screenId }: { screenId?: number }) {
  const s = useSettings()
  const own = screenId != null ? s.wallpaperBy?.[String(screenId)] : undefined
  const wp = own ? { ...s.wallpaper, ...own } : s.wallpaper
  const layer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!wp.parallax || !s.animations) {
      if (layer.current) layer.current.style.transform = "scale(1.0)"
      return
    }
    let raf = 0
    let tx = 0, ty = 0, cx = 0, cy = 0
    const move = (e: PointerEvent) => {
      tx = (e.clientX / innerWidth - 0.5) * -24
      ty = (e.clientY / innerHeight - 0.5) * -24
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const tick = () => {
      cx += (tx - cx) * 0.06
      cy += (ty - cy) * 0.06
      if (layer.current) layer.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) scale(1.05)`
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(tick) : 0
    }
    window.addEventListener("pointermove", move)
    return () => {
      window.removeEventListener("pointermove", move)
      cancelAnimationFrame(raf)
    }
  }, [wp.parallax, s.animations])

  const bg =
    wp.type === "image" && wp.image
      ? { backgroundImage: `url("${mediaUrl(wp.image)}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : wp.type === "color"
        ? { background: wp.color }
        : { background: (GRADIENTS[wp.gradient] ?? GRADIENTS.dusk).css }

  const lock = s.lockClock?.on ? { ...LOCK_DEFAULT, ...s.lockClock } : null
  // assunto recortado da foto atual (para o relógio ficar atrás dele)
  const fg = lock?.depth && wp.type === "image" && wp.fg && wp.fgFor === wp.image ? wp.fg : null
  const filter = [wp.blur ? `blur(${wp.blur}px)` : "", wp.dim ? `brightness(${1 - wp.dim})` : ""].filter(Boolean).join(" ") || undefined

  const anim = wp.type === "video" && wp.video ? wp.video : null
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* camadas que se movem juntas (parallax): fundo → relógio → assunto na frente */}
      <div ref={layer} className="absolute -inset-4 will-change-transform" style={{ transform: "scale(1.05)" }}>
        {anim ? <AnimWall file={anim} filter={filter} /> : <div className="absolute inset-0" style={{ ...bg, filter }} />}
        {lock && <LockClock c={lock} />}
        {fg && <div className="absolute inset-0" style={{ backgroundImage: `url("${mediaUrl(fg)}")`, backgroundSize: "cover", backgroundPosition: "center", filter }} />}
      </div>
      {s.sakura.ambient && !s.perfLite && <SakuraCanvas density={s.sakura.density} />}
    </div>
  )
}

/** papel de parede animado: vídeo (sem som, repetindo) ou GIF. O vídeo pausa durante jogos e com o Agenda escondido. */
function AnimWall({ file, filter }: { file: string; filter?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const isGif = /\.gif$/i.test(file)
  useEffect(() => {
    if (isGif) return
    const v = ref.current
    if (!v) return
    const sync = () => { if (perfPaused() || document.hidden) v.pause(); else v.play().catch(() => {}) }
    const id = setInterval(sync, 1500)
    document.addEventListener("visibilitychange", sync)
    sync()
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", sync) }
  }, [file, isGif])
  if (isGif) return <img src={mediaUrl(file)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ filter }} />
  return <video ref={ref} src={mediaUrl(file)} autoPlay loop muted playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-cover" style={{ filter }} />
}

export function Overlays() {
  const o = useSettings().overlay
  return (
    <div className="pointer-events-none fixed inset-0 z-[9000]">
      {o.vignette && <div className="overlay-vignette absolute inset-0" />}
      {o.grain && <div className="overlay-grain absolute inset-0" />}
      {o.scanlines && <div className="overlay-scanlines absolute inset-0" />}
    </div>
  )
}
