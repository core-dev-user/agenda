"use strict"

// Regras locais para não conceder permissões do Chromium a páginas não confiáveis.
const TRUSTED = Object.freeze({
  discord: ["discord.com", "discordapp.com"],
  whatsapp: ["whatsapp.com", "whatsapp.net"],
  ifood: ["ifood.com.br"],
})
const POPUPS = Object.freeze({
  discord: [...TRUSTED.discord, "hcaptcha.com"],
  whatsapp: [...TRUSTED.whatsapp],
  ifood: [...TRUSTED.ifood, "google.com", "facebook.com", "apple.com", "challenges.cloudflare.com"],
})
const PERMISSIONS = Object.freeze({
  discord: new Set(["media", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "pointerLock", "display-capture", "speaker-selection"]),
  whatsapp: new Set(["media", "notifications", "clipboard-read", "clipboard-sanitized-write", "fullscreen", "speaker-selection"]),
  ifood: new Set(["notifications"]),
})

function trustedHost(url, domains) {
  if (typeof url !== "string" || !Array.isArray(domains)) return false
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false
    const host = parsed.hostname.toLowerCase()
    return domains.some((domain) => host === domain || host.endsWith("." + domain))
  } catch { return false }
}
function canPopup(app, url) { return trustedHost(url, POPUPS[app]) }
function canPermission(app, permission, url) {
  return !!PERMISSIONS[app]?.has(permission) && trustedHost(url, TRUSTED[app])
}
module.exports = { canPermission, canPopup, trustedHost }
