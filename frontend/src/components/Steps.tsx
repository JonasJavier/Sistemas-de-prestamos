import { CheckIcon } from './icons'

export interface Step {
  label: string
  hint: string
  /** An anchor of the page: the step takes there (the application's file). */
  href?: string
}

/** The steps of a long task (decision 115): vertical with a line between
 * them on a desktop — done ones checked, the current one ringed — and a row
 * of short bars on a phone. */
export function Steps({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <>
      <ol aria-label="Pasos" className="hidden lg:block">
        {steps.map((step, index) => {
          const done = index < current
          const here = index === current
          return (
            <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5 rounded-full ${
                    done ? 'bg-brand-700' : 'bg-edge'
                  }`}
                />
              ) : null}
              <span
                aria-hidden
                className={`relative grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${
                  done
                    ? 'bg-brand-700 text-on-brand'
                    : here
                      ? 'bg-surface text-brand-700 ring-2 ring-brand-700 ring-offset-2 ring-offset-canvas'
                      : 'bg-surface text-muted ring-1 ring-edge'
                }`}
              >
                {done ? <CheckIcon /> : index + 1}
              </span>
              {(() => {
                const text = (
                  <>
                    <span
                      className={`block text-[13.5px] ${here || done ? 'font-semibold text-ink' : 'font-medium text-muted'}`}
                    >
                      {step.label}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{step.hint}</span>
                  </>
                )
                return step.href ? (
                  <a
                    href={step.href}
                    aria-current={here ? 'step' : undefined}
                    className="min-w-0 rounded-md pt-0.5 outline-none hover:[&>span:first-child]:text-brand-700 focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    {text}
                  </a>
                ) : (
                  <span className="min-w-0 pt-0.5" aria-current={here ? 'step' : undefined}>
                    {text}
                  </span>
                )
              })()}
            </li>
          )
        })}
      </ol>
      <div className="lg:hidden">
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((step, index) => (
            <span
              key={step.label}
              className={`h-1 flex-1 rounded-full ${index <= current ? 'bg-brand-700' : 'bg-edge'}`}
            />
          ))}
        </div>
        <p className="sr-only">
          Paso {current + 1} de {steps.length}: {steps[current]?.label}
        </p>
      </div>
    </>
  )
}
