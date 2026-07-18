import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatNumber, formatPercent } from '../lib/format.js';

export default function StatCard({ label, value, delta, accent }) {
  const trend = delta != null ? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat') : null;
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-accent-success' : trend === 'down' ? 'text-accent-danger' : 'text-text-muted';

  return (
    <div className="surface p-4 flex flex-col gap-1">
      <span className="stat-label">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${accent ?? 'text-text-primary'}`}>{value}</span>
        {trend && (
          <span className={`text-xs ${trendColor} flex items-center gap-0.5`}>
            <TrendIcon className="w-3 h-3" />
            {formatPercent(Math.abs(delta), 1)}
          </span>
        )}
      </div>
    </div>
  );
}
