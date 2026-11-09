import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'
import { createFileStorage, shallowEqual } from '../src/lib/persistence.ts'
import { startTicker, stopwatchDelay } from '../src/lib/ticker.ts'
import { barInputs } from '../src/lib/barInputs.ts'
import type { Settings, AppNotification } from '../src/lib/types.ts'

test('transient Zustand updates do not serialize or send unchanged persisted data', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const measure = (batched: boolean) => {
    let serializations = 0, writes = 0
    const data = { value: 1, toJSON() { serializations++; return { value: this.value } } }
    const io = { get: () => null, set: (_s: string) => { writes++ } }
    const file = createFileStorage<{ data: typeof data }>(io)
    const storage = batched ? file.storage : createJSONStorage<{ data: typeof data }>(() => ({ getItem: io.get, setItem: (_k, v) => io.set(v), removeItem() {} }))!
    const store = createStore(persist(() => ({ data, temporary: 0 }), { name: 'test', storage, partialize: (s) => ({ data: s.data }) }))
    store.setState({ temporary: 1 }); file.flush()
    writes = 0; serializations = 0
    for (let i = 0; i < 1000; i++) store.setState({ temporary: i })
    file.flush()
    return { writes, serializations }
  }
  assert.deepEqual(measure(false), { writes: 1000, serializations: 1000 })
  assert.deepEqual(measure(true), { writes: 0, serializations: 0 })
})

test('continuous edits save at bounded intervals and retain the newest snapshot', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const saved: string[] = []
  const f = createFileStorage<{ value: number }>({ get: () => null, set: (s) => saved.push(s) })
  for (let i = 0; i < 100; i++) {
    f.storage.setItem('agenda', { version: 1, state: { value: i } })
    t.mock.timers.tick(10)
  }
  assert.equal(saved.length, 4)
  assert.equal(JSON.parse(saved.at(-1)!).state.value, 99)
})

test('closing flushes the newest pending edit immediately and cancels its timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const saved: string[] = []
  const f = createFileStorage<{ note: string }>({ get: () => null, set: (s) => saved.push(s) })
  f.storage.setItem('agenda', { version: 1, state: { note: 'old' } })
  f.storage.setItem('agenda', { version: 1, state: { note: 'new' } })
  assert.equal(saved.length, 0)
  f.flush()
  assert.deepEqual(JSON.parse(saved[0]), { version: 1, state: { note: 'new' } })
  t.mock.timers.tick(20000); f.flush()
  assert.equal(saved.length, 1)
})

test('failed writes remain pending for retry', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fail = true, saved = ''
  const f = createFileStorage({ get: () => null, set: (s) => { if (fail) throw new Error('unavailable'); saved = s } })
  f.storage.setItem('agenda', { state: { note: 'keep' }, version: 1 })
  assert.throws(f.flush, /unavailable/)
  fail = false; f.flush()
  assert.equal(JSON.parse(saved).state.note, 'keep')
})

test('hydrates existing format, persists version changes, and clear cancels pending saves', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let saved = JSON.stringify({ state: { note: 'existing' }, version: 1 })
  const f = createFileStorage<{ note: string }>({ get: () => saved, set: (s) => { saved = s } })
  const value = f.storage.getItem('agenda') as { state: { note: string }; version: number }
  assert.equal(value.state.note, 'existing')
  f.storage.setItem('agenda', value); f.flush()
  f.storage.setItem('agenda', { ...value, version: 2 }); f.flush()
  assert.equal(JSON.parse(saved).version, 2)
  f.storage.setItem('agenda', { state: { note: 'pending' } })
  f.storage.removeItem('agenda')
  t.mock.timers.tick(1000)
  assert.equal(saved, '{}')
})

test('background stopwatch wakes once per second instead of about 30 times', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  let updates = 0, paused = true
  const ticker = startTicker(() => { updates++ }, () => stopwatchDelay(paused, null))
  for (let i = 0; i < 1000; i++) t.mock.timers.tick(10)
  assert.equal(updates, 10)
  paused = false; ticker.refresh()
  const before = updates
  for (let i = 0; i < 30; i++) t.mock.timers.tick(33)
  assert.equal(updates - before, 30)
  ticker.stop(); t.mock.timers.tick(5000)
  assert.equal(updates - before, 30)
})

test('background timer wakes at its deadline, including after a clock jump', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const times: number[] = []
  const ticker = startTicker(() => times.push(Date.now()), () => stopwatchDelay(true, 1250))
  t.mock.timers.tick(1000); t.mock.timers.tick(249)
  assert.deepEqual(times, [1000])
  t.mock.timers.tick(1)
  assert.deepEqual(times, [1000, 1250])
  t.mock.timers.setTime(10000); ticker.refresh()
  assert.equal(times.at(-1), 10000)
  assert.equal(stopwatchDelay(true, 1250), 1000)
  ticker.stop()
})

test('bar ignores layout and read notification changes, but observes appearance, pins, unread', () => {
  const settings = { theme: 'glass', taskbar: { size: 56, style: 'dock', showLabels: false } } as Settings
  const state = { settings, notifications: [] as AppNotification[] }
  const initial = barInputs(state)
  assert.ok(shallowEqual(initial, barInputs({ ...state, settings: { ...settings, layoutRef: { w: 1920, h: 1080 } } })))
  assert.ok(shallowEqual(initial, barInputs({ ...state, notifications: [{ id: 'read', read: true } as AppNotification] })))
  for (const p of [{ accent: '#fff' }, { uiFont: 'inter' }, { pcPins: [{ name: 'App', path: 'app.exe' }] }]) {
    assert.ok(!shallowEqual(initial, barInputs({ ...state, settings: { ...settings, ...p } })))
  }
  assert.ok(!shallowEqual(initial, barInputs({ ...state, notifications: [{ id: 'new' } as AppNotification] })))
})
