import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { libraryKey } from './library'
import type { UserItem } from '../types'

/**
 * Keeps the signed-in user's library in IndexedDB on this device, so a return visit shows it straight away while
 * the fresh copy loads (stale-while-revalidate). Only the library is kept. It's wiped on sign-out, and a copy older
 * than a week, or from an older build's shape (VERSION), is ignored.
 */
const DB = 'ondeck'
const STORE = 'cache'
const VERSION = 1
const MAX_AGE = 7 * 24 * 60 * 60_000

interface Entry {
  v: number
  at: number
  data: UserItem[]
}

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  }))
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const keyFor = (userId: string) => `library:${userId}`

async function restore(qc: QueryClient, userId: string) {
  const entry = (await run('readonly', (s) => s.get(keyFor(userId)))) as Entry | undefined
  if (!entry || entry.v !== VERSION || Date.now() - entry.at > MAX_AGE) return
  // Never over a copy that's already arrived from the server.
  if (qc.getQueryData(libraryKey(userId)) !== undefined) return
  // Dated when it was saved, so it counts as stale and the fresh copy still loads.
  qc.setQueryData(libraryKey(userId), entry.data, { updatedAt: entry.at })
}

/** Restores the cached library for the signed-in user, saves each fresh copy, and clears it all on sign-out. */
export function useLibraryCache() {
  const { user, loading } = useAuth()
  const qc = useQueryClient()
  const userId = user?.id

  useEffect(() => {
    if (typeof indexedDB === 'undefined' || loading) return
    if (!userId) {
      // Signed out (or the session ran out): nothing of theirs stays on the device.
      void run('readwrite', (s) => s.clear()).catch(() => {})
      return
    }
    void restore(qc, userId).catch(() => {})

    // Save whenever the server copy changes (a fetch or a save), a moment later so a burst of edits writes once.
    let timer: ReturnType<typeof setTimeout> | undefined
    const key = JSON.stringify(libraryKey(userId))
    const unsub = qc.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated' || JSON.stringify(e.query.queryKey) !== key) return
      const data = e.query.state.data as UserItem[] | undefined
      if (!data || e.query.state.status !== 'success') return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const entry: Entry = { v: VERSION, at: e.query.state.dataUpdatedAt, data }
        void run('readwrite', (s) => s.put(entry, keyFor(userId))).catch(() => {})
      }, 1000)
    })
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [userId, loading, qc])
}
