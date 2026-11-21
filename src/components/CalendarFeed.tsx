import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

const feedKey = (userId: string | undefined) => ['calendar-feed', userId]

/** Feed URL for a token. https for copy/paste; webcal:// makes Apple Calendar / Outlook subscribe on click. */
function feedUrls(token: string) {
  const https = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar?token=${token}`
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
 * Private calendar subscription (Waitlist → "Add to your calendar", and Settings). Creates a secret feed link on
 * request; "New link" revokes the old one.
 */
export function CalendarFeed() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

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
  const urls = token ? feedUrls(token) : null

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-fg">Calendar subscription</p>
        <p className="mt-1 text-sm text-muted">
          Releases, premieres and new episodes from your deck, in Google Calendar, Apple Calendar or Outlook. It
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
