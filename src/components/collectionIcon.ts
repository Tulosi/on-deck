import { Clock, FlaskConical, Layers, ListFilter, Tag, type LucideIcon } from 'lucide-react'
import type { Collection } from '../lib/collections'

const BUILTIN: Record<string, LucideIcon> = {
  'default-waitlist': Clock,
  'default-early-access': FlaskConical,
  'default-deals': Tag,
}

/** Each default collection gets its own icon; your smart ones a filter (they're saved filters); hand-picked a stack. */
export function collectionIcon(c: Pick<Collection, 'id' | 'rules'>): LucideIcon {
  return BUILTIN[c.id] ?? (c.rules != null ? ListFilter : Layers)
}
