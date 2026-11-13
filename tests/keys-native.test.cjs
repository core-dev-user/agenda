// A decisão da tecla Windows (AgKeys.Step) roda fora do Windows: compila o mesmo C# do keys.cjs com o Mono
// e alimenta sequências de teclas. Sem o Mono instalado, os testes são pulados (o código é o mesmo do app).
const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFileSync, spawnSync } = require("node:child_process")

const src = fs.readFileSync(path.join(__dirname, "../electron/keys.cjs"), "utf8")
const block = (name) => { const tag = "const " + name + " = String.raw`"; const i = src.indexOf(tag) + tag.length; return src.slice(i, src.indexOf("`", i)) }
const has = (cmd) => spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0
const mono = has("mcs") && has("mono")

// cada linha: teclas separadas por espaço; "+5B" aperta, "-5B" solta (hex). Na saída, o que o gancho fez com a
// tecla aparece ANTES dela: [evento] mandado ao Widgy, <tecla> injetada; "!" depois da tecla = engolida.
const DRIVER = String.raw`
public static class KeysDriver {
  public static int Main(string[] args) {
    var log = new System.Text.StringBuilder();
    AgKeys.Emit = (e) => log.Append("[" + e + "]");
    AgKeys.Send = (seq) => { foreach (var k in seq) log.Append("<" + ((k & AgKeys.UP) != 0 ? "-" : "+") + (k & 0xFFFF).ToString("X2") + ">"); };
    string line;
    while ((line = System.Console.In.ReadLine()) != null) {
      log.Clear(); AgKeys.Reset();
      var parts = line.Split(' ');
      AgKeys.WinAlone = parts[0] == "widgy";
      for (int n = 1; n < parts.Length; n++) {
        bool down = parts[n][0] == '+';
        uint vk = System.Convert.ToUInt32(parts[n].Substring(1), 16);
        int r = AgKeys.Step(vk, down);
        log.Append(parts[n] + (r == 1 ? "!" : ""));
        log.Append(' ');
      }
      System.Console.WriteLine(log.ToString().Trim());
    }
    return 0;
  }
}
`
let exe = ""
function run(lines) {
  if (!exe) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wkeys-"))
    fs.writeFileSync(path.join(dir, "k.cs"), block("CS") + block("PROGRAM") + DRIVER)
    exe = path.join(dir, "k.exe")
    execFileSync("mcs", ["-nologo", "-target:exe", "-main:KeysDriver", "-out:" + exe, path.join(dir, "k.cs")])
  }
  return execFileSync("mono", [exe], { input: lines.join("\n") + "\n" }).toString().trim().split(/\r?\n/)
}

test("the native helper compiles as a program of its own (widgy-keys.exe)", { skip: !mono && "Mono não instalado" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wkeys-"))
  fs.writeFileSync(path.join(dir, "p.cs"), block("CS") + block("PROGRAM"))
  execFileSync("mcs", ["-nologo", "-target:exe", "-out:" + path.join(dir, "p.exe"), path.join(dir, "p.cs")])
  assert.ok(fs.existsSync(path.join(dir, "p.exe")))
})

test("Windows key alone opens the Widgy Start and the Windows Start never sees a clean press", { skip: !mono && "Mono não instalado" }, () => {
  const [left, right] = run(["widgy +5B -5B", "widgy +5C -5C"])
  // o soltar de verdade é engolido (!) e o Widgy manda: tecla neutra apertada/solta + Windows solta
  assert.equal(left, "+5B <+E8><-E8><-5B>[start]-5B!")
  assert.equal(right, "+5C <+E8><-E8><-5C>[start]-5C!")
})

test("with the option off the key goes to Windows untouched, and that is reported", { skip: !mono && "Mono não instalado" }, () => {
  assert.equal(run(["windows +5B -5B"])[0], "+5B [pass:windows]-5B")
})

test("Win+S, Win+D and Ctrl+Esc are taken; the letter release is swallowed too", { skip: !mono && "Mono não instalado" }, () => {
  const [s, d, ce] = run(["widgy +5B +53 -53 -5B", "widgy +5B +44 -44 -5B", "widgy +A2 +1B -1B -A2"])
  assert.equal(s, "+5B [search]+53! -53! <+E8><-E8><-5B>-5B!")
  assert.equal(d, "+5B [desktop]+44! -44! <+E8><-E8><-5B>-5B!")
  assert.equal(ce, "+A2 [start]+1B! -1B! -A2")
})

test("other Windows shortcuts stay native and do not open the Widgy Start", { skip: !mono && "Mono não instalado" }, () => {
  const [e, shot, v] = run(["widgy +5B +45 -45 -5B", "widgy +5B +A0 +53 -53 -A0 -5B", "widgy +5B +56 -56 -5B"])
  assert.equal(e, "+5B +45 -45 -5B") // Win+E: explorador
  assert.equal(shot, "+5B +A0 +53 -53 -A0 -5B") // Win+Shift+S: recorte de tela
  assert.equal(v, "+5B +56 -56 -5B") // Win+V: área de transferência
})

test("only keys marked by Widgy are ignored by the hook; keys injected by other programs count", () => {
  const cs = block("CS")
  assert.match(cs, /if \(\(uint\)k\.extra != MAGIC\)/)
  assert.doesNotMatch(cs, /flags & 0x10/, "ignorar toda tecla injetada fazia softwares de teclado driblarem o atalho")
  const wh = fs.readFileSync(path.join(__dirname, "../electron/winhelper.cjs"), "utf8")
  const start = wh.slice(wh.indexOf("public static void WinStart"), wh.indexOf("\n", wh.indexOf("public static void WinStart")))
  assert.match(start, /0x57444759/, "o botão Iniciar do Windows precisa da marca do Widgy")
})
