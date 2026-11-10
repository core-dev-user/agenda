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

module.exports = { pickSession, mergeArtwork }
