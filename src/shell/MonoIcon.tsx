import { useEffect, useRef, useState, type CSSProperties } from "react"
import {
  Aperture, AppWindow, Boxes, CalendarDays, Camera, CircleDot, Cloud,
  Code2, Cpu, FileText, Folder, Gamepad2, Globe, Hexagon, Image,
  Layers, Mail, MessageCircle, Music2, PlaySquare, Settings, Shield,
  ShoppingBag, Terminal, Wallet, type LucideIcon,
} from "lucide-react"
import { bridge } from "@/lib/bridge"
import { carbonoBrandSrc } from "@/lib/iconPack"
import { SECTIONS } from "@/components/sections-meta"
import type { SectionId } from "@/lib/types"
import { classifyAppIcon, type MonoKind } from "./monoIconMap"

const ICONS: Record<MonoKind, LucideIcon> = {
  browser: Globe, game: Gamepad2, chat: MessageCircle, music: Music2,
  video: PlaySquare, code: Code2, terminal: Terminal, file: Folder,
  document: FileText, image: Image, camera: Camera, security: Shield,
  settings: Settings, mail: Mail, shopping: ShoppingBag, cloud: Cloud,
  system: Cpu, calendar: CalendarDays, finance: Wallet,
  "abstract-0": AppWindow, "abstract-1": Layers, "abstract-2": Aperture,
  "abstract-3": Boxes, "abstract-4": CircleDot, "abstract-5": Hexagon,
}

/** The authentic brand shape, no colored tile, stroke box, shadow or caption. */
function BrandMark({ src, size }: { src: string; size: number }) {
  const style: CSSProperties = {
    display: "inline-block", flexShrink: 0, width: size, height: size,
    backgroundColor: "currentColor",
    WebkitMaskImage: 'url("' + src + '")', maskImage: 'url("' + src + '")',
    WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
    WebkitMaskPosition: "center", maskPosition: "center",
    WebkitMaskSize: "contain", maskSize: "contain",
  }
  return <span aria-hidden="true" style={style} />
}

// Windows app-icon IPC is needed only for names without a bundled vector.
// Lazy retrieval prevents opening the Carbono search from requesting hundreds
// of heavy base64 icons at once. Small LRU deduplicates adjacent windows.
const ICON_LIMIT = 28, ICON_BYTES = 1024 * 1024
type Entry = { promise: Promise<string>; bytes: number }
const cache = new Map<string, Entry>()
let totalBytes = 0
function trim() {
  while (cache.size > ICON_LIMIT || totalBytes > ICON_BYTES) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    const entry = cache.get(oldest)!
    cache.delete(oldest)
    totalBytes -= entry.bytes
  }
}
function windowsIcon(path: string): Promise<string> {
  const key = path.toLowerCase()
  const previous = cache.get(key)
  if (previous) { cache.delete(key); cache.set(key, previous); return previous.promise }
  const entry: Entry = { bytes: 0, promise: Promise.resolve("") }
  entry.promise = bridge.bar.icon(path).catch(() => "").then((src) => {
    if (cache.get(key) !== entry) return src
    if (!src || src.length > ICON_BYTES / 2) { cache.delete(key); return src }
    entry.bytes = src.length
    totalBytes += entry.bytes
    trim()
    return src
  })
  cache.set(key, entry)
  trim()
  return entry.promise
}

/** For an app outside the offline brand catalog, preserve its actual Windows
 * icon in grayscale (instead of showing an unrelated generic app-category
 * drawing). A simple vector remains the fallback for missing/broken icons.
 */
function NativeMark({ name, path, size, originalSrc }: {
  name: string; path: string; size: number; originalSrc?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [loaded, setLoaded] = useState("")
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setLoaded("")
    setBroken(false)
    if (originalSrc || !path) return
    const el = ref.current
    if (!el) return
    let alive = true
    let started = false
    const request = () => {
      if (started) return
      started = true
      void windowsIcon(path).then((src) => { if (alive) setLoaded(src) })
    }
    if (typeof IntersectionObserver === "undefined") request()
    else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); request() }
      }, { rootMargin: "120px" })
      observer.observe(el)
      return () => { alive = false; observer.disconnect() }
    }
    return () => { alive = false }
  }, [path, originalSrc])
  const src = originalSrc || loaded
  const Icon = ICONS[classifyAppIcon(name, path)]
  return <span ref={ref} className="inline-flex shrink-0 items-center justify-center"
    style={{ width: size, height: size }}>
    {src && !broken
      ? <img alt="" src={src} draggable={false} width={size} height={size}
          onError={() => setBroken(true)}
          style={{ display: "block", width: size, height: size, objectFit: "contain",
            filter: "grayscale(1) contrast(1.28)" }} />
      : <Icon aria-hidden="true" width={size} height={size} strokeWidth={1.8}
          style={{ color: "currentColor" }} />}
  </span>
}

export function MonoAppIcon({ name, path = "", size = 24, originalSrc }: {
  name: string; path?: string; size?: number; originalSrc?: string
}) {
  const brand = carbonoBrandSrc(name, path)
  return brand
    ? <BrandMark src={brand} size={size} />
    : <NativeMark name={name} path={path} size={size} originalSrc={originalSrc} />
}

/** Widgy sections use clean line icons; branded app sections retain the brand. */
export function MonoSectionIcon({ id, size = 24 }: { id: SectionId; size?: number }) {
  const branded = id === "discord" ? "Discord" : id === "whatsapp" ? "WhatsApp" : ""
  if (branded) return <BrandMark src={carbonoBrandSrc(branded)!} size={size} />
  const meta = SECTIONS.find((s) => s.id === id)
  const Icon = meta?.icon ?? AppWindow
  return <Icon aria-hidden="true" width={size} height={size} strokeWidth={1.8}
    style={{ color: "currentColor", flexShrink: 0 }} />
}
