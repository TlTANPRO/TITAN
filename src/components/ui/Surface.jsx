// V21: Surface — card container primitive with variant.
import { forwardRef } from 'react';

const VARIANTS = {
  default: 'bg-bg-secondary border border-border-subtle',
  raised: 'bg-bg-tertiary border border-border-subtle shadow-sm',
  inset: 'bg-bg-tertiary/40 border border-border-subtle',
  overlay: 'bg-bg-elevated border border-border-default shadow-md'
};

export const Surface = forwardRef(function Surface(
  { variant = 'default', padding = 'p-4', className = '', as: As = 'div', children, ...rest },
  ref
) {
  return (
    <As
      ref={ref}
      className={`rounded-lg ${VARIANTS[variant] ?? VARIANTS.default} ${padding} ${className}`}
      {...rest}
    >
      {children}
    </As>
  );
});
