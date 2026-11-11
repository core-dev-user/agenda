// Shared, dependency-free selection and artwork cache for Windows media sessions.
const IGNORED = /(agenda|widgy)(\.exe|!|$)/i

function pickSession(sessions, source = "") {
  const wanted = String(source || "").toLowerCase().trim()
  const available = (Array.isArray(sessions) ? sessions : [])
    .filter((s) => s && s.title && s.app && !IGNORED.test(s.app))
  const candidates = wanted ? available.filter((s) => s.app.toLowerCase().includes(wanted)) : available
  return candidates.find((s) => s.playing)
    || candidates.find((s) => s.primary)
    || candidates[0] || null
}

function mergeArtwork(raw, cache) {
  const source = String(raw.app || "")
  const key = [raw.title, raw.artist, raw.album].map((x) => x || "").join("\u0000")
  const prev = cache.get(source)
  const incoming = typeof raw.art === "string" && /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,/i.test(raw.art)
    ? raw.art : null
  const art = incoming || (prev && prev.key === key ? prev.art : null)
  if (source) cache.set(source, { key, art })
  return { ...raw, art }
}

// Windows SMTC can return an empty list for a single poll while the player is still open.
// Retain the last valid session briefly, without keeping stale sessions forever.
function retainRecentSessions(previous, incoming, lastSeen, now = Date.now(), graceMs = 9000) {
  const fresh = (Array.isArray(incoming) ? incoming : []).filter((s) => s && s.app)
  const present = new Set(fresh.map((s) => s.app))
  for (const item of fresh) lastSeen.set(item.app, now)
  const retained = (Array.isArray(previous) ? previous : []).filter((s) =>
    s && s.app && !present.has(s.app) && now - (lastSeen.get(s.app) ?? -Infinity) < graceMs)
  for (const [app, timestamp] of lastSeen) {
    if (!present.has(app) && now - timestamp >= graceMs) lastSeen.delete(app)
  }
  return [...fresh, ...retained]
}

const COMMANDS = ["toggle", "next", "prev", "seek", "shuffle", "repeat"]

/** Valida um comando de um widget e monta a linha enviada ao leitor do Windows (ou null se não for permitido). */
function buildCommand(cmd, session, arg) {
  if (!COMMANDS.includes(cmd) || !session || !session.app) return null
  const code = Buffer.from(String(session.app), "utf8").toString("base64")
  if (cmd === "seek") {
    if (!session.canSeek) return null
    const seconds = Math.max(0, Math.min(Number(session.dur) || 86400, Number(arg) || 0))
    return "seek " + code + " " + seconds.toFixed(2)
  }
  if (cmd === "shuffle") return session.canShuffle ? "shuffle " + code + " " + (arg ? "1" : "0") : null
  if (cmd === "repeat") {
    if (!session.canRepeat) return null
    const mode = Math.round(Number(arg))
    return "repeat " + code + " " + (mode === 1 || mode === 2 ? mode : 0)
  }
  return cmd + " " + code
}

module.exports = { pickSession, mergeArtwork, retainRecentSessions, buildCommand }
