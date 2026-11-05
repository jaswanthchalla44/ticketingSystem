import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="max-w-md text-sm text-ink-2">{description}</p>
      {action}
    </div>
  );
}
