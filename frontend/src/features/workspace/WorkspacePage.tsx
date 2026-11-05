import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api/endpoints';
import type { Agent, TicketQuery } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { usePagedTickets } from '@/features/tickets/usePagedTickets';
import { KanbanBoard } from './KanbanBoard';
import { TicketTable } from './TicketTable';
import { WorkspaceFilterBar } from './WorkspaceFilters';
import { parseWorkspaceFilters, sortTickets, toSearchParams, toTicketQuery, type WorkspaceFilters } from './workspaceQuery';

type View = 'list' | 'board';

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
];

function ListView({ query, filters, onClear }: { query: TicketQuery; filters: WorkspaceFilters; onClear: () => void }) {
  const list = usePagedTickets(query, { pageSize: 25 });
  const sorted = useMemo(() => sortTickets(list.items, filters.sort), [list.items, filters.sort]);

  if (list.state === 'loading') return <SkeletonRows rows={5} label="Loading tickets" />;
  if (list.state === 'error') return <ErrorState message={list.error?.message ?? 'Tickets could not be loaded.'} onRetry={list.reload} />;
  if (list.items.length === 0) {
    return (
      <EmptyState
        title="No tickets match these filters"
        description="Try another search, or clear the filters. New requests appear here as soon as they arrive."
        action={<Button variant="secondary" onClick={onClear}>Clear filters</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-2">Sorted within the tickets loaded so far. Load more to see older ones.</p>
      <TicketTable tickets={sorted} />
      {list.hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" busy={list.loadingMore} onClick={list.loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export function WorkspacePage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseWorkspaceFilters(params), [params]);
  const view: View = params.get('view') === 'board' ? 'board' : 'list';
  const [agents, setAgents] = useState<Agent[]>([]);
  const query = useMemo(() => toTicketQuery(filters), [filters]);

  useEffect(() => {
    api
      .listAgents()
      .then((response) => setAgents(response.items))
      .catch(() => toast.notify({ tone: 'error', title: 'Assignee filter unavailable', description: 'The staff list could not be loaded.' }));
  }, [toast]);

  const update = (next: WorkspaceFilters) => setParams(toSearchParams(next, view === 'board' ? 'board' : undefined), { replace: true });
  const clear = () => setParams(view === 'board' ? new URLSearchParams({ view: 'board' }) : new URLSearchParams(), { replace: true });
  const switchView = (next: View) => setParams(toSearchParams(filters, next === 'board' ? 'board' : undefined), { replace: true });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Workspace</h1>
          <p className="text-sm text-ink-2">Every ticket, filtered and ready to work.</p>
        </div>
        <div role="group" aria-label="View" className="inline-flex rounded-lg border border-line bg-surface p-1">
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => switchView(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand ${
                view === option.value ? 'bg-brand text-brand-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <WorkspaceFilterBar filters={filters} agents={agents} showStatus={view === 'list'} onChange={update} onClear={clear} />

      {view === 'list' ? (
        <ListView query={query} filters={filters} onClear={clear} />
      ) : (
        <KanbanBoard query={query} />
      )}
    </div>
  );
}
