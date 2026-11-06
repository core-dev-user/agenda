// Gera build/icon.png (512px) a partir do SVG do logo
import sharp from "sharp"
import { mkdirSync } from "node:fs"

const petal = "M0,0 C-15,-9 -19,-31 -8,-43 L0,-37 L8,-43 C19,-31 15,-9 0,0Z"
const rot = [0, 72, 144, 216, 288]
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 128 128">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a1835"/><stop offset=".55" stop-color="#7a2a5c"/><stop offset="1" stop-color="#ff8fb8"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".4" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>
<radialGradient id="p" cx=".5" cy="1" r="1"><stop offset="0" stop-color="#ff5f9e"/><stop offset=".45" stop-color="#ffb3cf"/><stop offset="1" stop-color="#fff2f7"/></radialGradient>
<radialGradient id="sh" cx=".3" cy=".1" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect x="6" y="10" width="116" height="112" rx="30" fill="url(#bg)"/>
<rect x="6" y="10" width="116" height="112" rx="30" fill="url(#sh)"/>
<rect x="6.75" y="10.75" width="114.5" height="110.5" rx="29.25" fill="none" stroke="url(#rim)" stroke-width="1.5"/>
${[40, 88].map((x) => `<rect x="${x - 5}" y="2" width="10" height="20" rx="5" fill="#2a0f24" opacity=".55"/><rect x="${x - 4}" y="1" width="8" height="19" rx="4" fill="#fde7f0"/>`).join("")}
<g transform="translate(64 70)">
${rot.map((d) => `<path d="${petal}" transform="rotate(${d})" fill="url(#p)" stroke="#fff" stroke-opacity=".5" stroke-width=".8"/>`).join("")}
<circle r="7" fill="#ff4d8d"/>
${rot.map((d) => `<g transform="rotate(${d + 36})"><line x1="0" y1="0" x2="0" y2="-13" stroke="#ffd36e" stroke-width="1.2" stroke-linecap="round"/><circle cy="-14" r="2" fill="#ffe08a"/></g>`).join("")}
<circle r="3" fill="#ffe7a8"/>
</g></svg>`

mkdirSync("build", { recursive: true })
mkdirSync("public", { recursive: true })
await sharp(Buffer.from(svg)).png().toFile("build/icon.png")
await sharp(Buffer.from(svg)).resize(64, 64).png().toFile("public/favicon.png")
console.log("ícone gerado em build/icon.png")
