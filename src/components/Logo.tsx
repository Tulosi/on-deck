export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <rect width="512" height="512" rx="112" className="fill-raised" />
      <rect x="136" y="300" width="240" height="56" rx="16" className="fill-line" />
      <rect x="120" y="228" width="272" height="56" rx="16" className="fill-faint" />
      <rect x="104" y="156" width="304" height="56" rx="16" className="fill-accent" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo />
      <span className="text-[17px] font-semibold tracking-tight text-fg" translate="no">
        On Deck
      </span>
    </span>
  )
}
