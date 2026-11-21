// SAMPLE DATA ONLY — lets the UI shell be reviewed before any API is connected.
// Delete once real data flows from Supabase. No cover images: cards render a placeholder.
import type { UserItem } from '../types'

let n = 0
const id = () => `sample-${++n}`
/** YYYY-MM-DD `days` from today, so the sample Waitlist never goes stale. */
const inDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const nextYear = new Date().getFullYear() + 1

export const sampleItems: UserItem[] = [
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Severance', year: 2022, genres: ['Drama', 'Sci-Fi'], score: { label: 'IMDb', value: '8.7' } }, owned: false, progress: 'in_progress', favourite: true, priority: 'high', tvProgress: { season: 2, episode: 4 }, plex: 'available' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Dune: Part Two', year: 2024, genres: ['Sci-Fi', 'Adventure'], score: { label: 'IMDb', value: '8.5' } }, owned: false, progress: 'wanted', favourite: false, priority: 'high', plex: 'requested' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Hades II', year: 2025, genres: ['Roguelike', 'Action'], score: { label: 'Steam', value: '95%' }, byline: 'Supergiant Games', details: { time_to_beat: { rushed: 18, normal: 26, full: 60, players: 40 } } }, owned: false, progress: 'wanted', favourite: false, priority: 'high', price: { amount: '$22.49', discountPct: 25 } },
  { id: id(), title: { id: id(), mediaType: 'book', title: 'Project Hail Mary', year: 2021, genres: ['Sci-Fi'], score: { label: 'Hardcover', value: '4.5' }, byline: 'Andy Weir' }, owned: true, progress: 'in_progress', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'It Takes Two', year: 2021, genres: ['Co-op', 'Platformer'], score: { label: 'Steam', value: '96%' }, byline: 'Hazelight', details: { time_to_beat: { rushed: 11, normal: 14, full: 18, players: 55 } } }, owned: true, progress: 'wanted', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Perfect Days', year: 2023, genres: ['Drama'], score: { label: 'IMDb', value: '7.9' } }, owned: false, progress: 'wanted', favourite: false, priority: 'low', plex: 'missing' },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Shōgun', year: 2024, genres: ['Drama', 'History'], score: { label: 'IMDb', value: '8.6' } }, owned: false, progress: 'completed', verdict: 'liked', favourite: true, plex: 'available' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Baldur’s Gate 3', year: 2023, genres: ['RPG', 'Co-op'], score: { label: 'Steam', value: '96%' }, byline: 'Larian Studios', details: { time_to_beat: { rushed: 60, normal: 82, full: 140, players: 30 } } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium', price: { amount: '$47.99', discountPct: 20 } },
  { id: id(), title: { id: id(), mediaType: 'book', title: 'Tomorrow, and Tomorrow, and Tomorrow', year: 2022, genres: ['Literary'], score: { label: 'Hardcover', value: '4.2' }, byline: 'Gabrielle Zevin' }, owned: false, progress: 'wanted', favourite: false, priority: 'high' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'The Zone of Interest', year: 2023, genres: ['Drama', 'History'], score: { label: 'IMDb', value: '7.4' } }, owned: false, progress: 'completed', verdict: 'disliked', favourite: false, plex: 'available' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Outer Wilds', year: 2019, genres: ['Adventure', 'Puzzle'], score: { label: 'Steam', value: '95%' }, byline: 'Mobius Digital', details: { time_to_beat: { rushed: 15, normal: 22, full: 30, players: 25 } } }, owned: false, progress: 'wanted', favourite: false, priority: 'low', price: { amount: '$9.99', discountPct: 60 } },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'The Bear', year: 2022, genres: ['Comedy', 'Drama'], score: { label: 'IMDb', value: '8.5' } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium', plex: 'missing' },
  // Upcoming (made-up titles), for the Waitlist and Calendar.
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Starfall Protocol', genres: ['Sci-Fi', 'Thriller'], releaseDate: inDays(3), details: { status: 'Post Production' } }, owned: false, progress: 'wanted', favourite: false, priority: 'high' },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Low Orbit', year: 2024, genres: ['Drama', 'Sci-Fi'], releaseDate: '2024-03-01', details: { status: 'Returning Series', next_episode_to_air: { air_date: inDays(12), season_number: 3, episode_number: 1 } } }, owned: false, progress: 'completed', verdict: 'liked', favourite: false },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'The Night Ledger', year: 2025, genres: ['Crime'], releaseDate: '2025-09-01', details: { status: 'Returning Series', next_episode_to_air: { air_date: inDays(1), season_number: 2, episode_number: 6 } } }, owned: false, progress: 'in_progress', favourite: false, tvProgress: { season: 2, episode: 5 } },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Hollow Tide', genres: ['Metroidvania'], byline: 'Small Lantern', releaseDate: inDays(40), details: { status: 'Upcoming', release_precision: 'day' } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Ironvale', genres: ['Strategy'], byline: 'Northgate', releaseDate: `${nextYear}-06-30`, details: { status: 'Upcoming', release_precision: 'quarter', release_label: `Q2 ${nextYear}` } }, owned: false, progress: 'wanted', favourite: false, priority: 'low' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'The Quiet Cartographer', genres: ['Drama'], details: { status: 'In Production' } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium' },
]
