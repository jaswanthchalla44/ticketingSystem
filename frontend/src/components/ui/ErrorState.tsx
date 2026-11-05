import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-critical/40 bg-critical/10 p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="text-sm text-ink-2">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
