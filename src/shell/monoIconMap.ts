/**
 * Ícones Carbono: sem imagens, favicons nem logos de marcas.
 * Classificação local por tipo de aplicativo e fallback abstrato estável.
 * Funciona para qualquer .exe, inclusive se o ícone original estiver quebrado.
 */
export type MonoKind =
  | "browser" | "game" | "chat" | "music" | "video" | "code" | "terminal"
  | "file" | "document" | "image" | "camera" | "security" | "settings"
  | "mail" | "shopping" | "cloud" | "system" | "calendar" | "finance"
  | "abstract-0" | "abstract-1" | "abstract-2" | "abstract-3"
  | "abstract-4" | "abstract-5"

const RULES: { kind: MonoKind; words: RegExp }[] = [
  { kind: "browser", words: /\b(chrome|firefox|msedge|edge|brave|opera|vivaldi|chromium|browser|tor)\b/ },
  { kind: "game", words: /\b(steam|epic games|riot|valorant|fortnite|roblox|minecraft|league of legends|cs2|battle net|blizzard|ubisoft|origin|ea app|gog|game|xbox|playnite|itch|gaming)\b/ },
  { kind: "chat", words: /\b(discord|whatsapp|telegram|signal|slack|teams|messenger|chat|wechat|line)\b/ },
  { kind: "music", words: /\b(spotify|deezer|tidal|music|soundcloud|itunes|audacity|foobar|winamp)\b/ },
  { kind: "video", words: /\b(youtube|vlc|video|netflix|prime video|obs|stream|zoom|twitch|mpv|media player|potplayer)\b/ },
  { kind: "terminal", words: /\b(powershell|terminal|cmd|command prompt|hyper|windows terminal|bash)\b/ },
  { kind: "code", words: /\b(vs code|vscode|visual studio|cursor|sublime|notepad\+\+|jetbrains|intellij|pycharm|webstorm|android studio|github|git|python|node|code|developer|vscodium)\b/ },
  { kind: "file", words: /\b(explorer|file manager|7 zip|7z|winrar|archive|files|folder|total commander|everything)\b/ },
  { kind: "mail", words: /\b(outlook|thunderbird|mail|gmail|email)\b/ },
  { kind: "image", words: /\b(photoshop|illustrator|figma|gimp|krita|paint|blender|lightroom|affinity|canva|image|photo|graphics|design)\b/ },
  { kind: "camera", words: /\b(camera|webcam|capture|screenshot)\b/ },
  { kind: "security", words: /\b(defender|antivirus|vpn|security|malware|firewall|bitdefender|norton)\b/ },
  { kind: "settings", words: /\b(settings|control panel|config|preferences|registry|regedit)\b/ },
  { kind: "document", words: /\b(word|excel|powerpoint|office|libreoffice|document|reader|pdf|acrobat|notepad|editor)\b/ },
  { kind: "cloud", words: /\b(onedrive|dropbox|drive|cloud|backup|sync)\b/ },
  { kind: "shopping", words: /\b(shop|store|amazon|mercado livre|shopping)\b/ },
  { kind: "calendar", words: /\b(calendar|agenda|schedule)\b/ },
  { kind: "finance", words: /\b(finance|bank|wallet|payments)\b/ },
  { kind: "system", words: /\b(task manager|nvidia|radeon|amd|intel|device manager|system|hardware|cpu|gpu)\b/ },
]
const normalize = (text: string) => text
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\.exe\b/g, " ")
  .replace(/[\\/_\-.]+/g, " ").replace(/\s+/g, " ").trim()

export function classifyAppIcon(name: string, executable = ""): MonoKind {
  // Primeiro nome visível, depois basename do executável. Nunca usa o diretório
  // inteiro, que pode conter uma palavra de outra categoria.
  const basename = executable.split(/[\\/]/).pop() ?? ""
  const searchable = normalize(name + " " + basename)
  for (const rule of RULES) if (rule.words.test(searchable)) return rule.kind
  const id = normalize(name || basename || "app")
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return ("abstract-" + (hash >>> 0) % 6) as MonoKind
}
