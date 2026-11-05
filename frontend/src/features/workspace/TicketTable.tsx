import { Link } from 'react-router-dom';
import { formatRelative } from '@/features/common/format';
import { PriorityBadge, StatusBadge, TriageBadge } from '@/features/tickets/TicketBadges';
import type { Ticket } from '@/lib/api/types';

export function TicketTable({ tickets }: { tickets: readonly Ticket[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Tickets matching the current filters</caption>
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-2">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Ticket</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Priority</th>
            <th scope="col" className="px-4 py-3 font-medium">Assignee</th>
            <th scope="col" className="px-4 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="align-top hover:bg-page/60">
              <td className="px-4 py-3">
                <Link to={`/tickets/${ticket.id}`} className="font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand">
                  {ticket.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                  <span>{ticket.category}</span>
                  <TriageBadge ticket={ticket} showReason />
                </div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={ticket.status} />
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td className="px-4 py-3 text-ink-2">{ticket.assignee_name ?? 'Unassigned'}</td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatRelative(ticket.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
