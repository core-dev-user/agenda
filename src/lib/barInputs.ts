import type { AppNotification, Settings } from "./types"

/** Only values used by useThemeVars / BarSync; widget layout changes are irrelevant. */
export function barInputs(s: { settings: Settings; notifications: AppNotification[] }) {
  const p = s.settings
  return {
    theme: p.theme, dark: p.dark, fontScale: p.fontScale, accent: p.accent,
    radius: p.radius, blur: p.blur, surfaceOpacity: p.surfaceOpacity,
    uiFont: p.uiFont, numFont: p.numFont, displayFont: p.displayFont,
    size: p.taskbar.size, style: p.taskbar.style, showLabels: p.taskbar.showLabels,
    pins: p.pcPins, unread: s.notifications.filter((n) => !n.read).length,
  }
}
