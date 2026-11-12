import {
  Aperture, AppWindow, Boxes, CalendarDays, Camera, CircleDot, Cloud,
  Code2, Cpu, FileText, Folder, Gamepad2, Globe, Hexagon, Image,
  Layers, Mail, MessageCircle, Music2, PlaySquare, Settings, Shield,
  ShoppingBag, Terminal, Wallet, type LucideIcon,
} from "lucide-react"
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

/** Todo aplicativo do PC tem um pictograma vetorial monocromático, sem image requests. */
export function MonoAppIcon({ name, path = "", size = 24 }: { name: string; path?: string; size?: number }) {
  const Icon = ICONS[classifyAppIcon(name, path)]
  return <Icon aria-hidden="true" width={size} height={size} strokeWidth={1.8}
    style={{ color: "currentColor", flexShrink: 0 }} />
}

/** Usa apenas o glifo linear da seção, nunca suas logos/cores de marca. */
export function MonoSectionIcon({ id, size = 24 }: { id: SectionId; size?: number }) {
  const meta = SECTIONS.find((s) => s.id === id)
  const Icon = meta?.icon ?? AppWindow
  return <Icon aria-hidden="true" width={size} height={size} strokeWidth={1.8}
    style={{ color: "currentColor", flexShrink: 0 }} />
}
