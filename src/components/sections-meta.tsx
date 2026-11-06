import { Briefcase, CalendarCheck, GraduationCap, Headphones, Images, ListChecks, MessageCircle, Music, Settings, UtensilsCrossed } from "lucide-react"
import type { SectionId } from "@/lib/types"

export const SECTIONS: { id: SectionId; label: string; icon: typeof Briefcase; color: string }[] = [
  { id: "habits", label: "Hábitos", icon: CalendarCheck, color: "#8cf0b0" },
  { id: "studies", label: "Estudos", icon: GraduationCap, color: "#8f9bff" },
  { id: "services", label: "Serviços", icon: Briefcase, color: "#ffd36e" },
  { id: "lists", label: "Listas", icon: ListChecks, color: "#ff8fb8" },
  { id: "music", label: "Música", icon: Music, color: "#ff5c7a" },
  { id: "discord", label: "Discord", icon: Headphones, color: "#5865F2" },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "#25D366" },
  { id: "ifood", label: "iFood", icon: UtensilsCrossed, color: "#EA1D2C" },
  { id: "gallery", label: "Imagens", icon: Images, color: "#7cc8ff" },
  { id: "settings", label: "Configurações", icon: Settings, color: "#d0d0d8" },
]
