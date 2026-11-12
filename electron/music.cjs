// Integração com o YouTube Music (login salvo), controle e leitura do player.
// O player é um único painel (WebContentsView) que pode ficar:
//  - encaixado dentro da aba Música do Agenda,
//  - numa janela separada,
//  - ou solto em segundo plano (tocando, sem aparecer).
// Mudar de lugar não recarrega a página: a música continua tocando.
const { BrowserWindow, WebContentsView, session, shell } = require("electron")
const path = require("node:path")

const HOME = "https://music.youtube.com/"
/** @type {import("electron").WebContentsView | null} */
let view = null
/** @type {BrowserWindow | null} janela separada */
let popup = null
let embedded = false
let timer = null
let getMain = () => null
const alive = () => !!view && !view.webContents.isDestroyed()
const wc = () => view.webContents
/** quem está assistindo o clipe (widgets / aba Música) -> largura pedida */
const viewers = new Map()
function videoOpts() {
  const on = viewers.size > 0
  return { on, width: on ? Math.max(...viewers.values()) : 0 }
}
function pushVideo() {
  if (alive()) wc().send("music:video", videoOpts())
}

const POLL = `(() => {
  const v = document.querySelector('video');
  const p = document.querySelector('#movie_player');
  const bar = document.querySelector('ytmusic-player-bar');
  const md = navigator.mediaSession && navigator.mediaSession.metadata;
  const txt = (sel) => (bar && bar.querySelector(sel) && bar.querySelector(sel).textContent || '').trim();
  const title = (md && md.title) || txt('.title');
  const artist = (md && md.artist) || txt('.byline').split('•')[0].trim();
  const album = (md && md.album) || '';
  let art = '';
  if (md && md.artwork && md.artwork.length) art = md.artwork[md.artwork.length - 1].src;
  else { const im = bar && bar.querySelector('img'); art = im ? im.src : ''; }
  const likeEl = bar && bar.querySelector('ytmusic-like-button-renderer');
  const dur = v && isFinite(v.duration) ? v.duration : 0;
  let volume = 100;
  try { volume = p && p.getVolume ? p.getVolume() : Math.round((v ? v.volume : 1) * 100); } catch (e) {}
  return {
    ready: !!v && !!title,
    title, artist, album, art,
    playing: v ? !v.paused && !v.ended : false,
    time: v ? v.currentTime : 0,
    duration: dur,
    volume,
    liked: likeEl ? likeEl.getAttribute('like-status') === 'LIKE' : false,
    hasVideo: !!document.querySelector('ytmusic-av-toggle:not([hidden])'),
    videoMode: (() => {
      const pl = document.querySelector('ytmusic-player');
      const mode = pl && (pl.getAttribute('playback-mode') || '');
      if (mode) return mode.indexOf('OMV') >= 0;
      const t = document.querySelector('ytmusic-av-toggle');
      const vb = t && t.querySelector('.video-button');
      return !!(vb && (vb.getAttribute('aria-pressed') === 'true' || vb.classList.contains('selected') || vb.hasAttribute('active')));
    })(),
    vw: v ? v.videoWidth : 0,
    vh: v ? v.videoHeight : 0,
    ad: !!document.querySelector('#movie_player.ad-showing, .ytp-ad-player-overlay, .ytp-ad-module .ytp-ad-text'),
    signedIn: !!document.querySelector('ytmusic-settings-button img, #avatar img, ytmusic-nav-bar img.ytmusic-settings-button'),
  };
})()`

const CMD = {
  toggle: `(() => { const b = document.querySelector('ytmusic-player-bar #play-pause-button'); if (b) b.click(); else { const v = document.querySelector('video'); if (v) v.paused ? v.play() : v.pause(); } })()`,
  play: `(() => { const v = document.querySelector('video'); if (v && v.paused) { const b = document.querySelector('ytmusic-player-bar #play-pause-button'); b ? b.click() : v.play(); } })()`,
  pause: `(() => { const v = document.querySelector('video'); if (v && !v.paused) { const b = document.querySelector('ytmusic-player-bar #play-pause-button'); b ? b.click() : v.pause(); } })()`,
  next: `(() => { const b = document.querySelector('ytmusic-player-bar .next-button'); if (b) b.click(); else { const p = document.querySelector('#movie_player'); p && p.nextVideo && p.nextVideo(); } })()`,
  prev: `(() => { const b = document.querySelector('ytmusic-player-bar .previous-button'); if (b) b.click(); else { const p = document.querySelector('#movie_player'); p && p.previousVideo && p.previousVideo(); } })()`,
  like: `(() => { const r = document.querySelector('ytmusic-player-bar ytmusic-like-button-renderer'); if (!r) return; const b = r.querySelector('#button-shape-like button, .like button, .like, [aria-label*="Gostei"], [aria-label*="Like"]'); b && b.click(); })()`,
  shuffle: `(() => { const b = document.querySelector('ytmusic-player-bar .shuffle'); b && b.click(); })()`,
  // alterna entre a versão "Música" (capa) e "Vídeo" (clipe), igual ao botão do app
  videoOn: `(() => { const t = document.querySelector('ytmusic-av-toggle'); if (!t) return; const b = t.querySelector('.video-button, [class*="video-button"]') || t.querySelectorAll('div,button,tp-yt-paper-button')[1]; b && b.click(); })()`,
  videoOff: `(() => { const t = document.querySelector('ytmusic-av-toggle'); if (!t) return; const b = t.querySelector('.song-button, [class*="song-button"]') || t.querySelectorAll('div,button,tp-yt-paper-button')[0]; b && b.click(); })()`,
}

// fila ("A seguir") do player: itens na ordem, com o que está tocando marcado
const QUEUE_ITEMS = `[...new Set([...document.querySelectorAll('ytmusic-player-queue ytmusic-player-queue-item, #side-panel ytmusic-player-queue-item')])]`
const QUEUE = `(() => {
  const items = ${QUEUE_ITEMS};
  const txt = (el, sel) => { const e = el.querySelector(sel); return e ? e.textContent.trim().replace(/\\s+/g, ' ') : ''; };
  return items.slice(0, 80).map((it, i) => {
    // miniatura: a imagem só carrega quando fica visível; usa os dados do item ou o id do vídeo
    const im = it.querySelector('img');
    const d = it.data || (it.__data && it.__data.data) || {};
    const th = d.thumbnail && d.thumbnail.thumbnails && d.thumbnail.thumbnails[0] && d.thumbnail.thumbnails[0].url;
    const vid = d.videoId || ((it.querySelector('a[href*="watch?v="]') || {}).href || '').split('v=')[1];
    const img = { src: (im && /^https?:/.test(im.src) && im.src) || th || (vid ? 'https://i.ytimg.com/vi/' + String(vid).split('&')[0] + '/default.jpg' : '') };
    const st = it.getAttribute('play-button-state') || '';
    return {
      i,
      title: txt(it, '.song-title'),
      artist: txt(it, '.byline'),
      duration: txt(it, '.duration'),
      img: img ? (img.src || '') : '',
      current: it.hasAttribute('selected') || st === 'playing' || st === 'paused',
    };
  }).filter((q) => q.title);
})()`

function ua() {
  // remove "Electron/x" e o nome do app para o Google tratar como um Chrome comum (login funciona melhor)
  return session.defaultSession.getUserAgent().replace(/\s*Electron\/\S+/i, "").replace(/\s*agenda\/\S+/i, "")
}

function sendState(state) {
  const w = getMain()
  if (w && !w.isDestroyed()) w.webContents.send("music:state", state)
}

async function poll() {
  if (!alive()) return sendState({ open: false })
  const where = { visible: embedded || !!popup, popped: !!popup, embedded }
  try {
    const st = await wc().executeJavaScript(POLL, true)
    sendState({ open: true, ...where, ...st })
  } catch {
    sendState({ open: true, ...where, ready: false })
  }
}

/* ---------------- widget do clipe ----------------
 * O mesmo painel do YouTube Music vai para o widget, mostrando SÓ o vídeo (CSS por cima da página).
 * O vídeo é decodificado pela placa de vídeo e fica sincronizado com o som: liso, sem transmitir quadros.
 * A aba Música tem prioridade: se ela estiver na frente, o widget mostra a capa.
 */
let owner = null // "section" | "clip" | null
let clipCssKey = null
const CLIP_CSS = `
html.agenda-clip, html.agenda-clip body { background: #000 !important; overflow: hidden !important; }
html.agenda-clip body * { visibility: hidden !important; pointer-events: none !important; }
html.agenda-clip #movie_player, html.agenda-clip #movie_player video { visibility: visible !important; }
html.agenda-clip #movie_player { position: fixed !important; left: 0 !important; top: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 2147483647 !important; background: #000 !important; transform: none !important; }
html.agenda-clip #movie_player .html5-video-container { width: 100% !important; height: 100% !important; }
html.agenda-clip video.html5-main-video { left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important; object-fit: contain !important; }
`
const CLIP_ON = `(() => {
  document.documentElement.classList.add('agenda-clip');
  // o vídeo só existe com a tela do player aberta
  const lay = document.querySelector('ytmusic-app-layout');
  if (lay && !lay.hasAttribute('player-page-open')) { const b = document.querySelector('ytmusic-player-bar .toggle-player-page-button, ytmusic-player-bar .thumbnail-image-wrapper'); b && b.click(); }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
})()`
const CLIP_OFF = `(() => { document.documentElement.classList.remove('agenda-clip'); setTimeout(() => window.dispatchEvent(new Event('resize')), 50); })()`
async function setClipCss(on) {
  if (!alive()) return
  try {
    if (on && !clipCssKey) clipCssKey = await wc().insertCSS(CLIP_CSS)
    await wc().executeJavaScript(on ? CLIP_ON : CLIP_OFF, true)
  } catch {}
}
let clipOn = false
function clip(b) {
  if (popup) return
  const main = getMain()
  if (!main || main.isDestroyed()) return
  if (!b) {
    if (owner === "clip") { owner = null; clipOn = false; detach(); setClipCss(false) }
    return
  }
  if (owner === "section") return
  ensure()
  owner = "clip"
  if (!embedded) { main.contentView.addChildView(view); embedded = true }
  if (typeof view.setBorderRadius === "function") view.setBorderRadius(Math.round(b.radius || 0))
  view.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.w)), height: Math.max(1, Math.round(b.h)) })
  if (!clipOn) { clipOn = true; setClipCss(true) }
}

/** tira o painel de onde estiver (continua tocando em segundo plano) */
function detach() {
  if (!view) return
  const main = getMain()
  if (embedded && main && !main.isDestroyed()) { try { main.contentView.removeChildView(view) } catch {} }
  embedded = false
  if (popup && !popup.isDestroyed()) { try { popup.contentView.removeChildView(view) } catch {} }
}

function ensure() {
  if (alive()) return view
  const ses = session.fromPartition("persist:ytmusic")
  ses.setUserAgent(ua())
  view = new WebContentsView({
    webPreferences: { partition: "persist:ytmusic", preload: path.join(__dirname, "music-preload.cjs"), backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required", contextIsolation: true, nodeIntegration: false },
  })
  view.setBackgroundColor("#030303")
  if (process.env.AGENDA_SHOT) wc().setAudioMuted(true) // modo de verificação: sem som
  wc().setWindowOpenHandler(({ url }) => {
    // login do Google pode abrir popups; o resto vai para o navegador
    if (/accounts\.google\.|youtube\.com|google\.com\/(signin|accounts)/.test(url)) return { action: "allow" }
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  // a página recarrega ao navegar: reaplica o modo clipe
  wc().on("dom-ready", () => { clipCssKey = null; if (clipOn) setClipCss(true) })
  wc().loadURL(HOME)
  if (!timer) timer = setInterval(poll, 1000)
  return view
}

/** encaixa o painel na aba Música (bounds em px da janela) ou tira de lá (null) */
function embed(b) {
  if (popup) return // está na janela separada
  const main = getMain()
  if (!main || main.isDestroyed()) return
  if (!b) {
    if (embedded && owner === "section") { owner = null; detach(); poll() }
    return
  }
  ensure()
  if (owner === "clip") { detach(); clipOn = false; setClipCss(false) }
  owner = "section"
  const r = { x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.w)), height: Math.max(1, Math.round(b.h)) }
  if (!embedded) {
    main.contentView.addChildView(view)
    embedded = true
    if (typeof view.setBorderRadius === "function") view.setBorderRadius(Math.round(b.radius || 0))
    poll()
  }
  view.setBounds(r)
}

/** leva o painel para uma janela própria */
function popOut() {
  ensure()
  if (popup && !popup.isDestroyed()) { popup.show(); popup.focus(); return }
  detach()
  if (owner === "clip") { clipOn = false; setClipCss(false) }
  owner = null
  popup = new BrowserWindow({
    width: 1240,
    height: 820,
    title: "YouTube Music · Widgy",
    autoHideMenuBar: true,
    backgroundColor: "#030303",
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
  })
  popup.contentView.addChildView(view)
  const fit = () => {
    if (!popup || popup.isDestroyed()) return
    const [w, h] = popup.getContentSize()
    view.setBounds({ x: 0, y: 0, width: w, height: h })
  }
  if (typeof view.setBorderRadius === "function") view.setBorderRadius(0)
  fit()
  popup.on("resize", fit)
  // fechar a janela separada devolve o player para o Agenda (a música continua)
  popup.on("close", () => { try { popup.contentView.removeChildView(view) } catch {} })
  popup.on("closed", () => { popup = null; poll() })
  poll()
}

/** fecha a janela separada (o player volta para a aba Música) */
function dock() {
  if (popup && !popup.isDestroyed()) popup.close()
}

function register(ipcMain, mainGetter, app) {
  getMain = mainGetter
  app.on("before-quit", () => { if (popup && !popup.isDestroyed()) popup.destroy() })
  ipcMain.handle("music:open", () => { ensure(); poll() })
  ipcMain.handle("music:queue", async () => {
    if (!alive()) return []
    try { return await wc().executeJavaScript(QUEUE, true) } catch { return [] }
  })
  ipcMain.handle("music:embed", (_e, b) => embed(b))
  ipcMain.handle("music:clip", (_e, b) => clip(b))
  ipcMain.handle("music:popout", () => popOut())
  ipcMain.handle("music:dock", () => dock())
  ipcMain.handle("music:video", (_e, id, on, width) => {
    if (on) viewers.set(String(id), Math.max(160, Math.min(1280, Number(width) || 640)))
    else viewers.delete(String(id))
    pushVideo()
  })
  ipcMain.on("music:frame", (e, frame) => {
    if (!alive() || e.sender !== wc()) return
    const w = getMain()
    if (w && !w.isDestroyed()) w.webContents.send("music:frame", frame)
  })
  ipcMain.handle("music:cmd", async (_e, cmd, arg) => {
    if (cmd === "search") {
      ensure()
      await wc().loadURL(`${HOME}search?q=${encodeURIComponent(String(arg || ""))}`).catch(() => {})
      return
    }
    if (cmd === "url") {
      // link do YouTube / YouTube Music: toca direto, sem mostrar a janela
      let u
      try { u = new URL(String(arg)) } catch { return }
      let id = u.hostname === "youtu.be" ? u.pathname.slice(1) : u.searchParams.get("v")
      const list = u.searchParams.get("list")
      if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname)) return
      const target = id ? `${HOME}watch?v=${encodeURIComponent(id)}${list ? "&list=" + encodeURIComponent(list) : ""}` : list ? `${HOME}playlist?list=${encodeURIComponent(list)}` : HOME
      ensure()
      await wc().loadURL(target).catch(() => {})
      return
    }
    if (cmd === "home") { ensure(); await wc().loadURL(HOME).catch(() => {}); return }
    if (cmd === "library") { ensure(); await wc().loadURL(HOME + "library/playlists").catch(() => {}); return }
    if (cmd === "back") { if (alive() && wc().navigationHistory.canGoBack()) wc().navigationHistory.goBack(); return }
    ensure()
    let js = CMD[cmd]
    if (cmd === "seek") js = `(() => { const p = document.querySelector('#movie_player'); const t = ${Number(arg) || 0}; if (p && p.seekTo) p.seekTo(t, true); else { const v = document.querySelector('video'); if (v) v.currentTime = t; } })()`
    if (cmd === "playQueue") {
      const i = Math.max(0, Math.floor(Number(arg) || 0))
      js = `(() => { const items = ${QUEUE_ITEMS}; const it = items[${i}]; if (!it) return; const b = it.querySelector('ytmusic-play-button-renderer, .song-info, .song-title'); (b || it).click(); })()`
    }
    if (cmd === "volume") {
      const v = Math.max(0, Math.min(100, Number(arg) || 0))
      js = `(() => { const p = document.querySelector('#movie_player'); if (p && p.setVolume) { p.setVolume(${v}); if (p.unMute && ${v} > 0) p.unMute(); } const vid = document.querySelector('video'); if (vid) vid.volume = ${v / 100}; })()`
    }
    if (!js) return
    try { await wc().executeJavaScript(js, true) } catch {}
    setTimeout(poll, 250)
  })
  ipcMain.handle("music:logout", async () => {
    await session.fromPartition("persist:ytmusic").clearStorageData()
    if (alive()) wc().loadURL(HOME)
  })
}

module.exports = { register, ensure, poll }
