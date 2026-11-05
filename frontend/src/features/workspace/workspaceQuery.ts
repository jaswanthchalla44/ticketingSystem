// Workspace filters live in the URL, so a refresh or a shared link keeps the same view.
import { parseTimestamp } from '@/features/common/format';
import { CATEGORIES, PRIORITIES, STATUSES, type Category, type Priority, type Status, type Ticket, type TicketQuery } from '@/lib/api/types';

export const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'created_desc', label: 'Newest first' },
  { value: 'created_asc', label: 'Oldest first' },
  { value: 'priority_desc', label: 'Highest priority' },
] as const;
export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

export interface WorkspaceFilters {
  q: string;
  status?: Status;
  priority?: Priority;
  category?: Category;
  assignee?: string;
  mine: boolean;
  sort: SortValue;
}

function pick<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((candidate) => candidate === value);
}

export function parseWorkspaceFilters(params: URLSearchParams): WorkspaceFilters {
  const sort = SORT_OPTIONS.find((option) => option.value === params.get('sort'))?.value ?? 'updated_desc';
  return {
    q: (params.get('q') ?? '').slice(0, 200),
    status: pick(STATUSES, params.get('status')),
    priority: pick(PRIORITIES, params.get('priority')),
    category: pick(CATEGORIES, params.get('category')),
    assignee: params.get('assignee') ?? undefined,
    mine: params.get('mine') === 'true',
    sort,
  };
}

export function toTicketQuery(filters: WorkspaceFilters): TicketQuery {
  return {
    q: filters.q.trim() || undefined,
    status: filters.status,
    priority: filters.priority,
    category: filters.category,
    assignee: filters.mine ? undefined : filters.assignee,
    mine: filters.mine || undefined,
  };
}

export function toSearchParams(filters: WorkspaceFilters, view?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.category) params.set('category', filters.category);
  if (filters.assignee && !filters.mine) params.set('assignee', filters.assignee);
  if (filters.mine) params.set('mine', 'true');
  if (filters.sort !== 'updated_desc') params.set('sort', filters.sort);
  return params;
}

const PRIORITY_RANK: Record<Priority, number> = { Urgent: 3, High: 2, Medium: 1, Low: 0 };

/** Sorts the tickets already loaded. The API has no sort parameter, so this covers loaded rows only. */
export function sortTickets(tickets: readonly Ticket[], sort: SortValue): Ticket[] {
  const copy = [...tickets];
  const time = (iso: string): number => parseTimestamp(iso)?.getTime() ?? 0;
  const byTime = (a: string, b: string) => time(a) - time(b);
  switch (sort) {
    case 'updated_desc':
      return copy.sort((a, b) => byTime(b.updated_at, a.updated_at));
    case 'created_desc':
      return copy.sort((a, b) => byTime(b.created_at, a.created_at));
    case 'created_asc':
      return copy.sort((a, b) => byTime(a.created_at, b.created_at));
    case 'priority_desc':
      return copy.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || byTime(b.created_at, a.created_at));
  }
}
