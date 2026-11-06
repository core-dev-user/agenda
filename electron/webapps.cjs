// Apps web dentro do Agenda (Discord e iFood): login salvo, painel que encaixa na janela do app
// ou vai para uma janela separada, e continuam rodando em segundo plano (a call não cai ao fechar).
const { BrowserWindow, WebContentsView, session, shell, desktopCapturer } = require("electron")
const path = require("node:path")

const APPS = {
  discord: { home: "https://discord.com/app", title: "Discord", partition: "persist:discord", bg: "#313338", allowPopup: /discord\.com|discordapp\.com|hcaptcha\.com/ },
  // iFood usa a identificação original do navegador: alterar só o user-agent (e não os outros sinais)
  // deixa a verificação "sou humano" inconsistente e ela fica pedindo de novo
  ifood: { home: "https://www.ifood.com.br/", title: "iFood", partition: "persist:ifood", bg: "#ffffff", keepUA: true, allowPopup: /ifood\.com\.br|google\.com|facebook\.com|apple\.com|challenges\.cloudflare\.com/ },
  whatsapp: { home: "https://web.whatsapp.com/", title: "WhatsApp", partition: "persist:whatsapp", bg: "#111b21", allowPopup: /whatsapp\.(com|net)/ },
}

/** @type {Record<string, { view: any, popup: any, embedded: boolean }>} */
const S = {}
let getMain = () => null

const ua = () => session.defaultSession.getUserAgent().replace(/\s*Electron\/\S+/i, "").replace(/\s*agenda\/\S+/i, "")
const alive = (id) => !!S[id] && !!S[id].view && !S[id].view.webContents.isDestroyed()
const touch = (id) => { if (S[id]) S[id].lastUse = Date.now() }
/** minutos sem uso até o app "dormir" (0 = nunca) */
let hibernateMin = 15
const muted = {}
const wc = (id) => S[id].view.webContents
function send(ch, data) { const w = getMain(); if (w && !w.isDestroyed()) w.webContents.send(ch, data) }

/* ---------------- Discord: lê a call atual e controla mudo/ensurdecer/sair ---------------- */
const DISCORD_POLL = `(() => {
  const all = (s, r = document) => Array.from(r.querySelectorAll(s));
  const label = (el) => (el && (el.getAttribute('aria-label') || '')) || '';
  const loggedIn = !!document.querySelector('section[class*="panels"]');
  const rtc = document.querySelector('[class*="rtcConnectionStatus"]');
  const btns = all('button, [role="button"], [role="switch"]');
  const disc = btns.find((b) => /^(disconnect|desconectar|sair da chamada|leave call|encerrar chamada)/i.test(label(b)));
  const inCall = !!disc || !!rtc;
  let channel = '', server = '', status = '';
  if (rtc) {
    const box = rtc.closest('[class*="connection"]') || rtc.parentElement && rtc.parentElement.parentElement || rtc;
    status = (rtc.textContent || '').trim();
    const a = box.querySelector('a[href^="/channels/"]');
    const txt = ((a && a.textContent) || '').trim();
    const parts = txt.split(' / ');
    channel = parts[0] || ''; server = parts.slice(1).join(' / ');
  }
  // botões do painel do usuário (canto de baixo): os dois primeiros "switch" são mudo e ensurdecer
  const panel = document.querySelector('section[class*="panels"]') || document;
  const sw = all('button[role="switch"], [role="switch"]', panel);
  const muteBtn = sw.find((b) => /mute|silenci|microfone|mic/i.test(label(b))) || sw[0];
  const deafBtn = sw.find((b) => /deaf|ensurde|fone|áudio|audio/i.test(label(b)) && b !== muteBtn) || sw[1];
  const on = (b) => !!b && b.getAttribute('aria-checked') === 'true';
  // "falando": o Discord marca com classe *speaking* e um anel verde no avatar
  const greenRing = (el) => {
    const sh = getComputedStyle(el).boxShadow || '';
    const m = sh.match(/rgba?[(](\\d+), *(\\d+), *(\\d+)/);
    return !!m && +m[2] > 140 && +m[1] < 110 && +m[3] < 150;
  };
  const isSpeaking = (u) => {
    if (/speaking/i.test(String(u.className || ''))) return true;
    if (u.querySelector('[class*="avatarSpeaking"], [class*="Speaking"], [class*="speaking"]')) return true;
    return all('[class*="avatar"]', u).some(greenRing);
  };
  const mic = window.__agendaMic;
  const myName = ((document.querySelector('section[class*="panels"] [class*="nameTag"] [class*="title"], section[class*="panels"] [class*="panelTitleContainer"] div, section[class*="panels"] [class*="hovered"]') || {}).textContent || '').trim();
  // quem está na call: usuários embaixo do canal de voz conectado
  let people = [];
  const conn = document.querySelector('[class*="modeConnected"]');
  const li = conn && (conn.closest('li') || conn.parentElement && conn.parentElement.parentElement);
  const users = li ? all('[class*="voiceUser"]', li) : [];
  people = users.slice(0, 24).map((u) => {
    const img = u.querySelector('img');
    const bgEl = u.querySelector('[class*="avatar"]');
    const bg = bgEl && getComputedStyle(bgEl).backgroundImage;
    const m = bg && bg.match(/url\\("?([^")]+)"?\\)/);
    const name = ((u.querySelector('[class*="username"], [class*="name"]') || u).textContent || '').trim();
    return {
      name,
      avatar: (img && img.src) || (m && m[1]) || '',
      speaking: isSpeaking(u),
      muted: !!u.querySelector('[aria-label*="Mute" i], [aria-label*="Silenciad" i], [aria-label*="mudo" i]'),
      deaf: !!u.querySelector('[aria-label*="Deafen" i], [aria-label*="Ensurdecid" i]'),
    };
  }).filter((p) => p.name);
  const me = document.querySelector('section[class*="panels"] [class*="avatar"] img');
  const myAvatar = me ? me.src : '';
  // você: pelo volume do seu microfone (mais rápido e funciona mesmo com o canal fora da tela)
  const meSpeaking = inCall && !on(muteBtn) && !on(deafBtn) && !!mic && Date.now() - mic.last < 450;
  if (meSpeaking) {
    const self = people.find((p) => (myName && p.name === myName) || (myAvatar && p.avatar && p.avatar.split('?')[0] === myAvatar.split('?')[0]));
    if (self) self.speaking = true;
  }
  return { loggedIn, inCall, channel, server, status, muted: on(muteBtn), deafened: on(deafBtn), people, myAvatar, myName, meSpeaking };
})()`

/** mede o nível do seu microfone dentro do Discord: marca a última vez que você falou */
const MIC_HOOK = `(() => {
  if (window.__agendaMic) return;
  window.__agendaMic = { last: 0 };
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  let ctx = null;
  md.getUserMedia = async (c) => {
    const stream = await orig(c);
    try {
      const track = stream.getAudioTracks()[0];
      if (track) {
        ctx = ctx || new AudioContext();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const src = ctx.createMediaStreamSource(new MediaStream([track.clone()]));
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        const buf = new Float32Array(an.fftSize);
        const id = setInterval(() => {
          if (track.readyState === 'ended') { clearInterval(id); try { src.disconnect(); } catch (e) {} return; }
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          if (track.enabled && rms > 0.03) window.__agendaMic.last = Date.now();
        }, 60);
      }
    } catch (e) {}
    return stream;
  };
})()`

const DISCORD_CMD = {
  mute: `(() => { const p = document.querySelector('section[class*="panels"]') || document; const sw = Array.from(p.querySelectorAll('[role="switch"]')); const b = sw.find((x) => /mute|silenci|microfone|mic/i.test(x.getAttribute('aria-label') || '')) || sw[0]; b && b.click(); })()`,
  deafen: `(() => { const p = document.querySelector('section[class*="panels"]') || document; const sw = Array.from(p.querySelectorAll('[role="switch"]')); const m = sw.find((x) => /mute|silenci|microfone|mic/i.test(x.getAttribute('aria-label') || '')) || sw[0]; const b = sw.find((x) => /deaf|ensurde|fone|áudio|audio/i.test(x.getAttribute('aria-label') || '') && x !== m) || sw[1]; b && b.click(); })()`,
  disconnect: `(() => { const b = Array.from(document.querySelectorAll('button, [role="button"]')).find((x) => /^(disconnect|desconectar|sair da chamada|leave call|encerrar chamada)/i.test(x.getAttribute('aria-label') || '')); b && b.click(); })()`,
}

/* ---------------- WhatsApp: conversas da lista (só lê o que já está na tela do WhatsApp Web) ---------------- */
const WHATSAPP_POLL = `(() => {
  const pane = document.querySelector('#pane-side');
  const loggedIn = !!pane;
  const qr = !!document.querySelector('canvas[aria-label], [data-ref]') && !pane;
  const tm = (document.title || '').match(/\\((\\d+)\\)/);
  const totalUnread = tm ? Number(tm[1]) : 0;
  const rows = pane ? Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]')) : [];
  const chats = [];
  for (const r of rows) {
    const titled = Array.from(r.querySelectorAll('span[title]'));
    if (!titled.length) continue;
    const name = titled[0].getAttribute('title') || '';
    const last = titled.length > 1 ? titled[titled.length - 1].getAttribute('title') || '' : '';
    const badge = Array.from(r.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label') || '').find((l) => /n[aã]o lida|unread/i.test(l)) || '';
    const n = badge ? Number((badge.match(/\\d+/) || ['1'])[0]) : 0;
    const time = (Array.from(r.querySelectorAll('div, span')).map((e) => (e.children.length === 0 ? (e.textContent || '').trim() : '')).find((t) => /^(\\d{1,2}:\\d{2}|ontem|yesterday|\\d{2}\\/\\d{2}\\/\\d{2,4}|segunda|terça|quarta|quinta|sexta|sábado|domingo)$/i.test(t))) || '';
    const img = r.querySelector('img');
    if (name && !chats.some((c) => c.name === name)) chats.push({ name, last, unread: n, time, avatar: img ? img.src : '' });
    if (chats.length >= 25) break;
  }
  return { loggedIn, qr, totalUnread, chats };
})()`

/* ---------------- iFood: lê a página de pedidos da conta ---------------- */
const IFOOD_ORDERS = `(() => {
  const STAT = /(aguardando confirma[cç][aã]o|pedido confirmado|confirmado|em preparo|preparando|pronto para retirada|saiu para (a )?entrega|a caminho|est[aá] chegando|chegou|entregue|pedido conclu[ií]do|conclu[ií]do|cancelado)/i;
  const url = location.href;
  const entrar = Array.from(document.querySelectorAll('button, a')).some((b) => /^(entrar|fazer login|login)$/i.test((b.innerText || '').trim()));
  const loggedOut = /login|entrar/i.test(url) || entrar || !!document.querySelector('[data-test-id*="login" i], form input[type="tel"], form input[type="email"]');
  const els = Array.from(document.querySelectorAll('a, article, li, section, div')).filter((el) => {
    const t = el.innerText || '';
    return t.length > 0 && t.length < 500 && STAT.test(t);
  });
  // menor elemento com o status -> sobe até o "cartão" do pedido (que tem a foto da loja)
  const leaves = els.filter((el) => !els.some((o) => o !== el && el.contains(o)));
  const seen = new Set();
  const out = [];
  for (const leaf of leaves) {
    let card = leaf;
    for (let i = 0; i < 6 && card.parentElement; i++) {
      if (card.querySelector('img') && (card.innerText || '').length > 20) break;
      card = card.parentElement;
    }
    const text = (card.innerText || '').trim();
    if (!text || seen.has(text) || text.length > 700) continue;
    seen.add(text);
    const lines = text.split('\\n').map((s) => s.trim()).filter(Boolean);
    const status = (text.match(STAT) || [''])[0];
    const price = (text.match(/R\\$\\s?[\\d.]+,\\d{2}/) || [''])[0];
    const when = (lines.find((l) => /\\d{2}\\/\\d{2}|hoje|ontem|\\d{1,2}:\\d{2}|min/i.test(l) && !STAT.test(l)) || '');
    const name = lines.find((l) => !STAT.test(l) && !/R\\$/.test(l) && l !== when && l.length > 2 && l.length < 60) || 'Pedido';
    const img = card.querySelector('img');
    const link = card.closest('a') || card.querySelector('a');
    out.push({ name, status, price, when, img: img ? img.src : '', link: link ? link.href : '', lines: lines.slice(0, 6) });
    if (out.length >= 6) break;
  }
  // mapa do acompanhamento (Google Maps / Mapbox / Leaflet / canvas): o maior visível
  const maps = Array.from(document.querySelectorAll('.gm-style, .mapboxgl-map, .maplibregl-map, .leaflet-container, iframe[src*="maps"], [class*="map" i] canvas, [data-testid*="map" i]'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((m) => m.r.width > 150 && m.r.height > 100 && m.r.bottom > 0 && m.r.top < innerHeight)
    .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  const mr = maps[0] && maps[0].r;
  const mapRect = mr ? { x: Math.max(0, Math.round(mr.left)), y: Math.max(0, Math.round(mr.top)), w: Math.round(Math.min(mr.width, innerWidth - Math.max(0, mr.left))), h: Math.round(Math.min(mr.height, innerHeight - Math.max(0, mr.top))) } : null;
  return { loggedOut, url, orders: out, mapRect, onOrders: location.pathname.indexOf('/pedido') >= 0, check: /verifica[cç][aã]o de seguran[cç]a|cloudflare/i.test(document.title + ' ' + (document.body.innerText || '').slice(0, 300)) };
})()`

/* ---------------- painel (embed / janela separada) ---------------- */
/** uma única vez: apaga cookies de verificação gravados com a identificação antiga (causavam o loop) */
const fsx = require("node:fs")
function resetChallengeCookiesOnce(id, ses) {
  const { app } = require("electron")
  const mark = path.join(app.getPath("userData"), `.${id}-cf-reset-1`)
  if (fsx.existsSync(mark)) return
  ses.cookies.get({}).then((cs) => Promise.all(cs.filter((c) => /^(cf_clearance|__cf_bm|_cfuvid|cf_chl)/.test(c.name)).map((c) => {
    const url = `https://${String(c.domain || "").replace(/^\./, "")}${c.path || "/"}`
    return ses.cookies.remove(url, c.name).catch(() => {})
  }))).finally(() => { try { fsx.writeFileSync(mark, "1") } catch {} })
}

function ensure(id) {
  if (alive(id)) return S[id].view
  const cfg = APPS[id]
  const ses = session.fromPartition(cfg.partition)
  if (!cfg.keepUA) ses.setUserAgent(ua())
  else {
    ses.setUserAgent(session.defaultSession.getUserAgent())
    resetChallengeCookiesOnce(id, ses)
  }
  // Discord precisa de microfone/câmera; os dois podem mandar notificação
  const ALLOW = ["media", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "pointerLock", "display-capture", "speaker-selection"]
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOW.includes(perm)))
  ses.setPermissionCheckHandler((_wc, perm) => ALLOW.includes(perm))
  if (id === "discord") {
    // compartilhar tela no Discord: usa a tela principal
    ses.setDisplayMediaRequestHandler((_req, cb) => {
      desktopCapturer.getSources({ types: ["screen"] }).then((s) => cb({ video: s[0], audio: "loopback" })).catch(() => cb({}))
    })
  }
  // WhatsApp não precisa ser desenhado quando não está na tela (economiza processador e placa de vídeo)
  const view = new WebContentsView({ webPreferences: { partition: cfg.partition, backgroundThrottling: id === "whatsapp", contextIsolation: true, nodeIntegration: false, autoplayPolicy: "no-user-gesture-required" } })
  view.setBackgroundColor(cfg.bg)
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (cfg.allowPopup.test(url)) return { action: "allow" }
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: "deny" }
  })
  if (id === "discord") view.webContents.on("dom-ready", () => { view.webContents.executeJavaScript(MIC_HOOK, true).catch(() => {}) })
  view.setBounds({ x: 0, y: 0, width: 1280, height: 860 })
  view.webContents.loadURL(cfg.home)
  S[id] = { view, popup: null, embedded: false, lastUse: Date.now() }
  if (muted[id]) view.webContents.setAudioMuted(true)
  return view
}

function detach(id) {
  const s = S[id]
  if (!s || !s.view) return
  const main = getMain()
  if (s.embedded && main && !main.isDestroyed()) { try { main.contentView.removeChildView(s.view) } catch {} }
  s.embedded = false
  if (s.popup && !s.popup.isDestroyed()) { try { s.popup.contentView.removeChildView(s.view) } catch {} }
  if (s.host && !s.host.isDestroyed()) { try { s.host.contentView.removeChildView(s.view) } catch {} s.hosted = false }
}

/**
 * Janela invisível que "segura" o painel quando ele não está na tela: assim a página continua sendo
 * desenhada (necessário para a foto do mapa do entregador no widget).
 */
function hostOffscreen(id) {
  const s = S[id]
  if (!s || s.embedded || s.popup || s.hosted) return
  if (!s.host || s.host.isDestroyed()) {
    // "mostrada" fora da área visível e 100% transparente: o Windows e o Chromium continuam desenhando
    s.host = new BrowserWindow({ x: -32000, y: -32000, width: 1280, height: 860, show: false, frame: false, skipTaskbar: true, focusable: false, hasShadow: false, paintWhenInitiallyHidden: true, webPreferences: { backgroundThrottling: false } })
    s.host.setIgnoreMouseEvents(true)
    s.host.setOpacity(0)
    s.host.showInactive()
  }
  s.host.contentView.addChildView(s.view)
  s.view.setBounds({ x: 0, y: 0, width: 1280, height: 860 })
  s.hosted = true
}

function embed(id, b) {
  ensure(id)
  touch(id)
  const s = S[id]
  if (s.popup) return
  const main = getMain()
  if (!main || main.isDestroyed()) return
  if (!b) { if (s.embedded) { detach(id); pushState(id) } return }
  if (!s.embedded) {
    if (s.hosted && s.host && !s.host.isDestroyed()) { try { s.host.contentView.removeChildView(s.view) } catch {} s.hosted = false }
    main.contentView.addChildView(s.view)
    s.embedded = true
    if (typeof s.view.setBorderRadius === "function") s.view.setBorderRadius(Math.round(b.radius || 0))
    pushState(id)
  }
  s.view.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.w)), height: Math.max(1, Math.round(b.h)) })
}

function popOut(id) {
  ensure(id)
  touch(id)
  const s = S[id]
  if (s.popup && !s.popup.isDestroyed()) { s.popup.show(); s.popup.focus(); return }
  detach(id)
  const p = new BrowserWindow({
    width: id === "discord" ? 1280 : 1100, height: 820, title: `${APPS[id].title} · Agenda`, autoHideMenuBar: true, backgroundColor: APPS[id].bg,
    icon: path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
  })
  s.popup = p
  p.contentView.addChildView(s.view)
  const fit = () => { if (!p.isDestroyed()) { const [w, h] = p.getContentSize(); s.view.setBounds({ x: 0, y: 0, width: w, height: h }) } }
  if (typeof s.view.setBorderRadius === "function") s.view.setBorderRadius(0)
  fit()
  p.on("resize", fit)
  p.on("close", () => { try { p.contentView.removeChildView(s.view) } catch {} })
  p.on("closed", () => { s.popup = null; pushState(id) })
  pushState(id)
}

function pushState(id, extra = {}) {
  const s = S[id]
  send("webapp:state", { id, open: alive(id), popped: !!(s && s.popup), embedded: !!(s && s.embedded), ...extra })
}

const asleep = {}
function hibernate(id) {
  const s = S[id]
  if (!s) return
  detach(id)
  try { if (s.host && !s.host.isDestroyed()) s.host.destroy() } catch {}
  try { s.view.webContents.close() } catch {}
  delete S[id]
  asleep[id] = Date.now()
  pushState(id)
}

/* ---------------- leitura periódica ---------------- */
let discordWatchers = 0
async function pollDiscord() {
  if (!alive("discord")) return
  try {
    const st = await wc("discord").executeJavaScript(DISCORD_POLL, true)
    S.discord.inCall = !!(st && st.inCall)
    touch("discord")
    pushState("discord", { discord: st })
  } catch {}
}

// iFood: lê só a página que você mesmo abriu no app iFood do Agenda (sem janela escondida, sem navegar sozinho)
async function ifoodOrders() {
  if (!alive("ifood")) { ensure("ifood"); return { loggedOut: false, orders: [], onOrders: false, loading: true } }
  touch("ifood")
  try { return await wc("ifood").executeJavaScript(IFOOD_ORDERS, true) } catch (e) { return { loggedOut: false, orders: [], onOrders: false, error: String((e && e.message) || e) } }
}

function register(ipcMain, mainGetter, app) {
  getMain = mainGetter
  app.on("before-quit", () => {
    for (const s of Object.values(S)) {
      if (s.popup && !s.popup.isDestroyed()) s.popup.destroy()
      if (s.host && !s.host.isDestroyed()) s.host.destroy()
    }
  })
  ipcMain.handle("webapp:open", (_e, id) => { if (APPS[id]) { ensure(id); pushState(id) } })
  ipcMain.handle("webapp:embed", (_e, id, b) => APPS[id] && embed(id, b))
  ipcMain.handle("webapp:popout", (_e, id) => APPS[id] && popOut(id))
  ipcMain.handle("webapp:dock", (_e, id) => { const s = S[id]; if (s && s.popup && !s.popup.isDestroyed()) s.popup.close() })
  // foto ao vivo do mapa do acompanhamento (da página que você abriu no app iFood)
  ipcMain.handle("webapp:ifoodMap", async (_e, rect) => {
    if (!alive("ifood") || !rect || rect.w < 50 || rect.h < 50) return null
    const s = S.ifood
    if (!s.embedded && !s.popup && !s.hosted) { hostOffscreen("ifood"); await new Promise((r) => setTimeout(r, 600)) }
    try {
      const img = await wc("ifood").capturePage({ x: rect.x, y: rect.y, width: rect.w, height: rect.h })
      if (img.isEmpty()) return null
      const sz = img.getSize()
      return (sz.width > 700 ? img.resize({ width: 700 }) : img).toDataURL()
    } catch { return null }
  })
  ipcMain.handle("webapp:url", (_e, id) => (alive(id) ? wc(id).getURL() : ""))
  ipcMain.handle("webapp:nav", async (_e, id, where) => {
    if (!APPS[id]) return
    ensure(id)
    const w = wc(id)
    if (where === "back") { if (w.navigationHistory.canGoBack()) w.navigationHistory.goBack() }
    else if (where === "reload") w.reload()
    else if (where === "home") await w.loadURL(APPS[id].home).catch(() => {})
    else if (typeof where === "string" && /^https:\/\/([\w-]+\.)*(discord\.com|ifood\.com\.br)\//.test(where)) await w.loadURL(where).catch(() => {})
  })
  ipcMain.handle("webapp:discord", async (_e, cmd) => {
    if (!alive("discord") || !DISCORD_CMD[cmd]) return
    try { await wc("discord").executeJavaScript(DISCORD_CMD[cmd], true) } catch {}
    setTimeout(pollDiscord, 200)
  })
  // widgets do Discord avisam que estão na tela -> leitura rápida (quem está falando)
  ipcMain.handle("webapp:watch", (_e, id, on) => {
    if (id === "discord") discordWatchers = Math.max(0, discordWatchers + (on ? 1 : -1))
    if (on) ensure(id)
  })
  ipcMain.handle("webapp:ifoodOrders", () => ifoodOrders())
  ipcMain.handle("webapp:whatsapp", async () => {
    if (!alive("whatsapp")) { ensure("whatsapp"); return { loggedIn: false, loading: true, chats: [], totalUnread: 0 } }
    touch("whatsapp")
    try { return await wc("whatsapp").executeJavaScript(WHATSAPP_POLL, true) } catch { return { loggedIn: false, chats: [], totalUnread: 0 } }
  })
  // abre uma conversa pelo nome (como clicar nela na lista)
  ipcMain.handle("webapp:whatsappOpen", async (_e, name) => {
    if (!alive("whatsapp")) return
    const js = `(() => { const n = ${JSON.stringify(String(name || ""))}; const s = Array.from(document.querySelectorAll('#pane-side span[title]')).find((x) => x.getAttribute('title') === n); if (!s) return false; const row = s.closest('[role="listitem"], [role="row"]') || s; for (const t of ['mousedown', 'mouseup', 'click']) row.dispatchEvent(new MouseEvent(t, { bubbles: true })); return true; })()`
    try { await wc("whatsapp").executeJavaScript(js, true) } catch {}
  })
  // leitura rápida (quem está falando) só durante uma call; fora dela, a cada 3 s
  let dTick = 0
  setInterval(() => {
    if (discordWatchers <= 0) return
    dTick++
    if ((S.discord && S.discord.inCall) || dTick % 10 === 0) pollDiscord()
  }, 300)

  // modo foco: silencia o som do app (Discord numa call nunca é silenciado)
  ipcMain.handle("webapp:mute", (_e, id, on) => {
    if (!APPS[id]) return
    muted[id] = !!on
    if (alive(id)) {
      const inCall = id === "discord" && S.discord.inCall
      wc(id).setAudioMuted(!!on && !inCall)
    }
  })
  ipcMain.handle("webapp:hibernate", (_e, min) => { hibernateMin = Math.max(0, Number(min) || 0) })
  ipcMain.handle("webapp:status", () => Object.fromEntries(Object.keys(APPS).map((id) => [id, {
    alive: alive(id), url: alive(id) ? wc(id).getURL() : "", asleep: !alive(id) && !!asleep[id], lastUse: S[id] ? S[id].lastUse : 0,
  }])))

  // apps que ninguém está usando "dormem" para liberar memória; acordam sozinhos quando você abre ou um widget precisa
  setInterval(async () => {
    if (!hibernateMin) return
    for (const id of Object.keys(APPS)) {
      const s = S[id]
      if (!alive(id) || s.embedded || (s.popup && !s.popup.isDestroyed())) { if (s && (s.embedded || s.popup)) touch(id); continue }
      if (id === "discord") {
        if (discordWatchers > 0) continue
        try { if (await wc("discord").executeJavaScript(`!!document.querySelector('[class*="rtcConnectionStatus"]')`, true)) { touch(id); continue } } catch {}
      }
      if (Date.now() - (s.lastUse || 0) < hibernateMin * 60_000) continue
      hibernate(id)
    }
  }, 60_000)
}

module.exports = { register, DISCORD_POLL, DISCORD_CMD, IFOOD_ORDERS, WHATSAPP_POLL }
