// Class strings shared by buttons, links that look like buttons, and badges.

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors motion-reduce:transition-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  secondary: 'border border-line bg-surface text-ink hover:bg-page',
  ghost: 'text-ink-2 hover:bg-page hover:text-ink',
  danger: 'bg-critical text-white hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm sm:text-base',
};

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md'): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export const FIELD_CONTROL =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-3 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-60';

export type BadgeTone = 'neutral' | 'brand' | 'good' | 'warning' | 'serious' | 'critical';

export const BADGE_DOT: Record<BadgeTone, string> = {
  neutral: 'bg-ink-3',
  brand: 'bg-brand',
  good: 'bg-good',
  warning: 'bg-warning',
  serious: 'bg-serious',
  critical: 'bg-critical',
};
