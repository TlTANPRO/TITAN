// V21: Skeleton primitives — unified loading placeholders.
import { Surface } from './Surface.jsx';

export function Skeleton({ className = '', ...rest }) {
  return <div className={`skeleton-shimmer rounded ${className}`} {...rest} />;
}

export function SkeletonText({ width = 'w-full', className = '' }) {
  return <Skeleton className={`h-3 ${width} ${className}`} />;
}

export function SkeletonPanel({ height = 160, className = '' }) {
  return <Surface className={`h-[${height}px] ${className}`} />;
}
