import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { LABELS, normTypes, TYPES, typesLabel } from "../lib/filters";
import type { MediaType } from "../types";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";

/**
 * The one media-type picker (All · Movies · TV Shows · Games · Books), used by the toolbar and Calendar so the
 * labels and options match everywhere: the same pills at every width (they scroll sideways if they don't fit).
 *
 * Phones (below md, where the bottom bar also says Movies, TV, Games…): the pills become one "Showing: All types"
 * dropdown, so this reads as a filter on the page rather than a second set of tabs.
 */
export function TypeFilter({
  value,
  onChange,
}: {
  value: MediaType | null;
  onChange: (t: MediaType | null) => void;
}) {
  const options: { value: MediaType | null; label: string }[] = [
    { value: null, label: "All" },
    ...TYPES.map((t) => ({ value: t, label: LABELS.type[t] })),
  ];
  // When the pills overflow and scroll sideways, keep the selected one in view.
  const pills = useRef<HTMLDivElement | null>(null);
  const slide = useSlidingIndicator<HTMLDivElement>(value);
  // Stable, so React doesn't detach and re-attach it (and re-measure) on every render.
  const setPills = useCallback(
    (n: HTMLDivElement | null) => {
      pills.current = n;
      slide(n);
    },
    [slide],
  );
  useEffect(() => {
    const el = pills.current?.querySelector<HTMLElement>(
      '[aria-checked="true"]',
    );
    if (el && pills.current)
      pills.current.scrollLeft = el.offsetLeft - pills.current.offsetLeft - 8;
  }, [value]);
  return (
    <>
      {/* Phones, on every page that has it (Library included), so it looks the same everywhere. */}
      <label className="relative flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm text-fg focus-within:border-accent md:hidden">
        <ListFilter className="size-4 text-muted" aria-hidden="true" />
        <span>
          <span className="text-muted">Showing:</span>{" "}
          {value ? LABELS.type[value] : "All types"}
        </span>
        <ChevronDown className="size-4 text-muted" aria-hidden="true" />
        {/* The real control: invisible over the pill, so phones get their native picker. */}
        <select
          aria-label="Show only"
          value={value ?? ""}
          onChange={(e) =>
            onChange((e.target.value || null) as MediaType | null)
          }
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {options.map((o) => (
            <option key={o.label} value={o.value ?? ""}>
              {o.value ? o.label : "All types"}
            </option>
          ))}
        </select>
      </label>
      <div
        ref={setPills}
        role="radiogroup"
        aria-label="Media type"
        className="no-scrollbar relative hidden min-w-0 gap-1 overflow-x-auto overflow-y-hidden md:flex"
      >
        {/* The quiet raised selection used by the app's other segmented controls; lemon is for actions. */}
        <span
          aria-hidden="true"
          className="slide-ind rounded-full bg-raised shadow-[inset_0_0_0_1px_var(--color-line)]"
        />
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={clsx(
              "hit relative h-9 shrink-0 rounded-full px-3 text-xs whitespace-nowrap transition-colors sm:h-7",
              value === o.value
                ? "font-medium text-fg"
                : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Any combination of types (Home and Library: "Games", or "Games and movies"). Desktop: an All chip and one chip
 * per type that toggles on and off. Phones: the same "Showing:" pill as elsewhere, opening a short checklist.
 */
export function TypesFilter({
  value,
  onChange,
}: {
  value: MediaType[];
  onChange: (ts: MediaType[]) => void;
}) {
  const toggle = (t: MediaType) =>
    onChange(
      normTypes(
        value.includes(t) ? value.filter((x) => x !== t) : [...value, t],
      ),
    );
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) =>
      !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const chip = (on: boolean) =>
    clsx(
      "hit h-9 shrink-0 rounded-full px-3 text-xs whitespace-nowrap transition-colors sm:h-7",
      on
        ? "bg-raised font-medium text-fg shadow-[inset_0_0_0_1px_var(--color-line)]"
        : "text-muted hover:text-fg",
    );
  return (
    <>
      <div ref={box} className="relative md:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          className="flex h-11 max-w-[60vw] shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm text-fg aria-expanded:border-accent"
        >
          <ListFilter
            className="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
          <span className="truncate">
            <span className="text-muted">Showing:</span>{" "}
            {typesLabel(value) ?? "All types"}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
        </button>
        {open && (
          <div
            role="group"
            aria-label="Show these types"
            className="absolute top-full left-0 z-30 mt-2 w-56 rounded-xl border border-line bg-raised p-1 shadow-2xl shadow-black/40"
          >
            <button
              type="button"
              aria-pressed={!value.length}
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-fg hover:bg-surface"
            >
              <Check
                className={clsx(
                  "size-4 text-accent-ink",
                  value.length && "invisible",
                )}
                aria-hidden="true"
              />{" "}
              All types
            </button>
            {TYPES.map((t) => (
              <label
                key={t}
                className="flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-fg hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={value.includes(t)}
                  onChange={() => toggle(t)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                {LABELS.type[t]}
              </label>
            ))}
          </div>
        )}
      </div>
      <div
        role="group"
        aria-label="Media types"
        className="no-scrollbar hidden min-w-0 gap-1 overflow-x-auto md:flex"
      >
        <button
          type="button"
          aria-pressed={!value.length}
          onClick={() => onChange([])}
          className={chip(!value.length)}
        >
          All
        </button>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={value.includes(t)}
            onClick={() => toggle(t)}
            title={
              value.includes(t)
                ? `Stop showing ${LABELS.type[t].toLowerCase()}`
                : `Also show ${LABELS.type[t].toLowerCase()}`
            }
            className={chip(value.includes(t))}
          >
            {LABELS.type[t]}
          </button>
        ))}
      </div>
    </>
  );
}
