// Gera os ícones oficiais de Widgy a partir de UM único SVG para app, favicon e instalador.
import sharp from "sharp"
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"

const logo = readFileSync("public/logos/widgy.svg")
mkdirSync("build", { recursive: true })
mkdirSync("public", { recursive: true })
await sharp(logo).resize(512, 512).png().toFile("build/icon.png")
await sharp(logo).resize(64, 64).png().toFile("public/favicon.png")

// ICO Windows (com PNG de 256px); mantém a bandeja e a janela nítidas.
const png256 = await sharp(logo).resize(256, 256).png().toBuffer()
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)  // icon type
header.writeUInt16LE(1, 4)  // one image
header.writeUInt16LE(1, 10) // planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(png256.length, 14)
header.writeUInt32LE(22, 18)
writeFileSync("build/icon.ico", Buffer.concat([header, png256]))
console.log("Identidade Widgy gerada: icon.png, icon.ico e favicon.png")
