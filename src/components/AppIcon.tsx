import { useSettings } from "@/lib/store"
import type { IconStyle, SectionId } from "@/lib/types"
import { AppIconView } from "./AppIconView"
export { ICON_STYLES, resolveIconStyle, sectionColor, AppIconView, type IconPrefs } from "./AppIconView"

/** Ícone de um app/aba no estilo escolhido nas configurações. */
export function AppIcon(p: { id: SectionId; size: number; styleOverride?: Exclude<IconStyle, "auto"> }) {
  const s = useSettings()
  return <AppIconView {...p} s={s} />
}
