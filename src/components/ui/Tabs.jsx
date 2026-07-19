// V21.1: Tabs — accessible tab switcher with full ARIA + keyboard nav.
// Implements WAI-ARIA Authoring Practices:
//   - role=tablist/tab/tabpanel with aria-selected/aria-controls
//   - Roving tabindex (only the active tab is in the tab order)
//   - Arrow Left/Right moves focus between tabs
//   - Home/End jumps to first/last tab
//   - Enter/Space activates the focused tab
import { useRef, useId } from 'react';

export function Tabs({ value, onChange, items, className = '' }) {
  const id = useId();
  const tabRefs = useRef(new Map());

  const focusTab = (val) => {
    const el = tabRefs.current.get(val);
    if (el) el.focus();
  };

  const handleKeyDown = (e, idx) => {
    const count = items.length;
    let nextIdx = null;
    switch (e.key) {
      case 'ArrowRight':
        nextIdx = (idx + 1) % count;
        break;
      case 'ArrowLeft':
        nextIdx = (idx - 1 + count) % count;
        break;
      case 'Home':
        nextIdx = 0;
        break;
      case 'End':
        nextIdx = count - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onChange(items[idx].value);
        return;
      default:
        return;
    }
    e.preventDefault();
    const nextItem = items[nextIdx];
    onChange(nextItem.value);
    focusTab(nextItem.value);
  };

  return (
    <div className={`flex gap-1 border-b border-border-subtle overflow-x-auto ${className}`} role="tablist" aria-orientation="horizontal">
      {items.map((item, idx) => {
        const Icon = item.icon;
        const isActive = value === item.value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) tabRefs.current.set(item.value, el);
              else tabRefs.current.delete(item.value);
            }}
            id={`${id}-tab-${item.value}`}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            aria-controls={`${id}-panel-${item.value}`}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap
              border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary
              ${isActive
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
              }
            `}
          >
            {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
            <span>{item.label}</span>
            {item.badge != null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${
                isActive ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-text-secondary'
              }`} aria-label={`${item.badge} items`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
