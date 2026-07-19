// V21: Tabs — accessible tab switcher (controlled).
import { useState, useId } from 'react';

export function Tabs({ value, onChange, items, className = '' }) {
  const id = useId();
  return (
    <div className={`flex gap-1 border-b border-border-subtle overflow-x-auto ${className}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = value === item.value;
        return (
          <button
            key={item.value}
            id={`${id}-tab-${item.value}`}
            role="tab"
            aria-selected={isActive}
            aria-controls={`${id}-panel-${item.value}`}
            onClick={() => onChange(item.value)}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap
              border-b-2 transition-colors
              ${isActive
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-muted hover:text-text-primary'
              }
            `}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {item.label}
            {item.badge != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-text-muted'
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
