const { EventEmitter } = require('node:events')

/** Correlation IDs keep unsolicited WinEvents and late replies out of the command queue. */
function createSession(child, { startupMs = 20000, commandMs = 5000 } = {}) {
  const events = new EventEmitter()
  let closed = false, started = false, seq = 0, buffer = '', settleReady
  const pending = new Map()
  const ready = new Promise((resolve) => { settleReady = resolve })
  const fail = (reason) => {
    if (closed) return
    closed = true
    clearTimeout(startup)
    settleReady(false)
    for (const p of pending.values()) { clearTimeout(p.timer); p.resolve('') }
    pending.clear()
    events.emit('closed', reason)
  }
  const startup = setTimeout(() => fail('O componente nativo não iniciou a tempo.'), startupMs)
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1)
      if (!line || closed) continue
      let m
      try { m = JSON.parse(line) } catch { fail('Resposta inválida do componente nativo.'); continue }
      if (m.ready === true) { started = true; clearTimeout(startup); settleReady(true) }
      else if (m.event) events.emit('event', m.event)
      else if (Number.isInteger(m.id)) {
        const p = pending.get(m.id)
        if (!p) continue
        pending.delete(m.id); clearTimeout(p.timer)
        p.resolve(m.error ? '' : m.result)
        if (m.error) events.emit('command-error', String(m.error))
      } else if (m.error) fail(String(m.error))
    }
  })
  child.on('error', (e) => fail(e.message))
  child.on('exit', () => fail('O componente nativo foi encerrado.'))
  child.stdin.on('error', (e) => fail(e.message))
  return {
    events, ready,
    get closed() { return closed },
    async call(command) {
      if (!(await ready) || closed || !started) return ''
      const id = ++seq
      return new Promise((resolve) => {
        const timer = setTimeout(() => fail('O componente nativo parou de responder.'), commandMs)
        pending.set(id, { resolve, timer })
        try { child.stdin.write(`${id}\t${command}\n`) } catch (e) { fail(e.message) }
      })
    },
    close() { fail('Encerrado'); try { child.stdin.end() } catch {} },
  }
}
module.exports = { createSession }
