import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { FeedFilter } from '../../supabase/functions/_shared/releases.ts'

/** Feed options. "New releases" is the default; the rest sit under "More options". */
const MAIN: { value: FeedFilter; label: string; hint: string } = {
  value: 'new',
  label: 'New releases',
  hint: 'New movies, series and season premieres, game launches (Early Access and 1.0) and book releases. No individual episodes.',
}
const MORE: { value: FeedFilter; label: string; hint: string }[] = [
  { value: 'all', label: 'Everything', hint: 'Also the next episode of every show that’s airing.' },
  { value: 'movie', label: 'Movies only', hint: 'Movie releases.' },
  { value: 'tv', label: 'TV only', hint: 'Premieres, new seasons and next episodes.' },
  { value: 'game', label: 'Games only', hint: 'Releases, Early Access launches and 1.0 releases.' },
  { value: 'book', label: 'Books only', hint: 'Book publication dates.' },
]
const FILTER_KEY = 'ondeck.calendarFeedFilter'

function savedFilter(): FeedFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY)
    return v && [MAIN, ...MORE].some((o) => o.value === v) ? (v as FeedFilter) : 'new'
  } catch {
    return 'new'
  }
}

const feedKey = (userId: string | undefined) => ['calendar-feed', userId]

/** Feed URL for a token. https for copy/paste; webcal:// makes Apple Calendar / Outlook subscribe on click. */
function feedUrls(token: string, only: FeedFilter) {
  // The file name in the path gives calendar apps a readable name (the function ignores it).
  const file = only === 'new' ? 'on-deck-default' : `on-deck-${{ all: 'everything', movie: 'movies', tv: 'tv', game: 'games', book: 'books' }[only]}`
  const https = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar/${file}.ics?token=${token}&only=${only}`
  const webcal = https.replace(/^https?:/, 'webcal:')
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
  }
}

const btn =
  'flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg hover:border-accent disabled:opacity-60'

/**
 * Private calendar subscription (Calendar page → "Add to your calendar"). Creates a secret feed link on
 * request; "New link" revokes the old one.
 */
export function CalendarFeed() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [filter, setFilterState] = useState<FeedFilter>(savedFilter)
  const [showMore, setShowMore] = useState(() => filter !== 'new')
  const setFilter = (f: FeedFilter) => {
    setFilterState(f)
    setCopied(false)
    try {
      localStorage.setItem(FILTER_KEY, f)
    } catch {
      // remembering the choice is optional
    }
  }

  const feed = useQuery({
    queryKey: feedKey(user?.id),
    enabled: !!supabase && !!user,
    queryFn: async () => {
      const { data, error } = await supabase!.from('calendar_feeds').select('token').maybeSingle()
      if (error) throw error
      return (data?.token as string | undefined) ?? null
    },
  })

  const create = useMutation({
    mutationFn: async ({ replace }: { replace: boolean }) => {
      if (replace) {
        const { error } = await supabase!.from('calendar_feeds').delete().eq('user_id', user!.id)
        if (error) throw error
      }
      const { data, error } = await supabase!.from('calendar_feeds').insert({ user_id: user!.id }).select('token').single()
      if (error) throw error
      return data.token as string
    },
    onSuccess: (token) => {
      queryClient.setQueryData(feedKey(user?.id), token)
      setConfirmReset(false)
    },
  })

  if (!supabase || !user) {
    return <p className="text-sm text-muted">Sign in to get a calendar link.</p>
  }

  const token = feed.data
  const urls = token ? feedUrls(token, filter) : null

  const option = (o: { value: FeedFilter; label: string; hint: string }) => (
    <label
      key={o.value}
      className={clsx(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5',
        filter === o.value ? 'border-accent/70 bg-accent/5' : 'border-line hover:border-faint',
      )}
    >
      <input
        type="radio"
        name="calendar-feed-filter"
        value={o.value}
        checked={filter === o.value}
        onChange={() => setFilter(o.value)}
        className="mt-0.5 accent-[var(--color-accent)]"
      />
      <span>
        <span className="block text-sm text-fg">{o.label}</span>
        <span className="block text-xs text-muted">{o.hint}</span>
      </span>
    </label>
  )

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-fg">Calendar subscription</p>
        <p className="mt-1 text-sm text-muted">
          Release dates from your library, in Google Calendar, Apple Calendar or Outlook. It
          updates by itself, though Google can take up to a day to pick up changes.
        </p>
      </div>

      {feed.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted" />
      ) : !urls ? (
        <button
          type="button"
          disabled={create.isPending}
          onClick={() => create.mutate({ replace: false })}
          className="flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:brightness-95 disabled:opacity-60"
        >
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          Create my calendar link
        </button>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="sr-only">What to include</legend>
            {option(MAIN)}
            <button
              type="button"
              aria-expanded={showMore}
              onClick={() => setShowMore((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted hover:text-fg"
            >
              More options
              <ChevronDown className={clsx('size-3.5 transition-transform', showMore && 'rotate-180')} />
            </button>
            {showMore && <div className="space-y-2">{MORE.map(option)}</div>}
          </fieldset>
          <p className="text-xs text-faint">
            Each option is its own calendar. Pick one, then add it; you can add more than one.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={urls.google} target="_blank" rel="noreferrer" className={btn}>
              Add to Google Calendar
            </a>
            <a href={urls.webcal} className={btn}>
              Apple Calendar / Outlook
            </a>
            <button
              type="button"
              className={btn}
              onClick={async () => {
                await navigator.clipboard.writeText(urls.https)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="text-xs text-faint">
            Keep this link private: anyone who has it can see your upcoming releases. If it gets out, make a new one
            and the old link stops working.
          </p>
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Calendars using the old link will stop updating.</span>
              <button
                type="button"
                disabled={create.isPending}
                onClick={() => create.mutate({ replace: true })}
                className={btn}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                Make new link
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="text-muted hover:text-fg">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-fg"
            >
              <RefreshCw className="size-3.5" /> New link
            </button>
          )}
        </>
      )}
      {(feed.error || create.error) && <p className="text-sm text-bad">Something went wrong. Please try again.</p>}
    </div>
  )
}
