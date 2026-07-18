// ThemeToggle — 2 options: Dark / Light.
// (System option removed; we default to dark to keep behavior predictable.)
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.js';

const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon }
];

export default function ThemeToggle() {
  const { theme, set } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-1 p-1 rounded-full bg-bg-tertiary border border-border-subtle"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => set(value)}
            className={`p-1.5 rounded-full transition-colors ${active ? 'bg-accent-primary text-white' : 'text-text-muted hover:text-text-primary'}`}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}
