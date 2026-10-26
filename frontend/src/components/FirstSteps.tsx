import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { type FirstSteps as Steps, getFirstSteps } from '../api/platform'
import { ArrowRightIcon, CheckIcon } from './icons'
import { buttonClass } from './classes'

type Key = keyof Steps['steps']

interface Step {
  key: Key
  title: string
  hint: string
  /** Where the step is done; «loan» depends on whether a customer exists. */
  to: (data: Steps) => string
  action: string
}

/** D2 (decision 129): the six things a new financiera does before its first
 * collection day, in the order they go. The state comes from the server, from
 * what the company really did; nothing is ticked by hand. */
const STEPS: Step[] = [
  {
    key: 'company',
    title: 'Completa los datos de tu empresa',
    hint: 'Dirección y teléfono salen en recibos y contratos; el logo, en cada documento.',
    to: () => '/ajustes/empresa',
    action: 'Completar',
  },
  {
    key: 'branch',
    title: 'Revisa tu sucursal',
    hint: 'Pon la dirección y el horario de la principal; agrega otras si las tienes.',
    to: () => '/ajustes/sucursales',
    action: 'Revisar',
  },
  {
    key: 'product',
    title: 'Ajusta tus productos de préstamo',
    hint: 'Vienen dos de ejemplo: cambia tasa, cuotas, mora y cargos a como tú prestas, o crea el tuyo.',
    to: () => '/ajustes/productos',
    action: 'Ajustar',
  },
  {
    key: 'team',
    title: 'Invita a tu equipo',
    hint: 'Cajeros, cobradores y oficiales entran con su propio usuario y ven solo lo suyo.',
    to: () => '/ajustes/usuarios',
    action: 'Invitar',
  },
  {
    key: 'cash',
    title: 'Abre la caja',
    hint: 'Registra el fondo con que empiezas y abre la caja del día para cobrar y desembolsar.',
    to: () => '/caja',
    action: 'Abrir',
  },
  {
    key: 'loan',
    title: 'Registra tu primer préstamo',
    hint: 'Crea el cliente, cotiza y desembolsa. Si vienes de otro sistema, escríbenos y cargamos tu cartera.',
    to: (data) => (data.customers > 0 ? '/solicitudes/nueva' : '/clientes/nuevo'),
    action: 'Empezar',
  },
]

function hiddenKey(companyId: string) {
  return `cobradia:first-steps-hidden:${companyId}`
}

function readHidden(companyId: string) {
  try {
    return localStorage.getItem(hiddenKey(companyId)) === '1'
  } catch {
    return false
  }
}

export function FirstStepsCard({ companyId }: { companyId: string }) {
  const [hidden, setHidden] = useState(() => readHidden(companyId))
  const query = useQuery({
    queryKey: ['first-steps', companyId],
    queryFn: getFirstSteps,
    enabled: !hidden,
  })
  const data = query.data
  if (hidden || !data || data.done >= data.total) return null

  const next = STEPS.find((step) => !data.steps[step.key])
  const percent = Math.round((data.done / data.total) * 100)

  function hide() {
    try {
      localStorage.setItem(hiddenKey(companyId), '1')
    } catch {
      /* a private window: the card simply comes back next time */
    }
    setHidden(true)
  }

  return (
    <section
      aria-label="Primeros pasos"
      className="animate-fade rounded-xl border border-edge bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">Primeros pasos</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {next
              ? `Llevas ${data.done} de ${data.total}. Lo que sigue: ${next.title.toLowerCase()}.`
              : 'Todo listo.'}
          </p>
        </div>
        <button
          type="button"
          onClick={hide}
          className="text-[12.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Ocultar esta guía
        </button>
      </div>
      <div className="px-4 pt-3 sm:px-5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={data.total}
          aria-valuenow={data.done}
          aria-label={`${data.done} de ${data.total} pasos`}
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full rounded-full bg-brand-700 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <ol className="mt-2 divide-y divide-edge">
        {STEPS.map((step, index) => {
          const done = data.steps[step.key]
          const current = next?.key === step.key
          return (
            <li
              key={step.key}
              className={`flex items-start gap-3 px-4 py-3 sm:px-5 ${done ? 'opacity-70' : ''}`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold ${
                  done
                    ? 'bg-brand-700 text-white'
                    : current
                      ? 'bg-accent-500/15 text-brand-700 ring-2 ring-accent-500/60'
                      : 'bg-surface-2 text-muted'
                }`}
              >
                {done ? <CheckIcon /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium leading-snug ${done ? 'line-through decoration-muted/60' : ''}`}
                >
                  {step.title}
                  {done ? <span className="sr-only"> (hecho)</span> : null}
                </p>
                {!done ? <p className="mt-0.5 text-[12.5px] text-muted">{step.hint}</p> : null}
              </div>
              {!done ? (
                <Link
                  to={step.to(data)}
                  className={buttonClass(current ? 'primary' : 'secondary', 'shrink-0', 'sm')}
                >
                  {step.action}
                  <ArrowRightIcon />
                </Link>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
