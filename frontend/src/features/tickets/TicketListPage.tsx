// A customer's own tickets. The API limits the list to them, so there are no filters here.
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { buttonClasses } from '@/components/ui/styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { formatRelative } from '@/features/common/format';
import type { Ticket } from '@/lib/api/types';
import { PriorityBadge, StatusBadge, TriageBadge } from './TicketBadges';
import { usePagedTickets } from './usePagedTickets';

function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <li>
      <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand/60">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-ink">
            <Link to={`/tickets/${ticket.id}`} className="break-words underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand">
              {ticket.title}
            </Link>
          </h3>
          <StatusBadge status={ticket.status} />
        </div>
        {ticket.summary && <p className="text-sm text-ink-2">{ticket.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>{ticket.category}</span>
          <span aria-hidden="true">·</span>
          <PriorityBadge priority={ticket.priority} />
          <TriageBadge ticket={ticket} showReason={false} />
          <span className="ml-auto text-xs">Updated {formatRelative(ticket.updated_at)}</span>
        </div>
      </article>
    </li>
  );
}

export function TicketListPage() {
  const tickets = usePagedTickets({}, { pageSize: 25 });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My tickets</h1>
          <p className="text-sm text-ink-2">Everything you have asked us, and where it stands.</p>
        </div>
        <Link to="/tickets/new" className={buttonClasses('primary')}>
          New ticket
        </Link>
      </header>

      {tickets.state === 'loading' && <SkeletonRows rows={3} label="Loading your tickets" />}

      {tickets.state === 'error' && (
        <ErrorState message={tickets.error?.message ?? 'Your tickets could not be loaded.'} onRetry={tickets.reload} />
      )}

      {tickets.state === 'ready' && tickets.items.length === 0 && (
        <EmptyState
          title="No tickets yet"
          description="When something is not working, tell us what happened. We will sort it and keep you posted here."
          action={
            <Link to="/tickets/new" className={buttonClasses('primary')}>
              Report a problem
            </Link>
          }
        />
      )}

      {tickets.state === 'ready' && tickets.items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3" aria-label="Your tickets">
            {tickets.items.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </ul>
          {tickets.hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" busy={tickets.loadingMore} onClick={tickets.loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
