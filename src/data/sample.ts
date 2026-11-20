// SAMPLE DATA ONLY — lets the UI shell be reviewed before any API is connected.
// Delete once real data flows from Supabase. No cover images: cards render a placeholder.
import type { UserItem } from '../types'

let n = 0
const id = () => `sample-${++n}`

export const sampleItems: UserItem[] = [
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Severance', year: 2022, genres: ['Drama', 'Sci-Fi'], score: { label: 'IMDb', value: '8.7' } }, owned: false, progress: 'in_progress', favourite: true, priority: 'high', tvProgress: { season: 2, episode: 4 }, plex: 'available' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Dune: Part Two', year: 2024, genres: ['Sci-Fi', 'Adventure'], score: { label: 'IMDb', value: '8.5' } }, owned: false, progress: 'wanted', favourite: false, priority: 'high', plex: 'requested' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Hades II', year: 2025, genres: ['Roguelike', 'Action'], score: { label: 'Steam', value: '95%' }, byline: 'Supergiant Games' }, owned: false, progress: 'wanted', favourite: false, priority: 'high', price: { amount: '$22.49', discountPct: 25 } },
  { id: id(), title: { id: id(), mediaType: 'book', title: 'Project Hail Mary', year: 2021, genres: ['Sci-Fi'], score: { label: 'Hardcover', value: '4.5' }, byline: 'Andy Weir' }, owned: true, progress: 'in_progress', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'It Takes Two', year: 2021, genres: ['Co-op', 'Platformer'], score: { label: 'Steam', value: '96%' }, byline: 'Hazelight' }, owned: true, progress: 'wanted', favourite: false, priority: 'medium' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'Perfect Days', year: 2023, genres: ['Drama'], score: { label: 'IMDb', value: '7.9' } }, owned: false, progress: 'wanted', favourite: false, priority: 'low', plex: 'missing' },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'Shōgun', year: 2024, genres: ['Drama', 'History'], score: { label: 'IMDb', value: '8.6' } }, owned: false, progress: 'completed', verdict: 'liked', favourite: true, plex: 'available' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Baldur’s Gate 3', year: 2023, genres: ['RPG', 'Co-op'], score: { label: 'Steam', value: '96%' }, byline: 'Larian Studios' }, owned: false, progress: 'wanted', favourite: false, priority: 'medium', price: { amount: '$47.99', discountPct: 20 } },
  { id: id(), title: { id: id(), mediaType: 'book', title: 'Tomorrow, and Tomorrow, and Tomorrow', year: 2022, genres: ['Literary'], score: { label: 'Hardcover', value: '4.2' }, byline: 'Gabrielle Zevin' }, owned: false, progress: 'wanted', favourite: false, priority: 'high' },
  { id: id(), title: { id: id(), mediaType: 'movie', title: 'The Zone of Interest', year: 2023, genres: ['Drama', 'History'], score: { label: 'IMDb', value: '7.4' } }, owned: false, progress: 'completed', verdict: 'disliked', favourite: false, plex: 'available' },
  { id: id(), title: { id: id(), mediaType: 'game', title: 'Outer Wilds', year: 2019, genres: ['Adventure', 'Puzzle'], score: { label: 'Steam', value: '95%' }, byline: 'Mobius Digital' }, owned: false, progress: 'wanted', favourite: false, priority: 'low', price: { amount: '$9.99', discountPct: 60 } },
  { id: id(), title: { id: id(), mediaType: 'tv', title: 'The Bear', year: 2022, genres: ['Comedy', 'Drama'], score: { label: 'IMDb', value: '8.5' } }, owned: false, progress: 'wanted', favourite: false, priority: 'medium', plex: 'missing' },
]
