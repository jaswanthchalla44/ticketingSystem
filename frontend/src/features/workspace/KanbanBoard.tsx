import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { STATUSES, type Status, type Ticket, type TicketQuery } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { PriorityBadge, TriageBadge } from '@/features/tickets/TicketBadges';
import { usePagedTickets } from '@/features/tickets/usePagedTickets';
import { FIELD_CONTROL } from '@/components/ui/styles';
import { formatRelative } from '@/features/common/format';
import { groupByStatus, isKanbanColumn, KANBAN_COLUMNS, planStatusMove } from './kanban';

const BOARD_PAGE_SIZE = 100;
const BOARD_MAX_PAGES = 5;
const DRAG_TYPE = 'application/x-helpdesk-ticket';

interface KanbanBoardProps {
  query: TicketQuery;
}

export function KanbanBoard({ query }: KanbanBoardProps) {
  const toast = useToast();
  const board = usePagedTickets(query, { pageSize: BOARD_PAGE_SIZE, maxPages: BOARD_MAX_PAGES });
  const [dragging, setDragging] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  const groups = groupByStatus(board.items);

  // Optimistic move. The card changes at once; a failed save puts it back and says why.
  async function move(ticketId: string, target: Status) {
    const ticket = board.items.find((item) => item.id === ticketId);
    if (!ticket) return;
    const plan = planStatusMove(ticket, target);
    if (plan.kind === 'unchanged') return;
    board.patchItem(ticketId, { status: target });
    try {
      await api.updateTicket(ticketId, { status: target });
      toast.notify({ tone: 'success', title: `Moved to ${target}` });
    } catch (cause) {
      board.patchItem(ticketId, { status: ticket.status });
      toast.notify({
        tone: 'error',
        title: 'The ticket did not move',
        description: cause instanceof ApiError ? cause.message : 'Try again.',
      });
    }
  }

  function onDragStart(event: DragEvent<HTMLElement>, ticket: Ticket) {
    event.dataTransfer.setData(DRAG_TYPE, ticket.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(ticket.id);
  }

  function onDrop(event: DragEvent<HTMLElement>, target: Status) {
    event.preventDefault();
    const ticketId = event.dataTransfer.getData(DRAG_TYPE);
    setDragging(null);
    setOverColumn(null);
    if (ticketId) void move(ticketId, target);
  }

  if (board.state === 'loading') {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading board">
        {KANBAN_COLUMNS.map((column) => (
          <Skeleton key={column} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (board.state === 'error') {
    return <ErrorState message={board.error?.message ?? 'The board could not be loaded.'} onRetry={board.reload} />;
  }

  if (board.items.length === 0) {
    return <EmptyState title="Nothing to work on here" description="No tickets match these filters. Clear them to see the whole board." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {board.capped && (
        <p className="text-sm text-ink-2">
          Showing the first {BOARD_PAGE_SIZE * BOARD_MAX_PAGES} matching tickets. Narrow the filters to see the rest.
        </p>
      )}
      <p className="text-xs text-ink-2">Drag a card to another column, or use the Status menu on the card.</p>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
        {KANBAN_COLUMNS.map((column) => (
          <section
            key={column}
            aria-labelledby={`column-${column.replace(/\s+/g, '-')}`}
            onDragOver={(event) => {
              if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
              event.preventDefault();
              setOverColumn(column);
            }}
            onDragLeave={() => setOverColumn((current) => (current === column ? null : current))}
            onDrop={(event) => onDrop(event, column)}
            className={`flex w-72 shrink-0 flex-col gap-3 rounded-xl border p-3 transition-colors md:w-auto ${
              overColumn === column ? 'border-brand bg-brand/10' : 'border-line bg-page/60'
            }`}
          >
            <header className="flex items-center justify-between px-1">
              <h2 id={`column-${column.replace(/\s+/g, '-')}`} className="text-sm font-semibold text-ink">
                {column}
              </h2>
              <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink-2">{groups[column].length}</span>
            </header>
            <ul className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto pr-1">
              {groups[column].map((ticket) => (
                <li key={ticket.id}>
                  <article
                    draggable
                    onDragStart={(event) => onDragStart(event, ticket)}
                    onDragEnd={() => setDragging(null)}
                    className={`flex cursor-grab flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm active:cursor-grabbing ${
                      dragging === ticket.id ? 'opacity-50' : ''
                    }`}
                  >
                    <Link to={`/tickets/${ticket.id}`} className="text-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand">
                      {ticket.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={ticket.priority} />
                      <TriageBadge ticket={ticket} showReason />
                    </div>
                    <p className="text-xs text-ink-2">
                      {ticket.category} · {ticket.assignee_name ?? 'Unassigned'} · {formatRelative(ticket.updated_at)}
                    </p>
                    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
                      Status for {ticket.title}
                      <select
                        className={`${FIELD_CONTROL} py-1.5 text-sm`}
                        value={ticket.status}
                        onChange={(event) => {
                          const next = event.target.value;
                          if (isKanbanColumn(next)) void move(ticket.id, next);
                        }}
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                  </article>
                </li>
              ))}
              {groups[column].length === 0 && <li className="px-1 py-4 text-center text-xs text-ink-2">No tickets</li>}
            </ul>
          </section>
        ))}
      </div>
      {board.hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={board.loadMore} busy={board.loadingMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
