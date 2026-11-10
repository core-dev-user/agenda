import { activeScreen } from "./screens"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import { bridge } from "./bridge"
import { uid, todayISO } from "./utils"
import { findSpot } from "./placement"
import { widgetGeo } from "./viewport"
import type { ListenStats } from "./listening"
import type { RunningGame, ValAgentNow } from "./bridge"
import type { ValTemplate } from "@/widgets/ValAgentWidget"
import type { GamingData } from "./gaming"
import type { PhotoGallery } from "./types"
import type {
  Settings, Widget, WidgetType, MediaItem, Geo, Habit, Subject, Service, ShopList, WinState, SectionId, ThemeId, LookTemplate, Task, StudyTimer,
  AppNotification, CalEvent, NotifyPrefs, FocusPrefs,
} from "./types"

/** Preferências que não são "visual" e por isso não entram nos templates. */
const NOT_LOOK: (keyof Settings)[] = ["musicAutostart", "layoutRef", "weatherCity", "newsFeed", "notify", "calendars", "favTeams", "favBySport", "pet", "focus", "todayOnStart", "hibernateMin", "perfLite", "perfPauseInGame", "pcPins", "nick", "savedRooms", "ai"]

export const DEFAULT_NOTIFY: NotifyPrefs = {
  on: { tasks: true, whatsapp: true, ifood: true, sports: true, budgets: true, services: true, calendar: true, focus: true, system: true },
  // o WhatsApp Web e o Discord já mostram os avisos deles no Windows: aqui só entram na central
  toast: { tasks: true, whatsapp: false, ifood: true, sports: true, budgets: true, services: true, calendar: true, focus: false, system: true },
  sound: true,
}
export const DEFAULT_FOCUS: FocusPrefs = { auto: true, muteApps: true, hideWidgets: false, silence: true, playlist: "" }
export const lookOf = (s: Settings): Partial<Settings> => {
  const c: Partial<Settings> = JSON.parse(JSON.stringify(s))
  for (const k of NOT_LOOK) delete c[k]
  return c
}
/** Aplica a disposição salva sem perder o conteúdo atual das notas. */
const mergeWidgets = (saved: Widget[], current: Widget[]): Widget[] =>
  saved.map((w) => {
    const cur = current.find((c) => c.id === w.id)
    if (cur && w.type === "note") return { ...w, config: { ...w.config, text: cur.config.text } }
    return JSON.parse(JSON.stringify(w))
  })

export const THEME_PRESETS: Record<ThemeId, Partial<Settings>> = {
  glass: { uiFont: "outfit", numFont: "space", displayFont: "playfair", radius: 22, blur: 24, surfaceOpacity: 0.12, cursorStyle: "system", cursorEffect: "sakura" },
  metal: { uiFont: "inter", numFont: "orbitron", displayFont: "space", radius: 10, blur: 10, surfaceOpacity: 0.55, cursorStyle: "dot", cursorEffect: "glow" },
  retro: { dark: false, uiFont: "silkscreen", numFont: "vt323", displayFont: "press", radius: 0, blur: 0, surfaceOpacity: 1, cursorStyle: "pixel", cursorEffect: "pixels" },
  terminal: { uiFont: "vt323", numFont: "vt323", displayFont: "vt323", radius: 4, blur: 2, surfaceOpacity: 0.85, cursorStyle: "crosshair", cursorEffect: "trail" },
  minimal: { uiFont: "inter", numFont: "inter", displayFont: "inter", radius: 14, blur: 16, surfaceOpacity: 0.6, cursorStyle: "system", cursorEffect: "none" },
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "glass",
  dark: true,
  accent: "#ff8fb8",
  uiFont: "outfit",
  numFont: "space",
  displayFont: "playfair",
  fontScale: 1,
  radius: 22,
  blur: 24,
  surfaceOpacity: 0.12,
  tilt: 8,
  depth: 1,
  animations: true,
  // seta do Windows por padrão (a personalizada fica como opção nas configurações)
  cursorStyle: "system",
  cursorEffect: "sakura",
  cursorColor: "#ffc4dc",
  cursorSize: 1,
  taskbar: { position: "bottom", style: "dock", size: 56, autoHide: false, showLabels: false, magnify: true },
  wallpaper: {
    type: "gradient",
    gradient: "dusk",
    color: "#1a1020",
    image: null,
    blur: 0,
    dim: 0.15,
    parallax: true,
  },
  sakura: { ambient: true, density: 0.5, splash: true, splashSeconds: 4 },
  overlay: { scanlines: false, grain: true, vignette: true },
  widgetsLocked: false,
  iconStyle: "logos",
  iconShape: "squircle",
  iconColors: {},
  musicAutostart: false,
  weatherCity: "São Paulo",
  newsFeed: "https://g1.globo.com/rss/g1/",
}

export const WIDGET_SIZES: Record<WidgetType, [number, number]> = {
  clock: [320, 170],
  stopwatch: [300, 200],
  weather: [300, 190],
  news: [360, 330],
  photo: [300, 300],
  calendar: [300, 300],
  note: [260, 220],
  shortcut: [300, 260],
  music: [380, 210],
  cs2: [360, 380],
  valorant: [360, 380],
  football: [360, 380],
  lyrics: [380, 420],
  tasks: [340, 460],
  discord: [320, 230],
  ifood: [340, 320],
  whatsapp: [340, 380],
  finance: [340, 300],
  agenda: [340, 360],
  musicstats: [360, 380],
  gaming: [360, 210],
  musicclip: [480, 296],
  valagent: [320, 440],
  sysmon: [360, 260],
  pcmusic: [400, 200],
  countdown: [320, 200],
}

const defaultWidgets = (): Widget[] => [
  { id: uid(), type: "clock", x: 60, y: 60, w: 360, h: 180, config: { style: "digital", seconds: true } },
  { id: uid(), type: "weather", x: 60, y: 270, w: 300, h: 190, config: {} },
  { id: uid(), type: "calendar", x: 60, y: 490, w: 300, h: 300, config: {} },
]

interface State {
  settings: Settings
  widgets: Widget[]
  media: MediaItem[]
  habits: Habit[]
  habitLog: Record<string, string[]>
  subjects: Subject[]
  services: Service[]
  lists: ShopList[]
  tasks: Task[]
  studyTimer: StudyTimer | null
  templates: LookTemplate[]
  /** como estava antes do último template aplicado (para desfazer) */
  templateUndo: { name: string; settings: Partial<Settings>; widgets?: Widget[] } | null
  notifications: AppNotification[]
  /** histórico de escuta do YouTube Music */
  listening?: ListenStats
  /** templates do widget de agente do Valorant */
  valTemplates: ValTemplate[]
  /** registro de jogos (tempo de cada sessão) */
  gaming?: GamingData
  /** galerias salvas do quadro de fotos */
  photoGalleries: PhotoGallery[]
  // não persistido
  windows: WinState[]
  splashDone: boolean
  /** eventos das agendas (iCal), atualizados sozinhos */
  calEvents: CalEvent[]
  /** modo foco ligado à mão (o automático vem do cronômetro de Estudos) */
  focusManual: boolean
  /** busca rápida (Ctrl+K) aberta */
  paletteOpen: boolean
  /** jogos abertos agora (detectados no PC) */
  gamesRunning: RunningGame[]
  /** agente do Valorant em uso */
  valAgentNow: ValAgentNow | null
  /** aba Música: player ou estatísticas */
  musicTab: "player" | "stats"

  setSettings: (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void
  applyTheme: (t: ThemeId) => void
  resetSettings: () => void

  /** cria o widget no primeiro espaço livre encostado nos outros; devolve o id */
  addWidget: (type: WidgetType, config?: Record<string, any>) => string
  updateWidget: (id: string, patch: Partial<Widget>) => void
  /** salva posição/tamanho na orientação atual (em pé ou deitado) */
  setWidgetGeo: (id: string, g: Geo) => void
  replaceMediaFile: (id: string, d: { file: string; width: number; height: number }) => void
  updateWidgetConfig: (id: string, patch: Record<string, any>) => void
  removeWidget: (id: string) => void
  bringWidgetFront: (id: string) => void

  addMedia: (items: Omit<MediaItem, "id" | "createdAt">[]) => MediaItem[]
  removeMedia: (id: string) => void

  set: <K extends "habits" | "habitLog" | "subjects" | "services" | "lists" | "tasks" | "studyTimer">(key: K, value: State[K] | ((v: State[K]) => State[K])) => void
  toggleHabit: (habitId: string, date?: string) => void

  openWindow: (id: SectionId) => void
  closeWindow: (id: SectionId) => void
  focusWindow: (id: SectionId) => void
  patchWindow: (id: SectionId, patch: Partial<WinState>) => void
  setSplashDone: () => void
  pushNotification: (n: Omit<AppNotification, "id" | "at">) => AppNotification
  markNotificationsRead: () => void
  clearNotifications: () => void

  saveTemplate: (name: string, withWidgets: boolean) => LookTemplate
  updateTemplate: (id: string) => void
  renameTemplate: (id: string, name: string) => void
  deleteTemplate: (id: string) => void
  applyTemplate: (id: string | "default") => void
  undoTemplate: () => void
}

let zTop = 10

const fileStorage = createJSONStorage(() => ({
  getItem: () => bridge.store.get(),
  setItem: (_k: string, v: string) => bridge.store.set(v),
  removeItem: () => bridge.store.set("{}"),
}))

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      widgets: defaultWidgets(),
      media: [],
      habits: [
        { id: uid(), name: "Beber 2L de água", color: "#7cc8ff", emoji: "💧" },
        { id: uid(), name: "Exercício", color: "#8cf0b0", emoji: "🏃" },
        { id: uid(), name: "Leitura", color: "#ffb38a", emoji: "📚" },
      ],
      habitLog: {},
      subjects: [],
      services: [],
      lists: [{ id: uid(), name: "Compras", emoji: "🛒", budget: 0, items: [] }],
      tasks: [],
      studyTimer: null,
      templates: [],
      templateUndo: null,
      notifications: [],
      valTemplates: [],
      photoGalleries: [],
      windows: [],
      splashDone: false,
      calEvents: [],
      focusManual: false,
      paletteOpen: false,
      musicTab: "player",
      gamesRunning: [],
      valAgentNow: null,

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...(typeof patch === "function" ? patch(s.settings) : patch) } })),
      applyTheme: (t) =>
        set((s) => ({ settings: { ...s.settings, ...THEME_PRESETS[t], theme: t, overlay: { ...s.settings.overlay, scanlines: t === "terminal" || t === "retro" } } })),
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),

      addWidget: (type, config = {}) => {
        const id = uid()
        set((s) => {
          const [w, h] = WIDGET_SIZES[type]
          const view = { w: innerWidth, h: innerHeight, portrait: innerHeight > innerWidth }
          const others = s.widgets.map((x) => widgetGeo(x, view, s.settings.layoutRef))
          // não fica embaixo da barra de tarefas
          const tb = s.settings.taskbar
          const band = (tb.size ?? 56) + 24
          const avoid = tb.autoHide ? [] : [
            tb.position === "top" ? { x: 0, y: 0, w: view.w, h: band }
              : tb.position === "left" ? { x: 0, y: 0, w: band, h: view.h }
              : tb.position === "right" ? { x: view.w - band, y: 0, w: band, h: view.h }
              : { x: 0, y: view.h - band, w: view.w, h: band },
          ]
          const { x, y } = findSpot({ w, h }, others, view, avoid)
          const g = { x, y, w, h }
          return { widgets: [...s.widgets, { id, type, ...g, ...(view.portrait ? { portrait: g } : null), config }] }
        })
        return id
      },
      updateWidget: (id, patch) => set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      setWidgetGeo: (id, g) =>
        set((s) => {
          const portrait = innerHeight > innerWidth
          return {
            widgets: s.widgets.map((w) => (w.id === id ? (portrait ? { ...w, portrait: g } : { ...w, ...g }) : w)),
            settings: portrait ? s.settings : { ...s.settings, layoutRef: { w: innerWidth, h: innerHeight } },
          }
        }),
      replaceMediaFile: (id, d) =>
        set((s) => {
          const old = s.media.find((m) => m.id === id)
          if (!old) return {}
          bridge.media.remove(old.file)
          const wp = s.settings.wallpaper
          return {
            media: s.media.map((m) => (m.id === id ? { ...m, file: d.file, width: d.width, height: d.height } : m)),
            settings: wp.image === old.file ? { ...s.settings, wallpaper: { ...wp, image: d.file } } : s.settings,
          }
        }),
      updateWidgetConfig: (id, patch) =>
        set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...patch } } : w)) })),
      removeWidget: (id) => set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id) })),
      bringWidgetFront: (id) =>
        set((s) => {
          const w = s.widgets.find((x) => x.id === id)
          if (!w || s.widgets[s.widgets.length - 1].id === id) return {}
          return { widgets: [...s.widgets.filter((x) => x.id !== id), w] }
        }),

      addMedia: (items) => {
        const created = items.map((i) => ({ ...i, id: uid(), createdAt: Date.now() }))
        set((s) => ({ media: [...created, ...s.media] }))
        return created
      },
      removeMedia: (id) => {
        const m = get().media.find((x) => x.id === id)
        if (m) bridge.media.remove(m.file)
        set((s) => ({
          media: s.media.filter((x) => x.id !== id),
          settings:
            s.settings.wallpaper.image === m?.file
              ? { ...s.settings, wallpaper: { ...s.settings.wallpaper, image: null, type: "gradient" } }
              : s.settings,
        }))
      },

      set: (key, value) => set((s) => ({ [key]: typeof value === "function" ? (value as any)(s[key]) : value }) as any),
      toggleHabit: (habitId, date = todayISO()) =>
        set((s) => {
          const day = s.habitLog[date] ?? []
          const next = day.includes(habitId) ? day.filter((h) => h !== habitId) : [...day, habitId]
          return { habitLog: { ...s.habitLog, [date]: next } }
        }),

      openWindow: (id) =>
        set((s) => {
          zTop++
          const ex = s.windows.find((w) => w.id === id)
          if (ex) return { windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false, z: zTop } : w)) }
          // abre no monitor onde você está mexendo (com a área de trabalho em vários monitores)
          const sc = activeScreen()
          const W = Math.min(1100, sc.w - 48)
          const H = Math.min(sc.h > sc.w ? 1100 : 720, sc.h - 160)
          const off = (s.windows.length % 5) * 30
          return {
            windows: [
              ...s.windows,
              { id, z: zTop, minimized: false, maximized: false, w: W, h: H, x: sc.x + Math.max(8, (sc.w - W) / 2 + off - 60), y: sc.y + Math.max(8, (sc.h - H) / 2 + off - 50) },
            ],
          }
        }),
      closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
      focusWindow: (id) =>
        set((s) => {
          const top = s.windows.reduce((m, w) => Math.max(m, w.z), 0)
          const w = s.windows.find((x) => x.id === id)
          if (!w || w.z === top) return {}
          return { windows: s.windows.map((x) => (x.id === id ? { ...x, z: ++zTop } : x)) }
        }),
      patchWindow: (id, patch) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      setSplashDone: () => set({ splashDone: true }),
      pushNotification: (n) => {
        const full: AppNotification = { ...n, id: uid(), at: Date.now() }
        set((s) => ({ notifications: [full, ...s.notifications].slice(0, 150) }))
        return full
      },
      markNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),

      saveTemplate: (name, withWidgets) => {
        const s = get()
        const t: LookTemplate = {
          id: uid(), name: name.trim() || "Meu estilo", createdAt: Date.now(), updatedAt: Date.now(),
          settings: lookOf(s.settings),
          widgets: withWidgets ? JSON.parse(JSON.stringify(s.widgets)) : undefined,
        }
        set({ templates: [...s.templates, t] })
        return t
      },
      updateTemplate: (id) =>
        set((s) => ({
          templates: s.templates.map((t) => (t.id === id ? { ...t, updatedAt: Date.now(), settings: lookOf(s.settings), widgets: t.widgets ? JSON.parse(JSON.stringify(s.widgets)) : undefined } : t)),
        })),
      renameTemplate: (id, name) => set((s) => ({ templates: s.templates.map((t) => (t.id === id ? { ...t, name: name.trim() || t.name } : t)) })),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
      applyTemplate: (id) =>
        set((s) => {
          const t = id === "default" ? { name: "Padrão do Agenda", settings: lookOf(DEFAULT_SETTINGS), widgets: undefined } : s.templates.find((x) => x.id === id)
          if (!t) return {}
          const undo = { name: t.name, settings: lookOf(s.settings), widgets: t.widgets ? JSON.parse(JSON.stringify(s.widgets)) : undefined }
          const look = { ...t.settings }
          // papel de parede de imagem que já foi apagada da galeria: mantém o atual
          if (look.wallpaper?.type === "image" && !s.media.some((m) => m.file === look.wallpaper!.image)) delete look.wallpaper
          return {
            templateUndo: undo,
            settings: {
              ...s.settings,
              ...look,
              taskbar: { ...s.settings.taskbar, ...(look.taskbar ?? {}) },
              wallpaper: { ...s.settings.wallpaper, ...(look.wallpaper ?? {}) },
              sakura: { ...s.settings.sakura, ...(look.sakura ?? {}) },
              overlay: { ...s.settings.overlay, ...(look.overlay ?? {}) },
            },
            widgets: t.widgets ? mergeWidgets(t.widgets, s.widgets) : s.widgets,
          }
        }),
      undoTemplate: () =>
        set((s) => {
          const u = s.templateUndo
          if (!u) return {}
          return { settings: { ...s.settings, ...u.settings }, widgets: u.widgets ? mergeWidgets(u.widgets, s.widgets) : s.widgets, templateUndo: null }
        }),
    }),
    {
      name: "agenda",
      version: 1,
      storage: fileStorage,
      partialize: (s) => ({
        settings: s.settings,
        widgets: s.widgets,
        media: s.media,
        habits: s.habits,
        habitLog: s.habitLog,
        subjects: s.subjects,
        services: s.services,
        lists: s.lists,
        tasks: s.tasks,
        studyTimer: s.studyTimer,
        templates: s.templates,
        templateUndo: s.templateUndo,
        notifications: s.notifications,
        listening: s.listening,
        valTemplates: s.valTemplates,
        gaming: s.gaming,
        photoGalleries: s.photoGalleries,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        settings: {
          ...DEFAULT_SETTINGS,
          ...(persisted?.settings ?? {}),
          taskbar: { ...DEFAULT_SETTINGS.taskbar, ...(persisted?.settings?.taskbar ?? {}) },
          wallpaper: { ...DEFAULT_SETTINGS.wallpaper, ...(persisted?.settings?.wallpaper ?? {}) },
          sakura: { ...DEFAULT_SETTINGS.sakura, ...(persisted?.settings?.sakura ?? {}) },
          overlay: { ...DEFAULT_SETTINGS.overlay, ...(persisted?.settings?.overlay ?? {}) },
        },
      }),
    }
  )
)

export const useSettings = () => useStore((s) => s.settings)
