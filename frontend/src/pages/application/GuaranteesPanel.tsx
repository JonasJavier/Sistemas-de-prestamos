import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import { listCollaterals } from '../../api/customers'
import {
  addApplicationCollateral,
  addGuarantor,
  removeApplicationCollateral,
  removeGuarantor,
  type Application,
} from '../../api/origination'
import { CustomerPicker } from '../../components/CustomerPicker'
import { Alert, Badge, Button, Card, Field, Input, Select } from '../../components/ui'
import { errorMessage, rd } from '../../lib/format'

const COLLATERAL_STATUS: Record<string, string> = {
  registered: 'Registrado',
  pledged: 'En garantía',
  released: 'Liberado',
  executed: 'Ejecutado',
}

/** F2 inside F3: guarantors (only our customers, #27) and pledged assets. */
export function GuaranteesPanel({
  application,
  onChange,
}: {
  application: Application
  onChange: () => void
}) {
  const editable = application.can.edit
  const owners = [application.customer, ...application.guarantors.map((g) => g.customer)]
  const assets = useQuery({
    queryKey: ['collaterals-for', owners],
    queryFn: async () => (await Promise.all(owners.map(listCollaterals))).flatMap((r) => r.results),
    enabled: editable,
  })
  const [assetId, setAssetId] = useState('')
  const [considered, setConsidered] = useState('')

  const guarantor = useMutation({
    mutationFn: (customer: string) => addGuarantor(application.id, customer),
    onSuccess: onChange,
  })
  const dropGuarantor = useMutation({ mutationFn: removeGuarantor, onSuccess: onChange })
  const asset = useMutation({
    mutationFn: () => addApplicationCollateral(application.id, assetId, considered || undefined),
    onSuccess: () => {
      setAssetId('')
      setConsidered('')
      onChange()
    },
  })
  const dropAsset = useMutation({ mutationFn: removeApplicationCollateral, onSuccess: onChange })
  const error = [guarantor.error, asset.error].find((e) => e instanceof ApiError) as
    ApiError | undefined
  const used = new Set(application.collaterals.map((c) => c.collateral))
  const available = (assets.data ?? []).filter(
    (c) => !used.has(c.id) && (c.status === 'registered' || c.status === 'released'),
  )

  return (
    <Card className="space-y-4">
      <h2 className="text-base font-semibold">Garantes y garantías</h2>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Garantes</h3>
        {application.guarantors.length === 0 ? (
          <p className="text-sm text-muted">Sin garantes.</p>
        ) : (
          <ul className="divide-y divide-edge rounded-lg border border-edge">
            {application.guarantors.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  {g.customer_name}{' '}
                  <span className="text-muted tabular-nums">· {g.customer_document}</span>{' '}
                  {g.customer_status === 'blocked' ? <Badge tone="danger">Bloqueado</Badge> : null}
                </span>
                {editable ? (
                  <button
                    type="button"
                    className="text-[12.5px] text-danger-600 hover:underline"
                    onClick={() => dropGuarantor.mutate(g.id)}
                  >
                    Quitar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <div className="mt-2">
            <CustomerPicker
              onPick={(c) => guarantor.mutate(c.id)}
              exclude={owners}
              placeholder="Agregar garante: buscar un cliente registrado…"
            />
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Bienes en garantía</h3>
        {application.collaterals.length === 0 ? (
          <p className="text-sm text-muted">Sin bienes.</p>
        ) : (
          <ul className="divide-y divide-edge rounded-lg border border-edge">
            {application.collaterals.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  {c.description}{' '}
                  <span className="text-muted">
                    · {COLLATERAL_STATUS[c.status]} · tasado {rd(c.appraised_value)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">Considerado {rd(c.considered_value)}</span>
                  {editable ? (
                    <button
                      type="button"
                      className="text-[12.5px] text-danger-600 hover:underline"
                      onClick={() => dropAsset.mutate(c.id)}
                    >
                      Quitar
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <form
            className="mt-2 grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_180px_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              asset.mutate()
            }}
          >
            <Field label="Bien del cliente o de un garante">
              <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">
                  {available.length ? 'Elegir…' : 'No hay bienes disponibles en sus expedientes'}
                </option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.description} ({rd(c.appraised_value)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Valor considerado (opcional)">
              <Input
                inputMode="decimal"
                placeholder="La tasación"
                value={considered}
                onChange={(e) => setConsidered(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" disabled={!assetId || asset.isPending}>
              Agregar
            </Button>
          </form>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{errorMessage(error.data)}</Alert> : null}
    </Card>
  )
}
