/** Class recipes shared by components and by links that look like them. */

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'danger' | 'ghost'
export type ButtonSize = 'md' | 'sm'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-on-brand shadow-xs hover:bg-brand-800 disabled:hover:bg-brand-700',
  secondary:
    'border border-edge bg-surface text-ink shadow-xs hover:border-brand-700/30 hover:bg-brand-50 disabled:hover:border-edge disabled:hover:bg-surface',
  // The main action of each row of a list: green, but quieter than the screen's one.
  soft: 'bg-brand-100 text-brand-800 hover:bg-brand-100/70',
  danger: 'bg-danger-600 text-on-danger shadow-xs hover:bg-danger-600/90',
  ghost: 'text-brand-700 hover:bg-brand-50',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  // 44 px on a phone (touch target), 36 px from a tablet up (doc 08 - 4).
  md: 'h-11 px-4 text-sm sm:h-9',
  // Actions inside a row: quieter, still 40 px to the thumb.
  sm: 'h-10 px-3 text-[13px] sm:h-8',
}

/** Button look for <button> and for router links that act as buttons. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  className = '',
  size: ButtonSize = 'md',
) {
  return `inline-flex select-none items-center justify-center gap-1.5 text-center rounded-lg font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`
}

/** Text fields, selects and areas share one look (doc 08 - 5). */
export const controlClass =
  'w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink shadow-xs outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted/70 hover:border-muted/40 focus-visible:border-accent-500 focus-visible:ring-3 focus-visible:ring-accent-500/25 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted'

/** The white panel every screen is built from. */
export const cardClass = 'rounded-xl border border-edge bg-surface shadow-sm'
