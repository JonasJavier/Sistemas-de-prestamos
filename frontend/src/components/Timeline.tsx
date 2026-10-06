import type { DomainEvent } from '../api/origination'
import { moment } from '../lib/format'

/** Business facts in order (doc 06 - section 9: «Cronologías»). */
export function Timeline({ events }: { events: DomainEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-muted">Sin hechos registrados.</p>
  return (
    <ol className="space-y-3 border-l-2 border-edge pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-700" />
          <div className="text-sm">{event.summary}</div>
          <div className="text-[12px] text-muted">
            {moment(event.created_at)}
            {event.actor_name ? ` · ${event.actor_name}` : ''}
          </div>
        </li>
      ))}
    </ol>
  )
}
