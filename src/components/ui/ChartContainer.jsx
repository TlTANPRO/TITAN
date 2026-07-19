// V21: ChartContainer — recharts theme wrapper (consistent tooltip, axis, grid).
import { ResponsiveContainer } from 'recharts';
import { useEffect, useState } from 'react';

// V24.2: oklch fallbacks (used only if CSS var read returns empty)
function useChartColors() {
  const [colors, setColors] = useState({
    grid: 'oklch(0.25 0.005 280)',
    text: 'oklch(0.75 0.005 280)',
    bg: 'oklch(0.18 0 0)',
    border: 'oklch(0.40 0.005 280)',
    primary: 'oklch(0.65 0.20 250)',
    palette: [
      'oklch(0.65 0.20 250)',
      'oklch(0.65 0.16 160)',
      'oklch(0.75 0.16 75)',
      'oklch(0.65 0.22 350)',
      'oklch(0.58 0.22 280)',
      'oklch(0.65 0.16 200)'
    ]
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = getComputedStyle(document.documentElement);
    setColors({
      grid: root.getPropertyValue('--border-subtle').trim() || 'oklch(0.25 0.005 280)',
      text: root.getPropertyValue('--text-secondary').trim() || 'oklch(0.75 0.005 280)',
      bg: root.getPropertyValue('--bg-surface').trim() || 'oklch(0.18 0 0)',
      border: root.getPropertyValue('--border-default').trim() || 'oklch(0.40 0.005 280)',
      primary: root.getPropertyValue('--accent-primary').trim() || 'oklch(0.65 0.20 250)',
      palette: [1, 2, 3, 4, 5, 6].map((i) =>
        root.getPropertyValue(`--chart-${i}`).trim() || 'oklch(0.65 0.20 250)'
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
    return {
      grid: 'oklch(0.25 0.005 280)',
      text: 'oklch(0.75 0.005 280)',
      bg: 'oklch(0.18 0 0)',
      primary: 'oklch(0.65 0.20 250)'
    };
  }
  const root = getComputedStyle(document.documentElement);
  return {
    grid: root.getPropertyValue('--border-subtle').trim() || 'oklch(0.25 0.005 280)',
    text: root.getPropertyValue('--text-secondary').trim() || 'oklch(0.75 0.005 280)',
    bg: root.getPropertyValue('--bg-surface').trim() || 'oklch(0.18 0 0)',
    primary: root.getPropertyValue('--accent-primary').trim() || 'oklch(0.65 0.20 250)'
  };
}
