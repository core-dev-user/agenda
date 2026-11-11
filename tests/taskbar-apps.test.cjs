const { test } = require("node:test")
const assert = require("node:assert/strict")
const { collectStartApps, isAppsFolderTarget } = require("../electron/startapps.cjs")

test("enumerates deeply nested Windows shortcuts and adds modern AppsFolder apps", async () => {
  const data = {
    "R": [{ name: "Editors", dir: true }, { name: "Chrome.lnk" }],
    "R/Editors": [{ name: "Tools", dir: true }],
    "R/Editors/Tools": [{ name: "Tool.lnk" }, { name: "uninstall.lnk" }],
  }
  const fsApi = { async readdir(p) {
    const key = p.replace(/\\/g, "/")
    if (!data[key]) throw Error("missing")
    return data[key].map((x) => ({
      name: x.name, isDirectory: () => !!x.dir, isFile: () => !x.dir,
    }))
  }}
  const list = await collectStartApps({
    roots: ["R"],
    fsApi,
    query: async () => [
      { Name: "Chrome", Target: "shell:AppsFolder\\Chrome_1!App" },
      { Name: "Calculadora", Target: "shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" },
      { Name: "Editor", Target: "C:\\Program Files\\Editor\\editor.exe" },
      { Name: "Unsafe", Target: "shell:AppsFolder\\test\\malicious" },
    ],
  })
  assert.equal(list.length, 4)
  assert.ok(list.some((a) => a.name === "Tool" && a.path.endsWith("Tool.lnk")))
  assert.equal(list.find((a) => a.name === "Chrome").path, require("node:path").join("R", "Chrome.lnk"))
  assert.ok(list.some((a) => a.name === "Calculadora"))
  assert.ok(list.some((a) => a.name === "Editor"))
})

test("AppsFolder launchers reject newlines, nested paths and traversal", () => {
  assert.ok(isAppsFolderTarget("shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"))
  assert.equal(isAppsFolderTarget("shell:AppsFolder\\foo\\bar"), false)
  assert.equal(isAppsFolderTarget("shell:AppsFolder\\foo\nbar"), false)
  assert.equal(isAppsFolderTarget("shell:AppsFolder\\.."), false)
})
test("registry query fails gracefully and still returns classic shortcuts", async () => {
  const rows = await collectStartApps({
    roots: ["/absent"],
    fsApi: { async readdir() { throw Error("unavailable") } },
    query: async () => { throw Error("PowerShell unavailable") },
  })
  assert.deepEqual(rows, [])
})
