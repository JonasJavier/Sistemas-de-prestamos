/** Class recipes shared by components and by links that look like them. */

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-700 text-on-brand hover:bg-brand-800',
  secondary: 'border border-edge bg-surface text-ink hover:bg-brand-100',
  danger: 'bg-danger-600 text-white hover:bg-danger-600/90',
}

/** Button look for <button> and for router links that act as buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', className = '') {
  return `inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60 sm:h-9 ${BUTTON_VARIANTS[variant]} ${className}`
}
