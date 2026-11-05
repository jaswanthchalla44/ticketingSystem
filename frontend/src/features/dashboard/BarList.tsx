// Horizontal bars for one measure. One series, so one colour (categorical slot 1). Every value is also written
// out, and the table below gives the same numbers for screen readers and anyone who prefers a table.
import { useId } from 'react';

export interface BarRow {
  label: string;
  value: number;
}

interface BarListProps {
  title: string;
  rows: readonly BarRow[];
  unit: string;
  emptyText: string;
}

export function BarList({ title, rows, unit, emptyText }: BarListProps) {
  const tableId = useId();
  const max = Math.max(1, ...rows.map((row) => row.value));

  if (rows.length === 0) return <p className="text-sm text-ink-2">{emptyText}</p>;

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label={title} className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_3.5rem]">
            <span className="truncate text-ink">{row.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <span className="block h-full rounded-full bg-series-1" style={{ width: `${(row.value / max) * 100}%` }} />
            </span>
            <span className="text-right font-medium tabular-nums text-ink">{row.value}</span>
          </li>
        ))}
      </ol>
      <details className="text-sm text-ink-2" aria-describedby={tableId}>
        <summary className="cursor-pointer font-medium text-brand underline-offset-2 hover:underline">View as table</summary>
        <table id={tableId} className="mt-3 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead className="text-xs uppercase tracking-wide text-ink-2">
            <tr>
              <th scope="col" className="py-2 font-medium">Name</th>
              <th scope="col" className="py-2 text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.label}>
                <td className="py-2 text-ink">{row.label}</td>
                <td className="py-2 text-right tabular-nums text-ink">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
