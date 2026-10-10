import { useRef, useState, type ChangeEvent } from 'react'

import { dateFromText, dateText } from '../lib/format'
import { CalendarIcon } from './icons'

/** A business date (YYYY-MM-DD) shown and typed as dd/mm/aaaa. The native
 * `<input type="date">` writes the browser's format: with an English
 * browser «10/09/2026» means October 9 beside a «09/10/2026» of the app.
 * The calendar button still opens the device's own picker. */
export function DateInput({
  value: given,
  onChange,
  min,
  max,
  disabled,
  required,
  id,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  value: string | null | undefined
  /** The ISO date once the typed text is a real day; '' when emptied. */
  onChange: (iso: string) => void
  min?: string
  max?: string
  disabled?: boolean
  required?: boolean
  id?: string
  autoFocus?: boolean
  'aria-label'?: string
}) {
  const value = given ?? ''
  const [text, setText] = useState(() => dateText(value))
  // The value can change from outside (a reset, a default): follow it,
  // unless it is what the text already says.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (dateFromText(text) !== value) setText(dateText(value))
  }
  const picker = useRef<HTMLInputElement>(null)
  const inRange = (date: string) => (!min || date >= min) && (!max || date <= max)
  const iso = dateFromText(text)
  const outOfRange = Boolean(iso && !inRange(iso))
  const range =
    min && max
      ? `Elige una fecha entre el ${dateText(min)} y el ${dateText(max)}.`
      : min
        ? `Elige una fecha desde el ${dateText(min)}.`
        : `Elige una fecha hasta el ${dateText(max)}.`

  const type = (event: ChangeEvent<HTMLInputElement>) => {
    let next = event.target.value.replace(/[^\d/-]/g, '').slice(0, 10)
    // Typing «0910» gives «09/10/»: the slash comes after two digits.
    if (next.length > text.length && /^\d{2}$|^\d{1,2}\/\d{2}$/.test(next)) next += '/'
    setText(next)
    if (!next) onChange('')
    else {
      // A day outside the allowed range is not handed over: the box says why.
      const parsed = dateFromText(next)
      if (parsed && inRange(parsed)) onChange(parsed)
    }
  }

  const openPicker = () => {
    const input = picker.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      input.focus()
      input.click()
    }
  }

  return (
    <span className="block">
      <span className="relative block">
        <input
          id={id}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/aaaa"
          value={text}
          onChange={type}
          // Half a date, or one out of range, is not kept: back to the last good one.
          onBlur={() => {
            if (text && (!iso || outOfRange)) setText(dateText(value))
          }}
          disabled={disabled}
          required={required}
          aria-invalid={outOfRange || undefined}
          className={`h-11 w-full rounded-lg border bg-surface pl-3 pr-10 text-sm tabular-nums text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-60 sm:h-9 ${outOfRange ? 'border-danger-600' : 'border-edge'}`}
        />
        <button
          type="button"
          aria-label="Abrir el calendario"
          title="Abrir el calendario"
          disabled={disabled}
          onClick={openPicker}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-lg text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-60"
        >
          <CalendarIcon />
        </button>
        {/* The device's calendar, anchored under the button; never focused
          or read on its own. */}
        <input
          ref={picker}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            setText(dateText(event.target.value))
            onChange(event.target.value)
          }}
          className="pointer-events-none absolute bottom-0 right-0 size-px opacity-0"
        />
      </span>
      {outOfRange ? (
        <span role="alert" className="mt-1 block text-[12.5px] text-danger-600">
          {range}
        </span>
      ) : null}
    </span>
  )
}
