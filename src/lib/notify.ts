import { useStore, DEFAULT_NOTIFY, DEFAULT_FOCUS } from "./store"
import { bridge } from "./bridge"
import type { AppNotification, NotifySource } from "./types"

export const SOURCE_META: Record<NotifySource, { label: string; emoji: string }> = {
  tasks: { label: "Tarefas", emoji: "✅" },
  whatsapp: { label: "WhatsApp", emoji: "💬" },
  ifood: { label: "iFood", emoji: "🍔" },
  sports: { label: "Jogos dos favoritos", emoji: "⚽" },
  budgets: { label: "Orçamento (Finanças)", emoji: "💸" },
  services: { label: "Serviços a receber", emoji: "💼" },
  calendar: { label: "Agenda do Google", emoji: "🗓️" },
  focus: { label: "Modo foco", emoji: "🎯" },
  system: { label: "Sistema", emoji: "⚙️" },
}

export const notifyPrefs = () => {
  const n = useStore.getState().settings.notify
  return { ...DEFAULT_NOTIFY, ...n, on: { ...DEFAULT_NOTIFY.on, ...n?.on }, toast: { ...DEFAULT_NOTIFY.toast, ...n?.toast } }
}
export const focusPrefs = () => ({ ...DEFAULT_FOCUS, ...useStore.getState().settings.focus })
export const focusActive = () => {
  const s = useStore.getState()
  return s.focusManual || (focusPrefs().auto && !!s.studyTimer?.startedAt)
}

/** Registra na central de avisos e, se você quiser, mostra o aviso do Windows. */
export function notify(n: Omit<AppNotification, "id" | "at">) {
  const p = notifyPrefs()
  if (p.on[n.source] === false) return
  const full = useStore.getState().pushNotification(n)
  const silenced = focusActive() && focusPrefs().silence && n.source !== "focus" && n.source !== "calendar"
  if (p.toast[n.source] && !silenced) {
    try {
      const t = new Notification(n.title, { body: n.body, silent: !p.sound, tag: full.id })
      t.onclick = () => {
        bridge.app.show()
        if (n.open) useStore.getState().openWindow(n.open)
      }
    } catch {}
  }
  return full
}
