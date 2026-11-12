/** Generates the bundled, offline SVG app-icon pack from the Font Awesome Free icons.
 * This is run BEFORE Vite builds, so electron-builder includes the files in dist.
 * Source shapes are Font Awesome Free 6.7.2 (CC BY 4.0).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "node_modules", "@fortawesome", "fontawesome-free")
const target = join(root, "public", "icon-packs")
const catalog = JSON.parse(readFileSync(join(root, "src", "lib", "iconPackCatalog.json"), "utf8"))
const styles = ["glass", "neon", "metal", "minimal", "retro", "carbono"]
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")

function makeSvg(entry, mode) {
  const path = join(source, "svgs", entry.brand ? "brands" : "solid", entry.glyph + ".svg")
  const sourceSvg = readFileSync(path, "utf8")
  const vb = sourceSvg.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number)
  if (!vb || vb.length !== 4) throw Error("Invalid Font Awesome SVG: " + path)
  const [vx, vy, w, h] = vb
  // Carbono is the original brand silhouette only: no tile, gradient or shadow.
  // The vector is larger than in the padded icon-pack styles so it remains
  // recognizable in the 36-pixel taskbar.
  const bound = mode === "carbono" ? 432 : 235
  const scale = Math.min(bound / w, bound / h)
  const tx = 256 - (w * scale) / 2 - vx * scale
  const ty = (mode === "carbono" ? 256 : 253) - (h * scale) / 2 - vy * scale
  const inner = [...sourceSvg.matchAll(/<(path|rect|circle|polygon|ellipse)\b[^>]*\/>/g)]
    .map((m) => m[0].replace(/\sfill="[^"]*"/g, "").replace(/\sclass="[^"]*"/g, "")).join("")
  if (!inner) throw Error("No shapes in: " + path)
  if (mode === "carbono") {
    // Black silhouette used through CSS mask-image: the UI paints it with the
    // current contrast color. Always transparent; no logo borders/colored tiles.
    return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
      '<g transform="translate(' + tx.toFixed(4) + ' ' + ty.toFixed(4) + ') scale(' + scale.toFixed(6) + ')" fill="#000">' +
      inner + '</g></svg>'
  }
  const c = entry.color
  const defs = '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + c + '"/><stop offset=".55" stop-color="' + c + '" stop-opacity=".88"/><stop offset="1" stop-color="#090e22"/></linearGradient>' +
    '<linearGradient id="metal" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="#f5f7fa"/><stop offset=".36" stop-color="#b6bcc6"/><stop offset=".66" stop-color="#6c7280"/><stop offset="1" stop-color="#232735"/></linearGradient>' +
    '<linearGradient id="light" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white" stop-opacity=".48"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>' +
    '<filter id="shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="17" flood-opacity=".26"/></filter>' +
    '<filter id="glow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="9"/></filter>'
  let bg = "", detail = "", fg = "#fff", shadow = ""
  switch (mode) {
    case "glass":
      bg = '<rect x="16" y="16" width="480" height="480" rx="128" fill="url(#bg)"/>'
      detail = '<path d="M42 167 Q42 44 162 44 H354 Q472 44 470 167 Q256 234 42 167Z" fill="url(#light)" opacity=".54"/><rect x="19" y="19" width="474" height="474" rx="125" fill="none" stroke="#fff" stroke-opacity=".47" stroke-width="4"/>'
      shadow = 'filter="url(#shadow)"'
      break
    case "neon":
      bg = '<rect x="16" y="16" width="480" height="480" rx="124" fill="#080b16"/>'
      detail = '<rect x="24" y="24" width="464" height="464" rx="117" stroke="' + c + '" stroke-width="5" fill="none" opacity=".7"/>'
      fg = c
      break
    case "metal":
      bg = '<rect x="16" y="16" width="480" height="480" rx="104" fill="url(#metal)"/>'
      detail = '<path d="M38 157 Q38 38 152 38 H360 Q473 38 474 157 Q256 214 38 157Z" fill="url(#light)" opacity=".5"/><rect x="20" y="20" width="472" height="472" rx="102" fill="none" stroke="#fcfcff" stroke-width="3" opacity=".8"/>'
      fg = "#252d3e"
      shadow = 'filter="url(#shadow)"'
      break
    case "minimal":
      bg = '<rect x="16" y="16" width="480" height="480" rx="116" fill="' + c + '"/>'
      break
    case "retro":
      bg = '<rect x="16" y="16" width="480" height="480" fill="' + c + '"/>'
      detail = '<path d="M20 20H490V490H20Z" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="12"/><path d="M36 474H473V36" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="10"/>'
      break
    default:
      throw Error("Unsupported style " + mode)
  }
  const pathGroup = '<g transform="translate(' + tx.toFixed(4) + ' ' + ty.toFixed(4) + ') scale(' + scale.toFixed(6) + ')" fill="' + fg + '" ' + shadow + '>' + inner + '</g>'
  const glowGroup = mode === "neon" ? '<g opacity=".38" filter="url(#glow)">' + pathGroup + '</g>' : ""
  return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(entry.name) + '" width="512" height="512" viewBox="0 0 512 512"><defs>' + defs + '</defs>' + bg + detail + glowGroup + pathGroup + '</svg>'
}
if (!existsSync(source)) throw Error("Missing Font Awesome Free package: run npm ci")
mkdirSync(target, {recursive:true})
for (const mode of styles) {
  mkdirSync(join(target, mode), {recursive:true})
  for (const entry of catalog) {
    writeFileSync(join(target, mode, slug(entry.name) + ".svg"), makeSvg(entry, mode))
  }
}
copyFileSync(join(source, "LICENSE.txt"), join(target, "FONT-AWESOME-LICENSE.txt"))
console.log('Agenda: generated ' + (catalog.length * styles.length) + ' SVG icons (' + catalog.length + ' apps × ' + styles.length + ' styles).')
