import { useEffect } from 'react'

/** The browser tab's title for this page ("Severance – On Deck"), so tabs, history and screen readers say where you are. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} – On Deck` : 'On Deck'
  }, [title])
}
