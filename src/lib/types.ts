export type ThemeId = "glass" | "metal" | "retro" | "terminal" | "minimal"
export type CursorStyle = "system" | "dot" | "ring" | "sakura" | "pixel" | "crosshair" | "arrow" | "heart" | "star" | "neon" | "diamond" | "bubble" | "paw"
export type CursorEffect = "none" | "trail" | "sakura" | "sparkle" | "glow" | "ripple" | "pixels" | "hearts" | "stars" | "bubbles" | "confetti" | "fire" | "snow" | "rainbow" | "comet" | "leaves" | "magic"
export type TaskbarPosition = "bottom" | "top" | "left" | "right"
export type TaskbarStyle = "dock" | "bar" | "floating"
export type SectionId = "today" | "habits" | "studies" | "services" | "finance" | "lists" | "music" | "discord" | "whatsapp" | "ifood" | "gallery" | "settings"
export type IconStyle = "auto" | "logos" | "color" | "glass" | "metal" | "neon" | "outline" | "flat" | "pixel"
export type WidgetType = "clock" | "stopwatch" | "weather" | "news" | "photo" | "calendar" | "note" | "shortcut" | "music" | "cs2" | "valorant" | "football" | "lyrics" | "tasks" | "discord" | "ifood" | "whatsapp" | "finance" | "agenda" | "musicstats" | "gaming" | "musicclip" | "valagent"

export interface Settings {
  theme: ThemeId
  dark: boolean
  accent: string
  uiFont: string
  numFont: string
  displayFont: string
  fontScale: number
  radius: number
  blur: number
  surfaceOpacity: number
  tilt: number
  depth: number
  animations: boolean
  cursorStyle: CursorStyle
  cursorEffect: CursorEffect
  cursorColor: string
  cursorSize: number
  /** quantidade de partículas do efeito (0.3–2.5) */
  cursorDensity?: number
  /** efeito ao clicar */
  clickEffect?: "auto" | "none" | "ripple" | "burst" | "hearts" | "confetti" | "shock"
  taskbar: {
    position: TaskbarPosition
    style: TaskbarStyle
    size: number
    autoHide: boolean
    showLabels: boolean
    magnify: boolean
  }
  wallpaper: {
    type: "gradient" | "image" | "color"
    gradient: string
    color: string
    image: string | null
    blur: number
    dim: number
    parallax: boolean
    /** recorte do assunto (PNG transparente) da imagem `fgFor` — usado pelo relógio com profundidade */
    fg?: string
    fgFor?: string
  }
  /** relógio grande no papel de parede, estilo tela de bloqueio do iPhone */
  lockClock?: LockClock
  sakura: { ambient: boolean; density: number; splash: boolean; splashSeconds: number }
  overlay: { scanlines: boolean; grain: boolean; vignette: boolean }
  widgetsLocked: boolean
  iconStyle: IconStyle
  iconShape: "squircle" | "circle" | "square"
  iconColors: Partial<Record<SectionId, string>>
  musicAutostart: boolean
  /** painel de letra aberto na aba Música */
  musicLyrics?: boolean
  /** tamanho da tela deitada usada como referência do layout */
  layoutRef?: { w: number; h: number }
  weatherCity: string
  newsFeed: string
  /** avisos: o que entra na central de notificações e quem também mostra aviso do Windows */
  notify?: NotifyPrefs
  /** agendas do Google (ou outra) pelo endereço secreto iCal */
  calendars?: CalendarFeed[]
  /** times/equipes favoritos (avisa quando o jogo começa, gols, fim) */
  favTeams?: string[]
  focus?: FocusPrefs
  /** abrir a tela Hoje quando o Agenda abre */
  todayOnStart?: boolean
  /** modo leve: sem efeito de vidro desfocado, pétalas e partículas do cursor */
  perfLite?: boolean
  /** pausar as animações enquanto um jogo está aberto (padrão: sim) */
  perfPauseInGame?: boolean
  /** minutos sem uso até Discord/WhatsApp/iFood dormirem (0 = nunca) */
  hibernateMin?: number
}

export type NotifySource = "tasks" | "whatsapp" | "ifood" | "sports" | "budgets" | "services" | "calendar" | "focus" | "system"
export interface NotifyPrefs {
  /** fonte ligada (aparece na central) */
  on: Partial<Record<NotifySource, boolean>>
  /** também mostra o aviso do Windows */
  toast: Partial<Record<NotifySource, boolean>>
  sound: boolean
}
export interface CalendarFeed { id: string; name: string; url: string; color: string; on: boolean }
export interface CalEvent { id: string; feedId: string; title: string; start: number; end: number; allDay: boolean; location?: string; color: string }
export interface FocusPrefs {
  /** liga sozinho quando o cronômetro de Estudos começa */
  auto: boolean
  muteApps: boolean
  hideWidgets: boolean
  silence: boolean
  /** link de playlist do YouTube Music para tocar no foco */
  playlist: string
}
export interface AppNotification {
  id: string
  at: number
  source: NotifySource
  title: string
  body?: string
  read?: boolean
  /** o que abrir ao clicar */
  open?: SectionId
  icon?: string
}

export interface LockClock {
  on: boolean
  style: "ios" | "thin" | "bold" | "serif" | "stacked" | "outline" | "neon" | "retro"
  font?: string
  color: string
  /** tamanho relativo à altura da tela (0.5–1.8) */
  size: number
  weight: number
  /** posição vertical/horizontal em % da tela */
  y: number
  x: number
  align: "left" | "center" | "right"
  showDate: boolean
  seconds: boolean
  /** assunto da foto na frente do relógio */
  depth: boolean
  opacity: number
  glow: boolean
  h12?: boolean
}

export interface Geo { x: number; y: number; w: number; h: number }

/** Template de personalização: só a aparência (e, se quiser, a disposição dos widgets). Nunca os seus dados. */
export interface LookTemplate {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  settings: Partial<Settings>
  widgets?: Widget[]
}
export interface Widget extends Geo {
  id: string
  type: WidgetType
  config: Record<string, any>
  /** posição/tamanho quando o monitor está em pé (retrato) */
  portrait?: Geo
}

export interface MediaItem {
  id: string
  file: string
  name: string
  width: number
  height: number
  upscaled?: "4k" | "8k" | "hd"
  /** id da imagem original (para comparar antes/depois) */
  sourceId?: string
  enhanced?: boolean
  animated?: boolean
  living?: boolean
  ai?: boolean
  createdAt: number
}

export interface Habit {
  id: string
  name: string
  color: string
  emoji: string
  archived?: boolean
}

export interface StudySession {
  id: string
  date: string
  minutes: number
  topic: string
  /** hora de início (HH:MM), quando veio do cronômetro */
  time?: string
}
export interface StudyTopic {
  id: string
  title: string
  done: boolean
  /** quando foi marcado como aprendido */
  learnedAt?: number
  note?: string
}
/** imagem enquadrada: posição (0–100%) e zoom (1–2) */
export interface ImgFrame { file: string; x: number; y: number; zoom: number }
export interface Song {
  id: string
  title: string
  url: string
  videoId?: string
  cover?: string
  /** 0–100 */
  progress: number
  cifra?: string
  lyrics?: string
  files?: string[]
  learnedAt?: number
  createdAt: number
}
export interface Subject {
  id: string
  name: string
  color: string
  emoji: string
  goalHours: number
  sessions: StudySession[]
  topics: StudyTopic[]
  notes: string
  /** segundo título (ex.: 日本語, français) */
  subtitle?: string
  description?: string
  cover?: ImgFrame
  pageBg?: ImgFrame
  timerBg?: ImgFrame
  /** matéria com repertório de músicas (instrumento, canto…) */
  music?: boolean
  songs?: Song[]
}
/** cronômetro de estudo (continua contando mesmo com a janela fechada) */
export interface StudyTimer { subjectId: string; startedAt: number | null; elapsed: number }

export interface Task {
  id: string
  title: string
  /** dia (AAAA-MM-DD); sem data = "algum dia" */
  date?: string
  /** horário HH:MM (opcional) */
  time?: string
  done: boolean
  doneAt?: number
  color?: string
  /** já avisou no horário */
  notified?: boolean
  createdAt: number
}

export interface Service {
  id: string
  date: string
  client: string
  description: string
  category: string
  value: number
  paid: number
  dueDate: string
  payMethod: string
  notes: string
  address?: string
  /** data em que o pagamento foi recebido */
  payDate?: string
  /** anexos (arquivos na pasta de mídia) */
  receipts?: string[]
  invoices?: string[]
  photos?: string[]
}

export interface ListItem {
  id: string
  name: string
  qty: number
  price: number
  checked: boolean
  link: string
  priority: 0 | 1 | 2
}
export interface ShopList {
  id: string
  name: string
  emoji: string
  budget: number
  items: ListItem[]
}

export interface WinState {
  id: SectionId
  z: number
  minimized: boolean
  maximized: boolean
  x: number
  y: number
  w: number
  h: number
}
