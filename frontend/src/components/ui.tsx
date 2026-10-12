import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { Link } from '@tanstack/react-router'

import { ApiError } from '../api/client'
import {
  errorMessage,
  fractionToPercent,
  initials,
  percentToFraction,
  splitAmount,
  todayISO,
} from '../lib/format'
import {
  buttonClass,
  cardClass,
  controlClass,
  type ButtonSize,
  type ButtonVariant,
} from './classes'
import { useDarkTheme } from '../lib/theme'
import {
  AlertIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
} from './icons'

/** Base building blocks using the Cobradía tokens (doc 08). shadcn/ui
 * replaces these as screens grow; the class vocabulary stays the same. */

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, className, size)} {...props} />
}

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input className={`h-11 sm:h-[38px] ${controlClass} ${className}`} {...props} />
}

export function Field({
  label,
  error,
  hint,
  aside,
  children,
}: {
  label: string
  error?: string
  /** One line under the control saying what the value does. */
  hint?: string
  /** Something at the right of the label (a link such as «¿La olvidaste?»). */
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="block text-[13px] font-medium text-ink/85">{label}</span>
        {aside ? <span className="text-[12.5px]">{aside}</span> : null}
      </span>
      {children}
      {error ? (
        <span className="block text-[12.5px] font-medium text-danger-600">{error}</span>
      ) : hint ? (
        <span className="block text-[12px] leading-snug text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

const ALERT_TONES = {
  danger: { box: 'border-danger-600/25 bg-danger-600/[0.07] text-danger-600', icon: AlertIcon },
  warning: { box: 'border-warning-700/25 bg-warning-700/[0.07] text-warning-700', icon: AlertIcon },
  success: {
    box: 'border-success-600/25 bg-success-600/[0.07] text-success-600',
    icon: CheckCircleIcon,
  },
  info: { box: 'border-info-700/20 bg-info-700/[0.06] text-info-700', icon: InfoIcon },
}

export function Alert({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success' | 'info'
  children: ReactNode
}) {
  const { box, icon: Icon } = ALERT_TONES[tone]
  // Problems interrupt the screen reader; confirmations and hints wait their turn.
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status'
  return (
    <div
      role={role}
      className={`flex animate-fade gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${box}`}
    >
      <span className="mt-px">
        <Icon />
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    // 16 px of padding on a phone, 20 from a tablet up (decision 116).
    <div className={`${cardClass} p-4 sm:p-5 ${className}`}>{children}</div>
  )
}

export function Brand({
  className = 'text-3xl',
  tone = 'default',
}: {
  className?: string
  tone?: 'default' | 'light'
}) {
  const color = tone === 'light' ? 'text-white' : 'text-brand-700'
  return (
    <span
      className={`inline-flex items-center gap-[0.35em] font-display font-semibold tracking-tight ${color} ${className}`}
    >
      <BrandMark tone={tone} />
      <span>
        Cobrad<span className="text-gold-500">í</span>a
      </span>
    </span>
  )
}

/** The square mark of the favicon (public/favicon.svg): the «C» on forest
 * with the gold dot. On the forest sidebar the square goes translucent. */
export function BrandMark({
  tone = 'default',
  className = 'size-[1.15em]',
}: {
  tone?: 'default' | 'light'
  className?: string
}) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={`shrink-0 ${className}`}>
      <rect
        width="64"
        height="64"
        rx="16"
        className={tone === 'light' ? 'fill-white/12' : 'fill-brand-950'}
      />
      <path
        d="M42.5 22.5a13 13 0 1 0 0 19"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="45" cy="15" r="4.5" className="fill-gold-500" />
    </svg>
  )
}

/** The brand texture behind a panel (decision 111): the dot grid and the soft
 * light of the sign-in panel, on forest (the menu) or in gold on sand (the
 * home card). The container needs `relative` (and `overflow-hidden` when it
 * has rounded corners); the content sits above with `relative`. */
export function Texture({ tone }: { tone: 'forest' | 'sand' }) {
  return (
    <>
      <div aria-hidden className={`pointer-events-none absolute inset-0 texture-glow-${tone}`} />
      <div aria-hidden className={`pointer-events-none absolute inset-0 texture-grid-${tone}`} />
    </>
  )
}

/** A titled group of a screen (decision 115): the title in Sora 17 and a
 * quiet note at its right; the gold dot now marks only the eyebrows. */
export function Section({
  title,
  aside,
  children,
  className = '',
}: {
  title: string
  /** A quiet note at the right of the title (the scope of the figures). */
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-label={title} className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {aside ? <span className="text-[12.5px] text-muted">{aside}</span> : null}
      </div>
      {children}
    </section>
  )
}

const controlClasses = controlClass
/** Rates are typed as percentages and handed over as fractions (5 → 0.05).
 * Keeps its own text so «4.» survives typing; remount it (key) to reset. */
export function PercentInput({
  value,
  onChange,
  placeholder = 'Ej.: 5',
  disabled,
}: {
  value: string | null
  onChange: (fraction: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(() => fractionToPercent(value ?? ''))
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(percentToFraction(e.target.value))
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-muted">
        %
      </span>
    </div>
  )
}

/** One file, picked with a button that speaks Spanish whatever the browser's
 * language («Choose File» is not ours), and that forgets the file once the
 * screen does (after an upload). */
export function FilePicker({
  file,
  onPick,
  accept,
  label = 'Elegir archivo',
  empty = 'Ningún archivo elegido',
  disabled,
}: {
  file: File | null
  onPick: (file: File | null) => void
  accept?: string
  label?: string
  empty?: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={label}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null)
          e.target.value = '' // the same file can be picked again
        }}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {label}
      </Button>
      <span className={`min-w-0 truncate ${file ? 'text-ink' : 'text-muted'}`}>
        {file ? file.name : empty}
      </span>
    </span>
  )
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select className={`h-11 sm:h-[38px] ${controlClasses} ${className}`} {...props} />
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** A month («2026-10») picked with two selects in Spanish: `<input
 * type="month">` speaks the browser's language and is a bare text box in
 * Firefox and Safari. ``max`` («YYYY-MM») hides the months after it. */
export function MonthInput({
  value,
  onChange,
  max,
  label = 'Mes',
}: {
  value: string
  onChange: (month: string) => void
  max?: string
  label?: string
}) {
  const [year, month] = (value || todayISO().slice(0, 7)).split('-').map(Number)
  const lastYear = Number((max ?? todayISO()).slice(0, 4)) + (max ? 0 : 1)
  const lastMonth = (y: number) => (max && y === lastYear ? Number(max.slice(5, 7)) : 12)
  const firstYear = Math.min(year, lastYear - 5)
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i)
  const pick = (y: number, m: number) =>
    onChange(`${y}-${String(Math.min(m, lastMonth(y))).padStart(2, '0')}`)
  return (
    <span className="flex gap-2">
      <select
        aria-label={`${label}: mes`}
        value={month}
        onChange={(e) => pick(year, Number(e.target.value))}
        className={`h-11 min-w-0 flex-1 sm:h-9 ${controlClasses}`}
      >
        {MONTH_NAMES.slice(0, lastMonth(year)).map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label}: año`}
        value={year}
        onChange={(e) => pick(Number(e.target.value), month)}
        className={`h-11 !w-24 shrink-0 sm:h-9 ${controlClasses}`}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  )
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea rows={3} className={`py-2 ${controlClasses}`} {...props} />
}

const TONES: Record<string, string> = {
  neutral: 'bg-surface-2 text-muted',
  info: 'bg-info-100 text-info-700',
  warning: 'bg-warning-100 text-warning-700',
  success: 'bg-success-100 text-success-600',
  danger: 'bg-danger-100 text-danger-600',
  brand: 'bg-brand-100 text-brand-800',
  gold: 'bg-gold-100 text-gold-800',
}

/** A state always reads as color AND text (doc 07 - section 5): a soft tint
 * of the state, and a dot before the words when it is a status (decision 115). */
export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: string
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ${TONES[tone] ?? TONES.neutral}`}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

/** Choices side by side in one rounded box (decision 115): the filters of a
 * list with their counts, the frequency of a loan, monthly or yearly. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string
  options: readonly { value: T; label: ReactNode; count?: number | string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-surface p-[3px] shadow-xs ring-1 ring-inset ring-edge [scrollbar-width:none] ${className}`}
    >
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`press press-down flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
              on
                ? 'bg-brand-100 font-semibold text-brand-800'
                : 'font-medium text-muted hover:bg-brand-50 hover:text-ink'
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={`text-[12px] tabular-nums ${on ? 'text-brand-800/80' : 'text-muted'}`}
              >
                {typeof option.count === 'number'
                  ? option.count.toLocaleString('es-DO')
                  : option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Breadcrumb, title and ONE main action on the right (doc 07 - section 2). */
export function PageHeader({
  back,
  title,
  subtitle,
  actions,
  documentTitle,
  inline = false,
}: {
  back?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Browser tab text when the title is not plain text. */
  documentTitle?: string
  /** On a phone the (icon-sized) action stays beside the title. */
  inline?: boolean
}) {
  const tab = documentTitle ?? (typeof title === 'string' ? title : null)
  useEffect(() => {
    if (!tab) return
    document.title = `${tab} · Cobradía`
    return () => {
      document.title = 'Cobradía'
    }
  }, [tab])
  return (
    <div
      className={`flex items-end justify-between gap-x-4 gap-y-3 ${
        inline ? 'max-sm:items-start sm:flex-wrap' : 'flex-wrap'
      }`}
    >
      <div className="min-w-0 space-y-1">
        {back ? (
          <div className="text-[13px] font-medium text-muted [&_a:hover]:text-ink [&_a]:transition-colors">
            {back}
          </div>
        ) : null}
        <h1 className="text-[26px] leading-[1.15] sm:text-[30px]">{title}</h1>
        {subtitle ? <div className="text-[13.5px] text-muted">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const active = tabs.findIndex(([key]) => key === value)
  // The indicator slides from the previous tab to the chosen one (decision 112).
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  useEffect(() => {
    const tab = buttons.current[active]
    if (!tab) return
    setBar({ left: tab.offsetLeft, width: tab.offsetWidth })
  }, [active, tabs])
  // On a phone the tabs scroll sideways: the chosen one is always in sight
  // (only the strip moves, never the page).
  useEffect(() => {
    const strip = list.current
    const tab = buttons.current[active]
    if (!strip || !tab) return
    const box = strip.getBoundingClientRect()
    const own = tab.getBoundingClientRect()
    if (own.left < box.left) strip.scrollLeft -= box.left - own.left + 16
    else if (own.right > box.right) strip.scrollLeft += own.right - box.right + 16
  }, [active])
  // Arrows, Home and End move between tabs (WAI-ARIA tabs pattern).
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    onChange(tabs[next][0])
    buttons.current[next]?.focus()
  }
  return (
    <div
      ref={list}
      role="tablist"
      className="relative flex gap-1 overflow-x-auto border-b border-edge [scrollbar-width:none]"
    >
      {bar ? (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-brand-700 transition-[left,width] duration-200 ease-out"
          style={{ left: bar.left, width: bar.width }}
        />
      ) : null}
      {tabs.map(([key, label], index) => (
        <button
          key={key}
          ref={(node) => {
            buttons.current[index] = node
          }}
          type="button"
          role="tab"
          aria-selected={value === key}
          tabIndex={value === key || (active === -1 && index === 0) ? 0 : -1}
          onClick={() => onChange(key)}
          onKeyDown={(event) => move(event, index)}
          className={`press press-down -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13.5px] font-medium outline-none focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-accent-500 ${
            value === key
              ? `text-brand-700 ${bar ? '' : 'border-brand-700'}`
              : 'text-muted hover:border-edge hover:text-ink'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function Stat({
  label,
  value,
  emphasis = false,
  danger = false,
  hint,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
  /** Money that is late or missing reads in red, never in the brand green. */
  danger?: boolean
  hint?: ReactNode
}) {
  return (
    // @container: the figure's size follows the card, not the screen (beside
    // the sidebar on a tablet, four cards are narrower than on a phone).
    <div className={`@container min-w-0 p-4 ${cardClass}`}>
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div
        className={`mt-2 whitespace-nowrap font-display font-semibold tracking-[-0.02em] tabular-nums text-sm @min-[9rem]:text-base @min-[11rem]:text-lg @min-[13.5rem]:text-[22px] ${danger ? 'text-danger-600' : emphasis ? 'text-brand-700' : ''}`}
      >
        <Figure value={value} />
      </div>
      {hint ? <div className="mt-0.5 text-[12px] text-muted">{hint}</div> : null}
    </div>
  )
}

/** «RD$ 1,250,000.00» keeps one line on a phone: the currency goes smaller. */
export function Figure({ value }: { value: ReactNode }) {
  const parts = splitAmount(value)
  if (!parts) return <>{value}</>
  return (
    <>
      {parts.sign}
      <span className="mr-1 text-[0.68em] font-medium opacity-70">RD$</span>
      {parts.amount}
    </>
  )
}

/** The house drawing of an empty list: two cards and the gold dot. */
function EmptyArt() {
  return (
    <svg
      viewBox="0 0 96 64"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-16 w-24"
    >
      <path d="M30 14a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v24" className="text-muted/45" />
      <rect x="18" y="22" width="52" height="34" rx="6" className="fill-surface" />
      <path d="M28 36h18M28 44h26" />
      <circle cx="60" cy="33" r="3.5" className="fill-gold-500" stroke="none" />
    </svg>
  )
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex animate-rise flex-col items-center rounded-xl border border-dashed border-edge bg-surface-2/60 px-4 py-9 text-center text-sm text-muted">
      <span className="mb-2 text-muted/80">
        <EmptyArt />
      </span>
      <p className="max-w-md text-balance">{children}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

const AVATAR_TONES = [
  'bg-brand-100 text-brand-800',
  'bg-gold-100 text-gold-800',
  'bg-info-100 text-info-700',
  'bg-warning-100 text-warning-700',
  'bg-surface-2 text-muted ring-1 ring-inset ring-edge',
]

/** Initials in a circle; the same name always gets the same soft tone. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length]
  const box = {
    sm: 'size-8 text-[11.5px]',
    md: 'size-9 text-[12.5px]',
    lg: 'size-12 text-base',
    xl: 'size-[60px] text-lg',
  }[size]
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold ${box} ${tone}`}
    >
      {initials(name)}
    </span>
  )
}

/** A query that failed says so: a screen never stays blank (and a 400 for a
 * bad filter says which). */
export function LoadError({ error }: { error: unknown }) {
  return (
    <Alert tone="danger">
      {error instanceof ApiError
        ? errorMessage(error.data, 'No se pudo cargar esta información.')
        : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'}
    </Alert>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted">
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-edge border-t-brand-700"
      />
      {label}
    </p>
  )
}

/** The «Entrar · Crear cuenta» switch of the sign-in and sign-up screens. */
function AccessTabs({ tab }: { tab: 'entrar' | 'registro' }) {
  const item = (to: '/entrar' | '/registro', label: string, on: boolean) => (
    <Link
      to={to}
      aria-current={on ? 'page' : undefined}
      className={`press flex h-10 flex-1 items-center justify-center rounded-lg text-[13.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
        on ? 'bg-brand-950 text-on-forest shadow-sm' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </Link>
  )
  return (
    <nav
      aria-label="Acceso"
      className="flex gap-1 rounded-xl bg-surface p-1 shadow-xs ring-1 ring-inset ring-edge"
    >
      {item('/entrar', 'Entrar', tab === 'entrar')}
      {item('/registro', 'Crear cuenta', tab === 'registro')}
    </nav>
  )
}

function PublicThemeToggle() {
  const [dark, toggle] = useDarkTheme()
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="press press-down grid size-10 place-items-center rounded-control bg-white/[0.07] text-on-forest ring-1 ring-inset ring-white/10 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-gold-500"
    >
      <span key={String(dark)} className="grid animate-pop">
        {dark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}

const YEAR = new Date().getFullYear()

const WORDMARK = (
  <span className="font-display text-[26px] font-bold tracking-[-0.03em] text-on-forest">
    Cobrad<span className="text-gold-500">í</span>a
  </span>
)

/** The screens outside the app (decision 115): on a desktop, half forest
 * with the brand's promise and half sand with the form; on a phone, the
 * forest on top and the form in a sheet that rises from below. */
export function PublicPage({
  subtitle,
  lead,
  tab,
  children,
}: {
  /** The title over the form. */
  subtitle?: string
  /** A second, quieter line under it. */
  lead?: ReactNode
  /** Sign in or sign up: shows the switch between both. */
  tab?: 'entrar' | 'registro'
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-brand-950 lg:flex-row lg:bg-canvas">
      <aside className="relative flex flex-col overflow-hidden bg-brand-950 px-6 pb-12 pt-6 text-on-forest lg:w-1/2 lg:justify-between lg:px-14 lg:py-12">
        <Texture tone="forest" />
        <div className="relative flex items-center justify-between">
          {WORDMARK}
          <PublicThemeToggle />
        </div>
        <div className="relative mt-6 max-w-xl animate-rise lg:mt-0">
          <p className="mb-4 hidden items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-brand-200 lg:flex">
            <span aria-hidden className="size-1.5 rounded-full bg-gold-500" />
            Para financieras y prestamistas
          </p>
          <p className="font-display text-[27px] font-bold leading-[1.08] tracking-[-0.035em] lg:text-[52px]">
            Tu cartera, tus rutas<span className="hidden lg:inline"> y tu caja</span>, cuadradas
            cada día.
          </p>
          <p className="mt-5 hidden max-w-md text-[15px] leading-relaxed text-brand-200 lg:block">
            Desde la solicitud hasta el último recibo, con la cifra del día siempre a la vista.
          </p>
        </div>
        <div className="relative hidden justify-between text-[12.5px] text-brand-200 lg:flex">
          <span>© {YEAR} Cobradía · hecho en República Dominicana</span>
          <a href="mailto:hola@cobradia.com" className="hover:text-on-forest">
            hola@cobradia.com
          </a>
        </div>
      </aside>
      <main className="relative -mt-6 flex flex-1 animate-sheet justify-center rounded-t-3xl bg-canvas px-5 pb-10 pt-6 lg:mt-0 lg:animate-none lg:items-center lg:rounded-none lg:px-10 lg:py-12">
        <span
          aria-hidden
          className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-edge lg:hidden"
        />
        <div className="w-full max-w-[420px] space-y-5 animate-fade">
          {tab ? <AccessTabs tab={tab} /> : null}
          {subtitle ? (
            <div className="space-y-1">
              <h1 className="text-[24px] leading-tight lg:text-[28px]">{subtitle}</h1>
              {lead ? <div className="text-[13.5px] text-muted">{lead}</div> : null}
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  )
}

/** A password with its eye: the person can check what they typed. */
export function PasswordInput({ className = '', ...props }: ComponentProps<'input'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={`pr-11 ${className}`} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? 'Ocultar lo escrito' : 'Mostrar lo escrito'}
        aria-pressed={shown}
        className="absolute inset-y-0 right-1 grid w-10 place-items-center rounded-lg text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  )
}

/** Live search box of the list screens; filters as the user types. */
export function SearchInput({ className = '', ...props }: ComponentProps<'input'>) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted">
        <SearchIcon className="size-4 shrink-0" />
      </span>
      <input
        type="search"
        className={`h-11 pl-9 sm:h-[38px] ${controlClasses}`}
        aria-label={props.placeholder}
        {...props}
      />
    </div>
  )
}

export const PAGE_SIZE = 25

/** «26–50 de 120» with previous/next; hidden while everything fits one page. */
export function Pagination({
  page,
  count,
  onChange,
}: {
  page: number
  count: number
  onChange: (page: number) => void
}) {
  if (count <= PAGE_SIZE) return null
  const last = Math.ceil(count / PAGE_SIZE)
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, count)
  return (
    <nav aria-label="Páginas" className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted tabular-nums">
        {from}–{to} de {count}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="secondary" disabled={page >= last} onClick={() => onChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  )
}

/** A list of rows that are links: wraps gracefully from desktop to phone. */
export function RowList({ children }: { children: ReactNode }) {
  return (
    <div className={`overflow-hidden ${cardClass}`}>
      <ul className="divide-y divide-edge">{children}</ul>
    </div>
  )
}

export const rowLinkClass =
  'press flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 outline-none hover:bg-brand-50/60 focus-visible:bg-brand-50 active:bg-brand-100/60 sm:px-5'

export interface Column {
  label: ReactNode
  align?: 'right'
}

/** A table as in the redesign (decision 116): a card with the head on
 * surface-2 and one line per row, the columns from a tablet up (the template
 * goes in --cols) and a card line on a phone. Rows are <li> holding a link or
 * a button with `tableRowClass`, or a <div> with it. */
export function Table({
  columns,
  head,
  children,
  footer,
  label,
  className = '',
}: {
  /** grid-template-columns of the rows, e.g. «minmax(0,2fr) minmax(0,1fr) 120px». */
  columns: string
  head?: Column[]
  children: ReactNode
  footer?: ReactNode
  label?: string
  className?: string
}) {
  return (
    <div
      className={`overflow-hidden ${cardClass} ${className}`}
      style={{ '--cols': columns } as CSSProperties}
    >
      {head ? (
        <div
          aria-hidden
          className="hidden gap-x-4 border-b border-edge bg-surface-2 px-5 py-2.5 text-[12px] font-medium text-muted md:grid md:grid-cols-[var(--cols)]"
        >
          {head.map((column, index) => (
            <span key={index} className={column.align === 'right' ? 'text-right' : ''}>
              {column.label}
            </span>
          ))}
        </div>
      ) : null}
      <ul aria-label={label} className="divide-y divide-edge">
        {children}
      </ul>
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge bg-surface-2 px-5 py-3 text-[13px] font-semibold">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

const OUTCOME_TONE = {
  success: 'bg-success-100 text-success-600',
  danger: 'bg-danger-100 text-danger-600',
  warning: 'bg-warning-100 text-warning-700',
}

/** The answer a public page gives (decision 116): a seal, a title and one
 * line saying what to do next. */
export function Outcome({
  tone,
  title,
  children,
}: {
  tone: keyof typeof OUTCOME_TONE
  title: string
  children?: ReactNode
}) {
  const Icon = tone === 'success' ? CheckCircleIcon : AlertIcon
  return (
    <div className="flex flex-col items-center text-center">
      <span
        aria-hidden
        className={`grid size-14 animate-pop place-items-center rounded-full ${OUTCOME_TONE[tone]}`}
      >
        <Icon className="size-7" />
      </span>
      <h2 className="mt-3 text-[19px] font-semibold tracking-[-0.01em]">{title}</h2>
      {children ? (
        <div className="mt-1 max-w-sm text-[13.5px] leading-relaxed text-muted">{children}</div>
      ) : null}
    </div>
  )
}
