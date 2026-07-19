// V21.1: BentoGrid — mixed-size panel grid (Grafana/Metabase pattern).
// Variants: 12-col desktop, 6-col tablet, 1-col mobile. Panel sizes via `colSpan` prop.
import { Surface } from './Surface.jsx';

const SPAN_MAP = {
  // Desktop (12-col)
  'col-12': 'lg:col-span-12',
  'col-11': 'lg:col-span-11',
  'col-10': 'lg:col-span-10',
  'col-9': 'lg:col-span-9',
  'col-8': 'lg:col-span-8',
  'col-7': 'lg:col-span-7',
  'col-6': 'lg:col-span-6',
  'col-5': 'lg:col-span-5',
  'col-4': 'lg:col-span-4',
  'col-3': 'lg:col-span-3',
  // Tablet (6-col)
  'sm-6': 'sm:col-span-6',
  'sm-3': 'sm:col-span-3',
  'sm-2': 'sm:col-span-2',
  // Default: always 1
  'col-1': 'col-span-1'
};

const ROW_SPAN = {
  'row-1': 'lg:row-span-1',
  'row-2': 'lg:row-span-2',
  'row-3': 'lg:row-span-3'
};

export function BentoGrid({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 gap-3 sm:gap-4 auto-rows-min ${className}`}>
      {children}
    </div>
  );
}

export function BentoItem({ colSpan = 'col-6', rowSpan = null, variant = 'default', padding = 'p-4', className = '', children }) {
  const col = SPAN_MAP[colSpan] || SPAN_MAP['col-6'];
  const row = rowSpan ? ROW_SPAN[rowSpan] || '' : '';
  return (
    <Surface variant={variant} padding={padding} className={`${col} ${row} ${className}`}>
      {children}
    </Surface>
  );
}
