import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FIELD_CONTROL } from '@/components/ui/styles';
import { CATEGORIES, PRIORITIES, STATUSES, type Agent } from '@/lib/api/types';
import { SORT_OPTIONS, type WorkspaceFilters } from './workspaceQuery';

const SEARCH_DEBOUNCE_MS = 300;
// On desktop the last column (Sort) is wider than the others so its label fits.
const FILTER_GRID_WITH_STATUS = 'lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(11rem,1.4fr)]';
const FILTER_GRID_WITHOUT_STATUS = 'lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(11rem,1.4fr)]';

interface Option {
  value: string;
  label: string;
}

function FilterSelect({ label, value, onChange, options, className = '' }: { label: string; value: string; onChange: (value: string) => void; options: readonly Option[]; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-xs font-medium text-ink-2 ${className}`}>
      {label}
      <select className={`${FIELD_CONTROL} py-2 text-sm`} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface WorkspaceFilterBarProps {
  filters: WorkspaceFilters;
  agents: readonly Agent[];
  /** The board shows every status as a column, so the status filter is hidden there. */
  showStatus: boolean;
  onChange: (next: WorkspaceFilters) => void;
  onClear: () => void;
}

export function WorkspaceFilterBar({ filters, agents, showStatus, onChange, onClear }: WorkspaceFilterBarProps) {
  const [search, setSearch] = useState(filters.q);

  // Wait for a pause in typing before the search reaches the URL and the API.
  useEffect(() => {
    if (search === filters.q) return;
    const timer = window.setTimeout(() => onChange({ ...filters, q: search }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, filters, onChange]);

  const active = Boolean(filters.q || filters.status || filters.priority || filters.category || filters.assignee || filters.mine);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
        Search tickets
        <input
          type="search"
          value={search}
          maxLength={200}
          placeholder="Search by ID, title or description"
          onChange={(event) => setSearch(event.target.value)}
          className={`${FIELD_CONTROL} py-2 text-sm`}
        />
      </label>
      <div className={`grid grid-cols-2 gap-3 ${showStatus ? FILTER_GRID_WITH_STATUS : FILTER_GRID_WITHOUT_STATUS}`}>
        {showStatus && (
          <FilterSelect
            label="Status"
            value={filters.status ?? ''}
            onChange={(value) => onChange({ ...filters, status: STATUSES.find((status) => status === value) })}
            options={[{ value: '', label: 'Any status' }, ...STATUSES.map((status) => ({ value: status, label: status }))]}
          />
        )}
        <FilterSelect
          label="Priority"
          value={filters.priority ?? ''}
          onChange={(value) => onChange({ ...filters, priority: PRIORITIES.find((priority) => priority === value) })}
          options={[{ value: '', label: 'Any priority' }, ...PRIORITIES.map((priority) => ({ value: priority, label: priority }))]}
        />
        <FilterSelect
          label="Category"
          value={filters.category ?? ''}
          onChange={(value) => onChange({ ...filters, category: CATEGORIES.find((category) => category === value) })}
          options={[{ value: '', label: 'Any category' }, ...CATEGORIES.map((category) => ({ value: category, label: category }))]}
        />
        <FilterSelect
          label="Assignee"
          value={filters.mine ? '' : (filters.assignee ?? '')}
          onChange={(value) => onChange({ ...filters, mine: false, assignee: value || undefined })}
          options={[{ value: '', label: 'Anyone' }, ...agents.map((agent) => ({ value: agent.user_id, label: agent.name }))]}
        />
        <label className="flex min-h-11 items-center gap-2 self-end text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={filters.mine}
            onChange={(event) => onChange({ ...filters, mine: event.target.checked, assignee: undefined })}
          />
          Assigned to me
        </label>
        <FilterSelect
          label="Sort"
          value={filters.sort}
          onChange={(value) => onChange({ ...filters, sort: SORT_OPTIONS.find((option) => option.value === value)?.value ?? 'updated_desc' })}
          options={SORT_OPTIONS}
          className="col-span-2 lg:col-span-1"
        />
      </div>
      {active && (
        <div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
