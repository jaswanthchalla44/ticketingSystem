import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import type { Dashboard } from '@/lib/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime, formatDuration } from '@/features/common/format';
import { CATEGORIES, STATUSES } from '@/lib/api/types';
import { BarList, type BarRow } from './BarList';

interface Tile {
  label: string;
  value: string;
  note?: string;
}

function StatTile({ label, value, note }: Tile) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</p>
      <p className="text-3xl font-semibold text-ink tabular-nums">{value}</p>
      {note && <p className="text-xs text-ink-2">{note}</p>}
    </div>
  );
}

function ordered(counts: Record<string, number>, order: readonly string[]): BarRow[] {
  return order.map((label) => ({ label, value: counts[label] ?? 0 }));
}

function Loading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .dashboard()
      .then(setData)
      .catch((cause: unknown) => setError(cause instanceof ApiError ? cause : new ApiError(0, 'unknown', 'The dashboard could not be loaded.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={error.message} onRetry={load} />;
  if (!data) return null;

  const responseTile: Tile = {
    label: 'Avg first response',
    value: data.avg_first_response_seconds === null ? 'None yet' : formatDuration(data.avg_first_response_seconds),
    note: data.avg_first_response_seconds === null ? 'No public replies yet' : `From ${data.first_response_sample} answered tickets`,
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-ink-2">Generated {formatDateTime(data.generated_at)}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={load} busy={loading}>
          Refresh
        </Button>
      </header>

      {data.truncated && (
        <p role="status" className="rounded-lg border border-warning/60 bg-warning/10 p-3 text-sm text-ink">
          These figures cover only the first {data.row_limit.toLocaleString()} tickets, so they may be incomplete.
        </p>
      )}

      {error && <ErrorState message={error.message} onRetry={load} />}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label="Open" value={String(data.open)} note="New, in progress or waiting" />
        <StatTile label="Resolved" value={String(data.resolved)} />
        <StatTile label="Total" value={String(data.total)} />
        <StatTile label="Unassigned" value={String(data.unassigned)} note="No one has taken them" />
        <StatTile {...responseTile} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Volume by category" description="Tickets in each category, as triage set it.">
          <BarList
            title="Volume by category"
            unit="Tickets"
            rows={[...ordered(data.by_category, CATEGORIES)].sort((a, b) => b.value - a.value)}
            emptyText="No tickets yet."
          />
        </Card>

        <Card title="By status" description="Where every ticket sits in the workflow.">
          <BarList title="Tickets by status" unit="Tickets" rows={ordered(data.by_status, STATUSES)} emptyText="No tickets yet." />
        </Card>
      </div>

      <Card title="Tickets per agent" description="Assigned tickets, and how many of those are still open. Sorted by assigned count.">
        {data.by_agent.length === 0 ? (
          <p className="text-sm text-ink-2">No one has been assigned a ticket yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <caption className="sr-only">Tickets per agent</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th scope="col" className="py-2 font-medium">Agent</th>
                  <th scope="col" className="py-2 text-right font-medium">Assigned</th>
                  <th scope="col" className="py-2 text-right font-medium">Still open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.by_agent.map((row) => (
                  <tr key={row.agent_id}>
                    <td className="py-3 text-ink">{row.agent_name}</td>
                    <td className="py-3 text-right tabular-nums text-ink">{row.assigned}</td>
                    <td className="py-3 text-right tabular-nums text-ink">{row.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
