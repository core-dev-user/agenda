import type { PersistStorage, StorageValue } from "zustand/middleware"

/** Compare the persisted fields before JSON serialization (Zustand uses immutable updates). */
export function shallowEqual(a: object, b: object) {
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(left[key], right[key]))
}

/** Bounded batching: continuous edits still save every 250 ms, not only after they stop. */
export function createFileStorage<S extends object>(io: { get(): string | null; set(value: string): void }, delay = 250) {
  let last: StorageValue<S> | undefined
  let pending: StorageValue<S> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (!pending) return
    // Keep the pending snapshot if serialization or sending fails, so a later flush can retry.
    io.set(JSON.stringify(pending))
    last = pending
    pending = undefined
  }
  const storage: PersistStorage<S> = {
    getItem: () => {
      const raw = io.get()
      return raw === null ? null : JSON.parse(raw)
    },
    setItem: (_key, value) => {
      const previous = pending ?? last
      if (previous && previous.version === value.version && shallowEqual(previous.state, value.state)) return
      pending = value
      if (timer === undefined) timer = setTimeout(flush, delay)
    },
    removeItem: () => {
      clearTimeout(timer)
      timer = undefined
      pending = undefined
      last = undefined
      io.set("{}")
    },
  }
  return { storage, flush }
}
