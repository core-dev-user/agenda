// Lança uma versão nova do Agenda para quem instalou (atualização automática).
//
//   npm run release            → 0.2.0 vira 0.2.1
//   npm run release -- minor   → 0.2.0 vira 0.3.0
//   npm run release -- 1.0.0   → versão exata
//
// Sobe o número da versão, grava o commit "Versão x.y.z" com a etiqueta vx.y.z e envia para o GitHub.
// Lá, o GitHub Actions (.github/workflows/release.yml) gera o instalador num Windows dele e publica a Release.
// (O instalador não é gerado neste PC porque o Controle Inteligente de Aplicativos bloqueia programas sem assinatura.)
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts })
const out = (cmd) => execSync(cmd, { encoding: "utf8" }).trim()
const fail = (msg) => { console.error("\n✖ " + msg + "\n"); process.exit(1) }

if (out("git status --porcelain")) fail("Tem mudanças não salvas no git. Faça o commit antes de lançar uma versão.")
if (out("git rev-parse --abbrev-ref HEAD") !== "main") fail("Lance as versões a partir da branch main.")

// confere antes que o app compila (sem erro de TypeScript)
sh("npm run build")

const kind = process.argv[2] || "patch"
sh(`npm version ${kind} --no-git-tag-version`, { stdio: "ignore" })
const version = JSON.parse(readFileSync("package.json", "utf8")).version

sh("git add package.json package-lock.json")
sh(`git commit -m "Versão ${version}"`)
sh(`git tag -a v${version} -m "Versão ${version}"`)
sh(`git push origin main v${version}`)

console.log(`
✔ Versão ${version} enviada. O GitHub está gerando o instalador agora (uns 10 minutos):
  https://github.com/core-dev-user/agenda/actions
  Quando terminar, ela aparece em https://github.com/core-dev-user/agenda/releases
  e os Agendas instalados baixam sozinhos ao abrir (ou em até 3 horas).
`)
