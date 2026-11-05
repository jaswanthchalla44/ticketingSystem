// Kanban rules. Dropping a card or picking a status both go through planStatusMove, so they behave the same.
import { STATUSES, type Status, type Ticket } from '@/lib/api/types';

export const KANBAN_COLUMNS: readonly Status[] = STATUSES;

export function groupByStatus(tickets: readonly Ticket[]): Record<Status, Ticket[]> {
  const groups: Record<Status, Ticket[]> = { New: [], 'In Progress': [], Waiting: [], Resolved: [] };
  for (const ticket of tickets) groups[ticket.status].push(ticket);
  return groups;
}

export type StatusMove = { kind: 'unchanged' } | { kind: 'move'; from: Status; to: Status };

export function planStatusMove(ticket: Pick<Ticket, 'status'>, target: Status): StatusMove {
  if (ticket.status === target) return { kind: 'unchanged' };
  return { kind: 'move', from: ticket.status, to: target };
}

/** The optimistic board state after a move. The caller keeps the previous list to roll back on failure. */
export function applyStatusMove(tickets: readonly Ticket[], ticketId: string, target: Status): Ticket[] {
  return tickets.map((ticket) => (ticket.id === ticketId ? { ...ticket, status: target } : ticket));
}

export function isKanbanColumn(value: string): value is Status {
  return (KANBAN_COLUMNS as readonly string[]).includes(value);
}
