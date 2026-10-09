import type { Classification, Grade, ScoreFactor } from '../api/reports'
import { Badge } from './ui'

const TONE: Record<string, string> = { A: 'brand', B: 'success', C: 'warning', D: 'danger' }

/** The grade always reads as letter and word, never color alone. */
export function GradeBadge({ grade, label }: { grade: Grade; label: string }) {
  return <Badge tone={TONE[grade] ?? 'neutral'}>{grade ? `${grade} · ${label}` : label}</Badge>
}

/** «Por qué»: each factor with its points out of its weight, and the caps. */
export function ScoreFactors({ factors }: { factors: ScoreFactor[] }) {
  return (
    <ul className="space-y-1.5 text-[13px]">
      {factors.map((factor, index) =>
        factor.max ? (
          <li key={factor.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
            <span>
              {factor.label}
              {factor.detail ? <span className="text-muted"> · {factor.detail}</span> : null}
            </span>
            <span className="tabular-nums font-semibold">
              {factor.points} / {factor.max}
            </span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full bg-brand-700"
                style={{ width: `${(Number(factor.points ?? 0) / factor.max) * 100}%` }}
              />
            </span>
          </li>
        ) : (
          <li key={`${factor.key}-${index}`} className="font-medium text-warning-700">
            {factor.label}
          </li>
        ),
      )}
    </ul>
  )
}

export function ClassificationNote({ value }: { value: Classification }) {
  return (
    <details className="rounded-lg border border-edge bg-surface px-3 py-2">
      <summary className="cursor-pointer text-sm">
        Clasificación <GradeBadge grade={value.grade} label={value.label} />
        {value.score ? <span className="ml-1 tabular-nums">{value.score} puntos</span> : null}
        <span className="ml-1 text-muted">· ¿por qué?</span>
      </summary>
      <div className="mt-2">
        <ScoreFactors factors={value.factors} />
      </div>
    </details>
  )
}
