// Export / import of a user's library and settings (docs/ROADMAP.md → Group E).
// Format: JSON, `format: "on-deck-export"`, `version: 1`. Titles are referenced by their source
// (`media_type` + `source` + `source_id`, e.g. movie · tmdb · 438631), so a file works on any On Deck server.
// Left out on purpose: secrets and account links (Plex token, Seerr key, Steam link, calendar / share links,
// push devices), alerts, and cached data (prices, availability), which are re-fetched.
import { supabase } from './supabase'

export const EXPORT_FORMAT = 'on-deck-export'
export const EXPORT_VERSION = 1

/** Tracking fields carried over per title (everything personal about it). */
const ITEM_FIELDS = [
  'owned',
  'owned_locked',
  'progress',
  'progress_locked',
  'verdict',
  'favourite',
  'priority',
  'notes',
  'current_season',
  'current_episode',
  'plex_sync',
  'notify',
  'season_overrides',
  'rating_skipped',
  'started_at',
  'completed_at',
  'stalled_at',
  'archived_at',
  'created_at',
] as const

/** Profile settings carried over (no account links). */
const SETTINGS_FIELDS = ['country_code', 'currency', 'streaming_services', 'card_chips', 'alert_settings', 'nav_layout'] as const

export interface TitleRef {
  media_type: 'movie' | 'tv' | 'game' | 'book'
  source: string
  source_id: string
  /** For humans reading the file, and for reporting; not used for matching. */
  title: string
  year: number | null
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: number
  exported_at: string
  settings: Record<string, unknown>
  items: (Record<string, unknown> & { title: TitleRef })[]
  collections: { name: string; description: string | null; rules: string | null; items: TitleRef[] }[]
}

const refKey = (r: Pick<TitleRef, 'media_type' | 'source' | 'source_id'>) => `${r.media_type}:${r.source}:${r.source_id}`

// ─── Export ────────────────────────────────────────────────────────────────

export async function buildExport(userId: string): Promise<ExportFile> {
  const db = supabase!
  const [{ data: items, error: e1 }, { data: cols, error: e2 }, { data: profile, error: e3 }] = await Promise.all([
    db.from('user_items').select(`id, ${ITEM_FIELDS.join(', ')}, title:titles(media_type, source, source_id, title, year)`),
    db.from('collections').select('name, description, rules, created_at, collection_items(user_item_id, position, added_at)').order('created_at'),
    db.from('profiles').select(SETTINGS_FIELDS.join(', ')).eq('user_id', userId).maybeSingle(),
  ])
  if (e1 || e2 || e3) throw e1 ?? e2 ?? e3
  const refById = new Map<string, TitleRef>()
  const outItems = ((items ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const t = row.title as TitleRef
    const ref: TitleRef = { media_type: t.media_type, source: t.source, source_id: t.source_id, title: t.title, year: t.year ?? null }
    refById.set(row.id as string, ref)
    const out: Record<string, unknown> = {}
    for (const f of ITEM_FIELDS) if (row[f] !== null && row[f] !== undefined) out[f] = row[f]
    return { ...out, title: ref }
  })
  const outCollections = ((cols ?? []) as unknown as Record<string, unknown>[]).map((c) => ({
    name: c.name as string,
    description: (c.description as string | null) ?? null,
    rules: (c.rules as string | null) ?? null,
    // Smart collections are rebuilt from their rules; hand-picked ones keep their titles in order.
    items:
      c.rules != null
        ? []
        : ((c.collection_items ?? []) as { user_item_id: string; position: number; added_at: string }[])
            .sort((a, b) => a.position - b.position || a.added_at.localeCompare(b.added_at))
            .map((ci) => refById.get(ci.user_item_id))
            .filter((r): r is TitleRef => !!r),
  }))
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    settings: (profile ?? {}) as Record<string, unknown>,
    items: outItems,
    collections: outCollections,
  }
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── Import (merge) ────────────────────────────────────────────────────────

/** Reads and checks a file the user picked. Throws a readable message if it isn't an On Deck export. */
export async function readExport(file: File): Promise<ExportFile> {
  let data: unknown
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('That file isn’t valid JSON.')
  }
  const f = data as Partial<ExportFile>
  if (f?.format !== EXPORT_FORMAT || typeof f.version !== 'number' || !Array.isArray(f.items)) {
    throw new Error('That isn’t an On Deck export file.')
  }
  if (f.version > EXPORT_VERSION) throw new Error('This file is from a newer version of On Deck; update first.')
  return { settings: {}, collections: [], ...f } as ExportFile
}

export interface ImportReport {
  added: number
  alreadyHad: number
  failed: { title: string; reason: string }[]
  collectionsCreated: number
  collectionsUpdated: number
  settingsApplied: boolean
  wasEmpty: boolean
}

const ADD_FN: Record<string, (r: TitleRef) => { fn: string; body: Record<string, unknown> }> = {
  tmdb: (r) => ({ fn: 'tmdb', body: { action: 'add', tmdbId: Number(r.source_id), mediaType: r.media_type } }),
  igdb: (r) => ({ fn: 'igdb', body: { action: 'add', igdbId: Number(r.source_id) } }),
  hardcover: (r) => ({ fn: 'hardcover', body: { action: 'add', hardcoverId: Number(r.source_id) } }),
}

/**
 * Merges an export into the signed-in user's library. Titles already in the library are left exactly as they
 * are; new ones are looked up (or fetched from their source) and added with their tracking. Collections are
 * created, or topped up when one with the same name exists. Settings are replaced only when `replaceSettings`.
 */
export async function importExport(
  userId: string,
  file: ExportFile,
  opts: { replaceSettings: boolean; onProgress?: (done: number, total: number) => void },
): Promise<ImportReport> {
  const db = supabase!
  const report: ImportReport = {
    added: 0,
    alreadyHad: 0,
    failed: [],
    collectionsCreated: 0,
    collectionsUpdated: 0,
    settingsApplied: false,
    wasEmpty: false,
  }

  // What's already in the library (by source reference).
  const { data: mine, error } = await db.from('user_items').select('id, title:titles(media_type, source, source_id)')
  if (error) throw error
  const itemIdByKey = new Map<string, string>()
  for (const r of (mine ?? []) as unknown as { id: string; title: TitleRef }[]) itemIdByKey.set(refKey(r.title), r.id)
  report.wasEmpty = itemIdByKey.size === 0

  const todo = file.items.filter((it) => {
    if (itemIdByKey.has(refKey(it.title))) {
      report.alreadyHad++
      return false
    }
    return true
  })

  // Titles that already exist on this server (any user added them), looked up in batches per source.
  const titleIdByKey = new Map<string, string>()
  const bySource = new Map<string, TitleRef[]>()
  for (const it of todo) {
    const k = `${it.title.media_type}|${it.title.source}`
    if (!bySource.has(k)) bySource.set(k, [])
    bySource.get(k)!.push(it.title)
  }
  for (const [k, refs] of bySource) {
    const [media_type, source] = k.split('|')
    for (let i = 0; i < refs.length; i += 100) {
      const ids = refs.slice(i, i + 100).map((r) => r.source_id)
      const { data } = await db.from('titles').select('id, source_id').eq('media_type', media_type).eq('source', source).in('source_id', ids)
      for (const t of (data ?? []) as { id: string; source_id: string }[]) titleIdByKey.set(`${media_type}:${source}:${t.source_id}`, t.id)
    }
  }

  // Fetch the missing ones from their source, a few at a time.
  let done = 0
  const total = todo.length
  opts.onProgress?.(0, total)
  const missing = todo.filter((it) => !titleIdByKey.has(refKey(it.title)))
  const queue = [...missing]
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift()!
      const add = ADD_FN[it.title.source]
      if (!add) {
        report.failed.push({ title: it.title.title, reason: `unknown source "${it.title.source}"` })
      } else {
        const { fn, body } = add(it.title)
        const { data, error: e } = await db.functions.invoke(fn, { body })
        if (e || !data?.title?.id) report.failed.push({ title: it.title.title, reason: 'couldn’t be fetched from its source' })
        else titleIdByKey.set(refKey(it.title), data.title.id as string)
      }
      opts.onProgress?.(++done, total)
    }
  }
  await Promise.all([worker(), worker(), worker()])

  // Add the library entries, keeping each title's tracking.
  const rows = todo
    .filter((it) => titleIdByKey.has(refKey(it.title)))
    .map((it) => {
      const row: Record<string, unknown> = { user_id: userId, title_id: titleIdByKey.get(refKey(it.title)) }
      for (const f of ITEM_FIELDS) if (it[f] !== undefined) row[f] = it[f]
      return row
    })
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    const { data, error: e } = await db
      .from('user_items')
      .upsert(chunk, { onConflict: 'user_id,title_id', ignoreDuplicates: true })
      .select('id, title_id')
    if (e) {
      chunk.forEach(() => report.failed.push({ title: '(batch)', reason: e.message }))
      continue
    }
    report.added += data?.length ?? 0
  }
  opts.onProgress?.(total, total)

  // Refresh the id map (new entries included) for collections.
  const { data: after } = await db.from('user_items').select('id, title:titles(media_type, source, source_id)')
  itemIdByKey.clear()
  for (const r of (after ?? []) as unknown as { id: string; title: TitleRef }[]) itemIdByKey.set(refKey(r.title), r.id)

  // Collections: create, or top up a same-named one.
  const { data: existingCols } = await db.from('collections').select('id, name, rules, collection_items(user_item_id)')
  for (const c of file.collections ?? []) {
    const match = ((existingCols ?? []) as { id: string; name: string; rules: string | null; collection_items: { user_item_id: string }[] }[]).find(
      (x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
    )
    let colId = match?.id
    const present = new Set((match?.collection_items ?? []).map((x) => x.user_item_id))
    if (!colId) {
      const { data, error: e } = await db
        .from('collections')
        .insert({ name: c.name, description: c.description, rules: c.rules })
        .select('id')
        .single()
      if (e) continue
      colId = data.id as string
      report.collectionsCreated++
    }
    if (c.rules != null) continue // smart: rebuilt from its rules
    const add = c.items
      .map((r) => itemIdByKey.get(refKey(r)))
      .filter((id): id is string => !!id && !present.has(id))
      .map((id, i) => ({ collection_id: colId!, user_item_id: id, position: present.size + i }))
    if (add.length) {
      await db.from('collection_items').insert(add)
      if (match) report.collectionsUpdated++
    }
  }

  // Settings.
  if (opts.replaceSettings && file.settings) {
    const patch: Record<string, unknown> = {}
    for (const f of SETTINGS_FIELDS) if (file.settings[f] !== undefined) patch[f] = file.settings[f]
    if (Object.keys(patch).length) {
      const { error: e } = await db.from('profiles').update(patch).eq('user_id', userId)
      report.settingsApplied = !e
    }
  }
  return report
}
