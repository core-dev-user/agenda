// Ponte para o Electron. Em navegador comum, cai em fallbacks.
type Unsub = () => void
export interface SysStats {
  at: number
  cpu: { usage: number; cores: number[]; speed: number; name?: string; threads?: number }
  mem: { total: number; used: number }
  gpu: { name: string; usage: number | null; memUsed: number | null; memTotal: number | null; temp: number | null; power: number | null; powerLimit: number | null; fan: number | null; clock: number | null; vendor: string } | null
  net: { rx: number; tx: number } | null
  disk: { busy: number; read: number; write: number } | null
  drives: { id: string; size: number; free: number }[]
  top: { name: string; mem: number }[]
  uptime: number
}
export interface AgendaBridge {
  store: { get(): string | null; set(data: string): void; flush?(): void }
  win: {
    minimize(): void
    toggleMaximize(): void
    fullscreen(on: boolean): void
    close(): void
    onState(cb: (s: { maximized: boolean }) => void): Unsub
  }
  app: { autostart(v?: boolean): Promise<boolean>; openExternal(url: string): Promise<void>; screenInfo(): Promise<{ long: number }>; show(): Promise<void>; quit(): Promise<void> }
  sys: {
    get(): Promise<SysConfig>
    set(p: Partial<Pick<SysConfig, "closeToTray" | "hotkey" | "cloudDir" | "cloudOn">>): Promise<SysConfig>
    pickCloud(): Promise<string>
    cloudNow(): Promise<SysConfig>
  }
  games: {
    get(): Promise<GamesState>
    config(cfg: { custom: { exe: string; name: string }[]; ignored: string[] }): Promise<void>
    scan(): Promise<void>
    icon(path: string): Promise<string>
    onState(cb: (s: GamesState) => void): Unsub
    /** agente do Valorant em uso (seleção ou partida) */
    valorantAgent(): Promise<ValAgentNow | null>
    onValorantAgent(cb: (a: ValAgentNow | null) => void): Unsub
  }
  sysmon: { sub(id: string): Promise<boolean>; unsub(id: string): Promise<boolean>; onData(cb: (d: SysStats) => void): Unsub }
  mode: {
    get(): Promise<{ mode: UiMode | ""; monitors: number }>
    /** salva e reabre o app no novo modo */
    set(m: UiMode): Promise<boolean>
    /** modo área de trabalho: true = vem para a frente (aba aberta), false = volta para o fundo */
    raise(on: boolean): Promise<void>
    detectApps(): Promise<{ apps: PcApp[]; monitors: number }>
    onSummon(cb: () => void): Unsub
  }
  bar: {
    get(): Promise<BarConfig>
    set(p: Partial<Pick<BarConfig, "on" | "height" | "position">>): Promise<BarConfig>
    sync(data: BarSync): void
    hello(): Promise<BarSync | null>
    toMain(msg: BarToMain): void
    /** abre um menu acima da barra (x = centro do botão, em px da barra) */
    menu(kind: BarMenu, anchorX: number, w: number, h: number): Promise<void>
    closeMenu(): Promise<void>
    onMenuState(cb: (kind: BarMenu | "") => void): Unsub
    click(h: string, wasMin: boolean): Promise<string>
    win(cmd: "activate" | "minimize" | "close", h: string): Promise<string>
    desktop(): Promise<string>
    peek(on: boolean): Promise<string>
    apps(): Promise<{ name: string; path: string }[]>
    icon(file: string): Promise<string>
    launch(file: string): Promise<string>
    power(kind: "lock" | "sleep" | "restart" | "shutdown" | "settings" | "volume" | "network"): Promise<void>
    onWins(cb: (d: { wins: PcWindow[]; fg: string }) => void): Unsub
    onSync(cb: (d: BarSync) => void): Unsub
    onMain(cb: (m: BarToMain) => void): Unsub
  }
  share: {
    sources(): Promise<ShareSource[]>
    pick(id: string): Promise<void>
    /** som do PC sem o Discord (ou sem o próprio Agenda) */
    audioStart(without: "discord" | "agenda"): Promise<{ ok: boolean; excluded: "discord" | "agenda" }>
    audioStop(): Promise<void>
    onAudio(cb: (pcm: Uint8Array) => void): Unsub
    onAudioEnd(cb: (msg: string) => void): Unsub
  }
  pcmedia: { sub(id: string, app?: string): Promise<PcMedia | null>; unsub(id: string): Promise<void>; cmd(c: "toggle" | "next" | "prev"): Promise<void>; onState(cb: (m: PcMedia) => void): Unsub }
  finance: {
    status(): Promise<{ exists: boolean; hasPin: boolean; unlocked: boolean; secure: boolean; waitMs: number }>
    open(pin?: string): Promise<{ ok: boolean; data?: string | null; error?: "pin" | "wait"; waitMs?: number }>
    lock(): Promise<boolean>
    save(txt: string): Promise<boolean>
    setPin(oldPin: string, newPin: string | null): Promise<boolean>
  }
  media: {
    import(): Promise<{ file: string; name: string; width: number; height: number; animated?: boolean }[]>
    saveAnimation(p: { width: number; height: number; frames: Uint8Array; delay: number; name: string; loopName?: string }): Promise<{ file: string; name: string; width: number; height: number; animated?: boolean }>
    remove(file: string): Promise<void>
    /** abre no programa padrão do Windows */
    open(file: string): Promise<void>
    /** escolher arquivos para anexar (imagens, PDF…) */
    attach(kind?: "images" | "any"): Promise<{ file: string; name: string; image: boolean }[]>
    saveDataUrl(dataUrl: string, base?: string): Promise<string>
    exportFile(file: string, name?: string): Promise<boolean>
    upscale(
      file: string,
      target: number,
      preferAI: boolean,
      opts?: { model?: "photo" | "art"; enhance?: number }
    ): Promise<{ file: string; name: string; width: number; height: number; usedAI: boolean; tag: "8k" | "4k" | "hd" }>
    paste(): Promise<MediaDesc[]>
    importFiles(files: FileList | File[]): Promise<MediaDesc[]>
    edit(file: string, ops: EditOps): Promise<MediaDesc>
    onProgress(cb: (p: { file: string; pct: number; stage: string }) => void): Unsub
  }
  ai: { status(): Promise<{ installed: boolean; sharp: boolean }>; install(): Promise<boolean>; onProgress(cb: (n: number) => void): Unsub }
  net: { text(url: string): Promise<string> }
  sports: { get(sport: "cs2" | "valorant" | "football", opts?: { leagues?: string[] }): Promise<SportMatch[]> }
  webapp: {
    open(id: WebAppId): Promise<void>
    embed(id: WebAppId, b: { x: number; y: number; w: number; h: number; radius?: number } | null): Promise<void>
    popout(id: WebAppId): Promise<void>
    dock(id: WebAppId): Promise<void>
    nav(id: WebAppId, where: "back" | "reload" | "home" | string): Promise<void>
    /** widget na tela: mantém o app carregado e lê com frequência */
    watch(id: WebAppId, on: boolean): Promise<void>
    discord(cmd: "mute" | "deafen" | "disconnect"): Promise<void>
    ifoodOrders(): Promise<IfoodRead>
    /** imagem (data URL) do mapa do acompanhamento */
    ifoodMap(rect: { x: number; y: number; w: number; h: number }): Promise<string | null>
    url(id: WebAppId): Promise<string>
    whatsapp(): Promise<WhatsRead>
    whatsappOpen(name: string): Promise<void>
    /** silencia o som do app (modo foco) */
    mute(id: WebAppId, on: boolean): Promise<void>
    /** minutos sem uso até o app dormir (0 = nunca) */
    hibernate(min: number): Promise<void>
    status(): Promise<Record<WebAppId, { alive: boolean; url: string; asleep: boolean; lastUse: number }>>
    onState(cb: (s: WebAppState) => void): Unsub
  }
  music: {
    open(): Promise<void>
    /** encaixa o player na área indicada (px da janela) ou tira de lá (null) */
    embed(b: { x: number; y: number; w: number; h: number; radius?: number } | null): Promise<void>
    /** mostra só o clipe do player na área indicada (widget do clipe) ou tira (null) */
    clip(b: { x: number; y: number; w: number; h: number; radius?: number } | null): Promise<void>
    /** fila ("A seguir") do YouTube Music */
    queue(): Promise<QueueItem[]>
    /** leva o player para uma janela separada */
    popout(): Promise<void>
    /** fecha a janela separada e devolve o player para o Agenda */
    dock(): Promise<void>
    cmd(cmd: "toggle" | "play" | "pause" | "next" | "prev" | "like" | "shuffle" | "seek" | "volume" | "search" | "url" | "home" | "library" | "back" | "playQueue" | "videoOn" | "videoOff", arg?: number | string): Promise<void>
    logout(): Promise<void>
    /** liga/desliga a transmissão do clipe para este visualizador */
    video(id: string, on: boolean, width?: number): Promise<void>
    onState(cb: (s: MusicState) => void): Unsub
    onFrame(cb: (f: { url: string; w: number; h: number }) => void): Unsub
  }
}

export type WebAppId = "discord" | "ifood" | "whatsapp"
export interface RunningGame { id: string; name: string; color: string; start: number; path: string; exe: string; art?: { logo?: string; hero?: string; icon?: string } }
export interface ValAgentNow { id: string; locked: boolean; state: string }
export interface GamesState { playing: RunningGame[]; at: number }

export interface BarConfig { on: boolean; height: number; position: "bottom" | "top"; available: boolean; active: boolean }
export interface PcWindow { h: string; title: string; exe: string; name: string; min: boolean; icon: string }
export interface PinnedApp { path: string; name: string }
/** o que a janela principal manda para a barra: aparência, fixados e avisos */
export interface BarSync {
  vars: Record<string, string>
  theme: string
  dark: boolean
  fontScale: number
  style: "dock" | "bar" | "floating"
  showLabels: boolean
  pins: PinnedApp[]
  unread: number
  sections: { id: string; label: string; color: string }[]
}
export type BarToMain =
  | { type: "open"; id: string }
  | { type: "palette" }
  | { type: "widgets" }
  | { type: "bell" }
  | { type: "assistant" }
  | { type: "pin"; app: PinnedApp }
  | { type: "unpin"; path: string }
export interface ShareSource { id: string; name: string; screen: boolean; thumb: string; icon: string }
export type BarMenu ="start" | "power" | "clock"
export type UiMode = "app" | "desktop" | "screen"
export type PcApp = "spotify" | "deezer" | "applemusic" | "amazonmusic" | "tidal" | "discord" | "whatsapp" | "steam" | "cs2" | "valorant" | "lol" | "epic"
export interface PcMedia {
  none?: boolean
  app?: string
  title?: string
  artist?: string
  album?: string
  playing?: boolean
  pos?: number
  dur?: number
  canNext?: boolean
  canPrev?: boolean
  art?: string | null
  newTrack?: boolean
}
export interface SysConfig { closeToTray: boolean; hotkey: string; cloudDir: string; cloudOn: boolean; lastCloud: number; cloudError: string; guesses: { path: string; label: string }[]; hotkeyOk?: boolean }
export interface WhatsChat { name: string; last: string; unread: number; time: string; avatar: string }
export interface WhatsRead { loggedIn: boolean; qr?: boolean; loading?: boolean; totalUnread: number; chats: WhatsChat[] }
export interface DiscordPerson { name: string; avatar: string; speaking: boolean; muted: boolean; deaf: boolean }
export interface DiscordCall { loggedIn: boolean; inCall: boolean; channel: string; server: string; status: string; muted: boolean; deafened: boolean; people: DiscordPerson[]; myAvatar: string; myName?: string; meSpeaking?: boolean }
export interface WebAppState { id: WebAppId; open: boolean; popped: boolean; embedded: boolean; discord?: DiscordCall }
export interface IfoodRead { loggedOut: boolean; orders: IfoodOrder[]; mapRect?: { x: number; y: number; w: number; h: number } | null; onOrders?: boolean; check?: boolean; loading?: boolean; error?: string }
export interface IfoodOrder { name: string; status: string; price: string; when: string; img: string; link: string; lines: string[] }

export interface SportTeam { name: string; short: string; logo?: string; flag?: string; score?: string; win?: boolean }
export interface SportMatch {
  id: string
  start: number
  state: "live" | "upcoming" | "done"
  a: SportTeam
  b: SportTeam
  detail: string
  event: string
  eventLogo?: string
  league?: string
  link: string
}

export interface QueueItem { i: number; title: string; artist: string; duration: string; img: string; current: boolean }

export interface MusicState {
  open: boolean
  visible?: boolean
  popped?: boolean
  embedded?: boolean
  ready?: boolean
  title?: string
  artist?: string
  album?: string
  art?: string
  playing?: boolean
  time?: number
  duration?: number
  volume?: number
  liked?: boolean
  hasVideo?: boolean
  vw?: number
  vh?: number
  videoMode?: boolean
  ad?: boolean
  signedIn?: boolean
}

export type MediaDesc = { file: string; name: string; width: number; height: number; animated?: boolean }
export interface EditOps {
  rotate?: 0 | 90 | 180 | 270
  flipH?: boolean
  flipV?: boolean
  crop?: { x: number; y: number; w: number; h: number } | null
  brightness?: number
  contrast?: number
  saturation?: number
  warmth?: number
  sharpen?: number
}

declare global {
  interface Window {
    agenda?: AgendaBridge
  }
}

const noop = () => () => {}
const browserFallback: AgendaBridge = {
  store: { get: () => localStorage.getItem("agenda-data"), set: (d) => localStorage.setItem("agenda-data", d) },
  win: { minimize() {}, toggleMaximize() {}, fullscreen(on) { on ? document.documentElement.requestFullscreen() : document.exitFullscreen() }, close() {}, onState: noop },
  app: { autostart: async () => false, openExternal: async (u) => void window.open(u, "_blank"), screenInfo: async () => ({ long: Math.max(screen.width, screen.height) * devicePixelRatio }), show: async () => {}, quit: async () => {} },
  sys: (() => { const c: SysConfig = { closeToTray: false, hotkey: "", cloudDir: "", cloudOn: false, lastCloud: 0, cloudError: "", guesses: [] }; return { get: async () => c, set: async () => c, pickCloud: async () => "", cloudNow: async () => c } })(),
  games: { get: async () => ({ playing: [], at: Date.now() }), config: async () => {}, scan: async () => {}, icon: async () => "", onState: noop, valorantAgent: async () => null, onValorantAgent: noop },
  sysmon: { sub: async () => false, unsub: async () => false, onData: noop },
  mode: { get: async () => ({ mode: "screen", monitors: 1 }), set: async () => false, raise: async () => {}, detectApps: async () => ({ apps: [], monitors: 1 }), onSummon: noop },
  pcmedia: { sub: async () => null, unsub: async () => {}, cmd: async () => {}, onState: noop },
  share: { sources: async () => [], pick: async () => {}, audioStart: async () => ({ ok: false, excluded: "agenda" }), audioStop: async () => {}, onAudio: noop, onAudioEnd: noop },
  bar: (() => {
    const c: BarConfig = { on: false, height: 64, position: "bottom", available: false, active: false }
    return { get: async () => c, set: async () => c, sync() {}, hello: async () => null, toMain() {}, menu: async () => {}, closeMenu: async () => {}, onMenuState: noop, click: async () => "", win: async () => "", desktop: async () => "", peek: async () => "", apps: async () => [], icon: async () => "", launch: async () => "", power: async () => {}, onWins: noop, onSync: noop, onMain: noop }
  })(),
  finance: {
    status: async () => ({ exists: !!localStorage.getItem("agenda-finance"), hasPin: false, unlocked: true, secure: false, waitMs: 0 }),
    open: async () => ({ ok: true, data: localStorage.getItem("agenda-finance") }),
    lock: async () => true,
    save: async (t) => (localStorage.setItem("agenda-finance", t), true),
    setPin: async () => false,
  },
  media: {
    import: async () => [],
    paste: async () => [],
    importFiles: async () => [],
    edit: async () => { throw new Error("Disponível apenas no app desktop") },
    saveAnimation: async () => { throw new Error("Disponível apenas no app desktop") },
    remove: async () => {},
    open: async () => {},
    attach: async () => [],
    saveDataUrl: async () => { throw new Error("Disponível apenas no app desktop") },
    exportFile: async () => false,
    upscale: async () => { throw new Error("Disponível apenas no app desktop") },
    onProgress: noop,
  },
  ai: { status: async () => ({ installed: false, sharp: false }), install: async () => false, onProgress: noop },
  net: { text: async (u) => (await fetch(u)).text() },
  sports: { get: async () => [] },
  webapp: { open: async () => {}, embed: async () => {}, popout: async () => {}, dock: async () => {}, nav: async () => {}, watch: async () => {}, discord: async () => {}, ifoodOrders: async () => ({ loggedOut: false, orders: [] as IfoodOrder[] }), whatsapp: async () => ({ loggedIn: false, totalUnread: 0, chats: [] }), ifoodMap: async () => null, url: async () => "", whatsappOpen: async () => {}, mute: async () => {}, hibernate: async () => {}, status: async () => ({} as any), onState: noop },
  music: { open: async () => {}, embed: async () => {}, clip: async () => {}, queue: async () => [], popout: async () => {}, dock: async () => {}, cmd: async () => {}, logout: async () => {}, video: async () => {}, onState: noop, onFrame: noop },
}

export const bridge: AgendaBridge = window.agenda ?? browserFallback

/** Limpa mensagens de erro do IPC para exibir ao usuário. */
export const friendlyError = (e: unknown) => {
  const m = String((e as any)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")
  if (/ERR_(CONNECTION|INTERNET|NAME_NOT_RESOLVED|NETWORK|TIMED_OUT)/.test(m)) return "Sem conexão com a internet"
  return m
}
export const isDesktop = !!window.agenda
export const mediaUrl = (file: string | null | undefined) => (file ? `agenda://media/${encodeURIComponent(file)}` : "")
