export function Skeleton({ className = '' }) {
  return <div className={`skeleton-shimmer rounded ${className}`} aria-hidden="true" />;
}

export default function SkeletonCard({ height = 180, lines = 3 }) {
  return (
    <div className="surface p-5 space-y-3" style={{ minHeight: height }} aria-hidden="true">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
      {lines > 3 && <Skeleton className="h-3 w-1/2" />}
    </div>
  );
}
