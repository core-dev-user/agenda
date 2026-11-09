const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { EventEmitter } = require('node:events')

// Exercise the actual main-process persistence block with real files, pausing disk I/O
// precisely where an exit or manual flush can overtake an asynchronous write.
function persistence(t) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-persistence-'))
  t.after(() => fs.rmSync(userDir, { recursive: true, force: true }))
  const dataFile = path.join(userDir, 'agenda-data.json')
  let reached, release
  const paused = new Promise(resolve => { reached = resolve })
  const resume = new Promise(resolve => { release = resolve })
  const io = { ...fsp, async open(...args) {
    const handle = await fsp.open(...args)
    return {
      writeFile: (...a) => handle.writeFile(...a), sync: () => handle.sync(),
      async close() { await handle.close(); reached(); await resume },
    }
  } }
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8')
  const block = source.slice(source.indexOf('const backupDir ='), source.indexOf('/* ---------------- Mídia'))
  const writer = new Function('fs', 'fsp', 'path', 'userDir', 'dataFile', 'app', 'process', 'ipcMain', 'system', block +
    '\nreturn { queue(data) { pending=data; return flush() }, flushSync }')(
    fs, io, path, userDir, dataFile, new EventEmitter(), new EventEmitter(), new EventEmitter(), { cloudCopy() {} })
  return { ...writer, paused, release, read: () => fs.readFileSync(dataFile, 'utf8') }
}

test('exit flush saves a snapshot already handed to asynchronous disk I/O', async t => {
  const h = persistence(t), data = '{"state":{"note":"last edit"}}'
  const writing = h.queue(data)
  await h.paused
  h.flushSync()
  assert.equal(h.read(), data)
  h.release(); await writing
  assert.equal(h.read(), data)
})

test('an older disk write cannot overwrite a newer synchronous flush', async t => {
  const h = persistence(t), latest = '{"state":{"note":"newer edit"}}'
  const writing = h.queue('{"state":{"note":"old edit"}}')
  await h.paused
  await h.queue(latest)
  h.flushSync()
  assert.equal(h.read(), latest)
  h.release(); await writing
  assert.equal(h.read(), latest)
  await h.queue('{"state":{"note":"next edit"}}')
  assert.equal(h.read(), '{"state":{"note":"next edit"}}')
})
