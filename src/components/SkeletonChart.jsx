import { Skeleton } from './SkeletonCard.jsx';

export default function SkeletonChart({ height = 220, className = '' }) {
  return (
    <div
      className={`surface p-5 space-y-3 ${className}`}
      style={{ minHeight: height }}
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-1/3" />
      <div className="flex items-end gap-2" style={{ height: height - 80 }}>
        {[35, 60, 42, 78, 55, 88, 66, 72, 50, 80, 60, 90].map((h, i) => (
          <div key={i} className="flex-1 skeleton-shimmer rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}
