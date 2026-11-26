/**
 * A poster's width in a row. Phones: two and a half across (the row's width less two 0.75rem gaps, over 2.5), so the
 * third poster always shows half of itself at the edge as the cue that the row scrolls, as streaming apps do, with
 * room for the art; capped at 11rem on large phones. Wider screens keep their fixed sizes.
 * (The row's right padding is in view too, hence 100% less only 0.5rem.)
 */
export const POSTER_W = 'w-[calc((100%-0.5rem)/2.5)] max-w-44 shrink-0 snap-start sm:w-36 sm:max-w-none lg:w-40'
