const { contextBridge, ipcRenderer, webUtils } = require("electron")

const on = (channel) => (cb) => {
  const h = (_e, data) => cb(data)
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

contextBridge.exposeInMainWorld("agenda", {
  store: {
    get: () => ipcRenderer.sendSync("store:get"),
    set: (data) => ipcRenderer.send("store:set", data),
    flush: () => ipcRenderer.sendSync("store:flushSync"),
  },
  win: {
    minimize: () => ipcRenderer.send("win:minimize"),
    toggleMaximize: () => ipcRenderer.send("win:toggleMaximize"),
    fullscreen: (on) => ipcRenderer.send("win:fullscreen", on),
    close: () => ipcRenderer.send("win:close"),
    onState: on("win:state"),
  },
  app: {
    autostart: (v) => ipcRenderer.invoke("app:autostart", v),
    openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
    screenInfo: () => ipcRenderer.invoke("app:screenInfo"),
    show: () => ipcRenderer.invoke("app:show"),
    quit: () => ipcRenderer.invoke("app:quit"),
  },
  sys: {
    get: () => ipcRenderer.invoke("sys:get"),
    set: (p) => ipcRenderer.invoke("sys:set", p),
    pickCloud: () => ipcRenderer.invoke("sys:pickCloud"),
    cloudNow: () => ipcRenderer.invoke("sys:cloudNow"),
  },
  games: {
    get: () => ipcRenderer.invoke("games:get"),
    config: (cfg) => ipcRenderer.invoke("games:config", cfg),
    scan: () => ipcRenderer.invoke("games:scan"),
    icon: (p) => ipcRenderer.invoke("games:icon", p),
    onState: on("games:state"),
    valorantAgent: () => ipcRenderer.invoke("valorant:agent"),
    onValorantAgent: on("valorant:agent"),
  },
  sysmon: {
    sub: (id) => ipcRenderer.invoke("sysmon:sub", id),
    unsub: (id) => ipcRenderer.invoke("sysmon:unsub", id),
    onData: on("sysmon:data"),
  },
  finance: {
    status: () => ipcRenderer.invoke("finance:status"),
    open: (pin) => ipcRenderer.invoke("finance:open", pin),
    lock: () => ipcRenderer.invoke("finance:lock"),
    save: (txt) => ipcRenderer.invoke("finance:save", txt),
    setPin: (oldPin, newPin) => ipcRenderer.invoke("finance:setPin", oldPin, newPin),
  },
  media: {
    import: () => ipcRenderer.invoke("media:import"),
    remove: (file) => ipcRenderer.invoke("media:delete", file),
    open: (file) => ipcRenderer.invoke("media:open", file),
    attach: (kind) => ipcRenderer.invoke("media:attach", kind),
    saveDataUrl: (dataUrl, base) => ipcRenderer.invoke("media:saveDataUrl", dataUrl, base),
    exportFile: (file, name) => ipcRenderer.invoke("media:export", file, name),
    upscale: (file, target, preferAI, opts) => ipcRenderer.invoke("media:upscale", file, target, preferAI, opts),
    paste: () => ipcRenderer.invoke("media:paste"),
    importFiles: (files) => ipcRenderer.invoke("media:importPaths", Array.from(files || []).map((f) => webUtils.getPathForFile(f))),
    edit: (file, ops) => ipcRenderer.invoke("media:edit", file, ops),
    saveAnimation: (payload) => ipcRenderer.invoke("media:saveAnimation", payload),
    onProgress: on("upscale:progress"),
  },
  ai: {
    status: () => ipcRenderer.invoke("ai:status"),
    install: () => ipcRenderer.invoke("ai:install"),
    onProgress: on("ai:progress"),
  },
  net: { text: (url) => ipcRenderer.invoke("net:text", url) },
  sports: { get: (sport, opts) => ipcRenderer.invoke("sports:get", sport, opts) },
  webapp: {
    open: (id) => ipcRenderer.invoke("webapp:open", id),
    embed: (id, b) => ipcRenderer.invoke("webapp:embed", id, b),
    popout: (id) => ipcRenderer.invoke("webapp:popout", id),
    dock: (id) => ipcRenderer.invoke("webapp:dock", id),
    nav: (id, where) => ipcRenderer.invoke("webapp:nav", id, where),
    watch: (id, on) => ipcRenderer.invoke("webapp:watch", id, on),
    discord: (cmd) => ipcRenderer.invoke("webapp:discord", cmd),
    ifoodOrders: () => ipcRenderer.invoke("webapp:ifoodOrders"),
    ifoodMap: (rect) => ipcRenderer.invoke("webapp:ifoodMap", rect),
    url: (id) => ipcRenderer.invoke("webapp:url", id),
    whatsapp: () => ipcRenderer.invoke("webapp:whatsapp"),
    whatsappOpen: (name) => ipcRenderer.invoke("webapp:whatsappOpen", name),
    mute: (id, on) => ipcRenderer.invoke("webapp:mute", id, on),
    hibernate: (min) => ipcRenderer.invoke("webapp:hibernate", min),
    status: () => ipcRenderer.invoke("webapp:status"),
    onState: on("webapp:state"),
  },
  music: {
    open: () => ipcRenderer.invoke("music:open"),
    embed: (b) => ipcRenderer.invoke("music:embed", b),
    clip: (b) => ipcRenderer.invoke("music:clip", b),
    queue: () => ipcRenderer.invoke("music:queue"),
    popout: () => ipcRenderer.invoke("music:popout"),
    dock: () => ipcRenderer.invoke("music:dock"),
    cmd: (cmd, arg) => ipcRenderer.invoke("music:cmd", cmd, arg),
    logout: () => ipcRenderer.invoke("music:logout"),
    video: (id, on, width) => ipcRenderer.invoke("music:video", id, on, width),
    onState: on("music:state"),
    onFrame: on("music:frame"),
  },
})
