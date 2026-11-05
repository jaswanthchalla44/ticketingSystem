import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, description, actions, children, className = '' }: CardProps) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
