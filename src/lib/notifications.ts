// Inbox notifications written by the `daily` job (docs/SPEC.md → Notifications).
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './auth'
import { supabase } from './supabase'

export interface Notification {
  id: string
  titleId: string | null
  kind: 'release_day' | 'week_before' | 'date_changed' | 'announced' | 'available' | 'price_low' | 'price_deal' | string
  message: string
  createdAt: string
  readAt: string | null
}

const key = (userId: string | undefined) => ['notifications', userId]

export function useNotifications() {
  const { user } = useAuth()
  return useQuery({
    queryKey: key(user?.id),
    enabled: !!user && !!supabase,
    refetchInterval: 15 * 60_000,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase!
        .from('notifications')
        .select('id, title_id, kind, message, created_at, read_at, payload')
        .order('created_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return (data ?? [])
        // "Seed" rows only mark what was already true when alerts were switched on; they aren't news.
        .filter((n) => !(n.payload as { seed?: boolean } | null)?.seed)
        .slice(0, 50)
        .map((n) => ({
          id: n.id as string,
          titleId: n.title_id as string | null,
          kind: n.kind as string,
          message: n.message as string,
          createdAt: n.created_at as string,
          readAt: n.read_at as string | null,
        }))
    },
  })
}

/** Marks the given notifications (or all unread) as read. */
export function useMarkRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const now = new Date().toISOString()
      let q = supabase!.from('notifications').update({ read_at: now }).is('read_at', null)
      if (ids) q = q.in('id', ids)
      const { error } = await q
      if (error) throw error
      return now
    },
    onMutate: (ids) => {
      const now = new Date().toISOString()
      queryClient.setQueryData<Notification[]>(key(user?.id), (list) =>
        list?.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n)),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key(user?.id) }),
  })
}

/** Saves the browser's time zone to the profile, so the daily job's "out today" follows the user's day. */
export function useTimezoneSync() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user || !supabase) return
    let tz: string | undefined
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      return
    }
    if (!tz) return
    void supabase.from('profiles').update({ timezone: tz }).eq('user_id', user.id).neq('timezone', tz)
    // `neq` skips the write when it's already saved; a null timezone needs its own update.
    void supabase.from('profiles').update({ timezone: tz }).eq('user_id', user.id).is('timezone', null)
  }, [user])
}
