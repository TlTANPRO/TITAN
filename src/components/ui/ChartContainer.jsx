// V21: ChartContainer — recharts theme wrapper (consistent tooltip, axis, grid).
import { ResponsiveContainer } from 'recharts';
import { useEffect, useState } from 'react';

// Read CSS variable at runtime so chart colors adapt to theme
function useChartColors() {
  const [colors, setColors] = useState({
    grid: '#27272a',
    text: '#a1a1aa',
    bg: '#141414',
    border: '#3f3f46',
    primary: '#3b82f6',
    palette: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = getComputedStyle(document.documentElement);
    setColors({
      grid: root.getPropertyValue('--border-subtle').trim() || '#27272a',
      text: root.getPropertyValue('--text-secondary').trim() || '#a1a1aa',
      bg: root.getPropertyValue('--bg-surface').trim() || '#141414',
      border: root.getPropertyValue('--border-default').trim() || '#3f3f46',
      primary: root.getPropertyValue('--accent-primary').trim() || '#3b82f6',
      palette: [1, 2, 3, 4, 5, 6].map((i) =>
        root.getPropertyValue(`--chart-${i}`).trim() || '#3b82f6'
      )
    });
  }, []);
  return colors;
}

export function ChartContainer({ children, height = 300, className = '', onClick = null }) {
  const colors = useChartColors();

  // Inject style override for recharts elements via wrapper
  return (
    <div
      className={`w-full ${className}`}
      style={{ height: `${height}px` }}
      data-chart-bg={colors.bg}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function getChartColors() {
  if (typeof window === 'undefined') {
    return { grid: '#27272a', text: '#a1a1aa', bg: '#141414', primary: '#3b82f6' };
  }
  const root = getComputedStyle(document.documentElement);
  return {
    grid: root.getPropertyValue('--border-subtle').trim() || '#27272a',
    text: root.getPropertyValue('--text-secondary').trim() || '#a1a1aa',
    bg: root.getPropertyValue('--bg-surface').trim() || '#141414',
    primary: root.getPropertyValue('--accent-primary').trim() || '#3b82f6'
  };
}
