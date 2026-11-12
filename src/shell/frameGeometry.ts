import type { ScreenRect } from "@/lib/bridge"

/**
 * The native Windows AppBar already occupies the reserved area at the edge.
 * The work-area rectangle starts AFTER that reservation; painting Carbono's
 * frame inside it creates a second, empty dark rail.
 *
 * Draw only the decorative frame in the complete monitor rectangle, making
 * its rail overlap the native taskbar instead of sitting beside it.
 */
export function carbonoBorderViewport(screen: ScreenRect): ScreenRect {
  return screen.full ? { ...screen, ...screen.full } : screen
}
