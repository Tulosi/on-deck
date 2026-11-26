// SAMPLE DATA: what signed-out visitors see and can try out (changes stay in the tab; see useItems).
// No cover images: cards render a placeholder. Made-up upcoming titles keep the Calendar from going stale.
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
const today = inDays(0)
/** TV seasons as the TMDB function stores them: [episode count, first air date] per season. */
const seasons = (...list: [number, string][]) =>
  list.map(([episode_count, air_date], i) => ({ season_number: i + 1, episode_count, air_date }))
/** A game's prices as the prices function stores them (USD, Steam first; no store links in the sample). */
const price = (steam: number, regular: number, low: number, official?: { shop: string; price: number }) => ({
  currency: 'USD',
  isFree: false,
  steam: { price: steam, low },
  steamRegular: regular,
  official: official ? { ...official, url: null, low: official.price } : null,
  keyshop: null,
  fetchedAt: today,
})

export const sampleItems: UserItem[] = [
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Severance', year: 2022, genres: ['Drama', 'Sci-Fi'], score: { label: 'IMDb', value: '8.7' }, details: { status: 'Returning Series', seasons: seasons([9, '2022-02-18'], [10, '2025-01-17']) } }, owned: false, progress: 'in_progress', favourite: true, priority: 'high', tvProgress: { season: 2, episode: 4 }, plex: 'available', available: true, plexSync: false },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Dune: Part Two', year: 2024, genres: ['Sci-Fi', 'Adventure'], score: { label: 'IMDb', value: '8.5' }, details: { runtime: 166 } }, owned: false, progress: 'wanted', favourite: false, priority: 'high', plex: 'requested' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Hades II', year: 2025, genres: ['Roguelike', 'Action', 'Indie', 'Fantasy', 'Hack and slash'], score: { label: 'Steam', value: '95%' }, byline: 'Supergiant Games', details: { multiplayer: { single_player: true }, time_to_beat: { rushed: 18, normal: 26, full: 60, players: 40 } } }, owned: false, progress: 'wanted', favourite: false, priority: 'high', price: { amount: '$22.49', discountPct: 25 }, gamePrice: price(22.49, 29.99, 19.99) },
  { id: id(), title: { id: id(), mediaType: 'book', title: 'Project Hail Mary', year: 2021, genres: ['Sci-Fi'], score: { label: 'Hardcover', value: '4.5' }, byline: 'Andy Weir', details: { pages: 496 } }, owned: true, progress: 'in_progress', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'It Takes Two', year: 2021, genres: ['Platformer', 'Adventure', 'Puzzle', 'Comedy'], score: { label: 'Steam', value: '96%' }, byline: 'Hazelight', details: { multiplayer: { online_coop: true, local_coop: true, split_screen: true, online_max: 2 }, time_to_beat: { rushed: 11, normal: 14, full: 18, players: 55 } } }, owned: true, progress: 'in_progress', favourite: false, priority: 'medium', steamPlaytimeMinutes: 412 },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Perfect Days', year: 2023, genres: ['Drama'], score: { label: 'IMDb', value: '7.9' }, details: { runtime: 124 } }, owned: false, progress: 'wanted', favourite: false, priority: 'low', plex: 'missing', available: false },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Shōgun', year: 2024, genres: ['Drama', 'History'], score: { label: 'IMDb', value: '8.6' }, details: { status: 'Returning Series', seasons: seasons([10, '2024-02-27']) } }, owned: false, progress: 'completed', tvProgress: { season: 1, episode: 10 }, verdict: 'liked', favourite: true, plex: 'available', available: true },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Baldur’s Gate 3', year: 2023, genres: ['RPG', 'Strategy', 'Adventure', 'Fantasy', 'Turn-based strategy'], score: { label: 'Steam', value: '96%' }, byline: 'Larian Studios', details: { multiplayer: { single_player: true, online_coop: true, local_coop: true, split_screen: true, online_max: 4 }, time_to_beat: { rushed: 60, normal: 82, full: 140, players: 30 } } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium', price: { amount: '$45.59', discountPct: 24 }, gamePrice: price(47.99, 59.99, 41.99, { shop: 'Fanatical', price: 45.59 }) },
  { id: id(), title: { id: id(), mediaType: 'book', title: 'Tomorrow, and Tomorrow, and Tomorrow', year: 2022, genres: ['Literary'], score: { label: 'Hardcover', value: '4.2' }, byline: 'Gabrielle Zevin', details: { pages: 401 } }, owned: true, progress: 'stalled', stalledAt: inDays(-20), favourite: false, priority: 'high' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'The Zone of Interest', year: 2023, genres: ['Drama', 'History'], score: { label: 'IMDb', value: '7.4' }, details: { runtime: 105 } }, owned: false, progress: 'completed', verdict: 'disliked', favourite: false, plex: 'available', available: true },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Outer Wilds', year: 2019, genres: ['Adventure', 'Puzzle', 'Indie', 'Science fiction', 'Open world', 'Mystery'], score: { label: 'Steam', value: '95%' }, byline: 'Mobius Digital', details: { multiplayer: { single_player: true }, time_to_beat: { rushed: 15, normal: 22, full: 30, players: 25 } } }, owned: false, progress: 'wanted', favourite: false, priority: 'low', price: { amount: '$9.99', discountPct: 60, atLow: true }, gamePrice: price(9.99, 24.99, 9.99) },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'The Bear', year: 2022, genres: ['Comedy', 'Drama'], score: { label: 'IMDb', value: '8.5' }, details: { status: 'Returning Series', seasons: seasons([8, '2022-06-23'], [10, '2023-06-22'], [10, '2024-06-26'], [10, '2025-06-25']) } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium', plex: 'missing', available: false },
  // Upcoming (made-up titles), for the Waitlist and Calendar.
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Starfall Protocol', genres: ['Sci-Fi', 'Thriller'], releaseDate: inDays(3), details: { status: 'Post Production' } }, owned: false, progress: 'wanted', favourite: false, priority: 'high' },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Low Orbit', year: 2024, genres: ['Drama', 'Sci-Fi'], releaseDate: '2024-03-01', details: { status: 'Returning Series', seasons: seasons([8, '2024-03-01'], [8, '2025-03-07']), next_episode_to_air: { air_date: inDays(12), season_number: 3, episode_number: 1 } } }, owned: false, progress: 'caught_up', tvProgress: { season: 2, episode: 8 }, verdict: 'liked', favourite: false },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'The Night Ledger', year: 2025, genres: ['Crime'], releaseDate: '2025-09-01', details: { status: 'Returning Series', seasons: seasons([8, '2024-09-05'], [8, inDays(-28)]), next_episode_to_air: { air_date: inDays(1), season_number: 2, episode_number: 6 } } }, owned: false, progress: 'in_progress', favourite: false, tvProgress: { season: 2, episode: 5 } },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Hollow Tide', genres: ['Metroidvania'], byline: 'Small Lantern', releaseDate: inDays(40), details: { status: 'Upcoming', release_precision: 'day' } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Ironvale', genres: ['Strategy'], byline: 'Northgate', releaseDate: `${nextYear}-06-30`, details: { status: 'Upcoming', release_precision: 'quarter', release_label: `Q2 ${nextYear}` } }, owned: false, progress: 'wanted', favourite: false, priority: 'low' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'The Quiet Cartographer', genres: ['Drama'], details: { status: 'In Production' } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium' },
  // Out in Early Access, so the sample Early Access collection isn't empty.
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Saltmarsh Keepers', year: 2026, genres: ['Simulation', 'Strategy'], score: { label: 'Steam', value: '88%' }, byline: 'Tidewright', releaseDate: inDays(-120), details: { early_access: true, multiplayer: { single_player: true, online_coop: true, online_max: 4 } } }, owned: true, progress: 'in_progress', favourite: false, priority: 'medium', steamPlaytimeMinutes: 380 },
  // Early Access games with a 1.0 date announced: one exact, one rough (the Early Access collection calls them out).
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Emberline', year: 2025, genres: ['Roguelike', 'Action'], score: { label: 'Steam', value: '91%' }, byline: 'Kiln & Co', releaseDate: inDays(-300), details: { early_access: true, release_milestones: [{ kind: 'early_access', date: inDays(-300), precision: 'day', label: null }, { kind: 'release', date: inDays(38), precision: 'day', label: null }] } }, owned: true, progress: 'caught_up', favourite: false, priority: 'high', steamPlaytimeMinutes: 1260 },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Gearwright', year: 2026, genres: ['Automation', 'Strategy'], score: { label: 'Steam', value: '84%' }, byline: 'Brassline', releaseDate: inDays(-60), details: { early_access: true, release_milestones: [{ kind: 'early_access', date: inDays(-60), precision: 'day', label: null }, { kind: 'release', date: `${nextYear}-06-30`, precision: 'quarter', label: `Q2 ${nextYear}` }] } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium' },
  // Archived (finished and put away), so the Library's Archived filter has something to show.
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Lost', year: 2004, genres: ['Drama', 'Mystery'], score: { label: 'IMDb', value: '8.3' }, details: { status: 'Ended', seasons: seasons([25, '2004-09-22'], [24, '2005-09-21'], [23, '2006-10-04'], [14, '2008-01-31'], [17, '2009-01-21'], [18, '2010-02-02']) } }, owned: false, progress: 'completed', tvProgress: { season: 6, episode: 18 }, verdict: 'liked', favourite: false, completedAt: `${inDays(-400)}T20:00:00.000Z`, archivedAt: `${inDays(-380)}T12:00:00.000Z` },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Stardew Valley', year: 2016, genres: ['Simulation', 'RPG', 'Indie'], score: { label: 'Steam', value: '98%' }, byline: 'ConcernedApe', details: { multiplayer: { single_player: true, online_coop: true, online_max: 4 }, time_to_beat: { rushed: 53, normal: 95, full: 165, players: 60 } } }, owned: true, progress: 'completed', verdict: 'liked', favourite: true, completedAt: `${inDays(-200)}T20:00:00.000Z`, archivedAt: `${inDays(-150)}T12:00:00.000Z` },
]
