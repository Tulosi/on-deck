import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Upload } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { buildExport, downloadJson, importExport, readExport, type ExportFile, type ImportReport } from '../lib/backup'
import { useItems } from '../lib/library'

const btn = 'flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-60'
const primary = 'flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60'

/** Settings → Backup: export the library + settings as JSON, or merge an export in. */
export function BackupPanel({ onSetUpAccounts }: { onSetUpAccounts: () => void }) {
  const { user } = useAuth()
  const { allItems } = useItems()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<ExportFile | null>(null)
  const [replaceSettings, setReplaceSettings] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)

  const doExport = async () => {
    setError(null)
    setExporting(true)
    try {
      const data = await buildExport(user!.id)
      downloadJson(data, `on-deck-backup-${new Date().toISOString().slice(0, 10)}.json`)
    } catch {
      setError('Couldn’t build the export. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const pick = async (f: File | undefined) => {
    setError(null)
    setReport(null)
    if (!f) return
    try {
      const data = await readExport(f)
      setPending(data)
      setReplaceSettings(allItems.length === 0) // empty account: take the file's settings too
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t read that file.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const doImport = async () => {
    if (!pending) return
    setError(null)
    setProgress({ done: 0, total: pending.items.length })
    try {
      const r = await importExport(user!.id, pending, { replaceSettings, onProgress: (done, total) => setProgress({ done, total }) })
      setReport(r)
      setPending(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['library'] }),
        queryClient.invalidateQueries({ queryKey: ['collections'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ])
    } catch (e) {
      setError(`Import stopped: ${e instanceof Error ? e.message : 'something went wrong'}. Titles added so far are kept.`)
    } finally {
      setProgress(null)
    }
  }

  const exportedOn = pending
    ? new Date(pending.exported_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void doExport()} disabled={exporting} className={btn}>
          {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={!!pending || !!progress} className={btn}>
          <Upload className="size-4" /> Import…
        </button>
      </div>

      <div className="space-y-2">
        {pending && !progress && (
          <div className="space-y-3 rounded-lg border border-line bg-bg p-3">
            <p className="text-sm text-fg">
              {pending.items.length} title{pending.items.length === 1 ? '' : 's'} and {pending.collections.length} collection
              {pending.collections.length === 1 ? '' : 's'}, exported {exportedOn}
            </p>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceSettings}
                onChange={(e) => setReplaceSettings(e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block text-fg">Also replace my settings with the file’s</span>
                <span className="block text-xs text-muted">
                  Region, streaming services, labels, notification and navigation preferences.
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => void doImport()} className={primary}>
                <Upload className="size-4" /> Import
              </button>
              <button type="button" onClick={() => setPending(null)} className={btn}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {progress && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm text-fg">
              <Loader2 className="size-4 animate-spin" /> Importing… {progress.done} / {progress.total}
            </p>
            <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-faint/40">
              <div
                className="h-full bg-accent-ink transition-[width]"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }}
              />
            </div>
            <p className="text-xs text-faint">New titles are looked up one by one, so a big library takes a minute.</p>
          </div>
        )}

        {report && (
          <div className="space-y-2 rounded-lg border border-good/40 bg-good/5 p-3 text-sm">
            <p className="text-fg">
              Added <b>{report.added}</b> title{report.added === 1 ? '' : 's'}
              {report.alreadyHad ? `. ${report.alreadyHad} already in your library (left as they were)` : ''}
              {report.collectionsCreated ? `. ${report.collectionsCreated} collection${report.collectionsCreated === 1 ? '' : 's'} created` : ''}
              {report.collectionsUpdated ? `. ${report.collectionsUpdated} topped up` : ''}
              {report.settingsApplied ? '. Settings applied' : ''}.
            </p>
            {report.failed.length > 0 && (
              <details className="text-xs text-bad">
                <summary className="cursor-pointer">{report.failed.length} couldn’t be added</summary>
                <ul className="mt-1 list-disc pl-5">
                  {report.failed.slice(0, 50).map((f, i) => (
                    <li key={`${i}-${f.title}`}>
                      {f.title}: {f.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {report.wasEmpty && (
              <div className="space-y-1.5 border-t border-good/30 pt-2">
                <p className="text-fg">
                  <b>Next: link your accounts.</b> Account links aren’t part of a backup, so connect Plex (and Seerr) for
                  watch progress and availability, and Steam for ownership and playtime.
                </p>
                <button type="button" onClick={onSetUpAccounts} className={btn}>
                  Set up accounts
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </div>
  )
}
