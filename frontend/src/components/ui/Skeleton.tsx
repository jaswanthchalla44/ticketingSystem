interface SkeletonProps {
  className?: string;
  label?: string;
}

/** Placeholder block. Announced once by the parent via `label`, not once per block. */
export function Skeleton({ className = 'h-4 w-full', label }: SkeletonProps) {
  return <div aria-hidden={label ? undefined : true} className={`animate-pulse rounded-md bg-line motion-reduce:animate-none ${className}`} />;
}

export function SkeletonRows({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
