import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { ApiError } from '../../api/client'
import { createCollateral, listCollaterals } from '../../api/customers'
import { Alert, Button, Card, Field, Input } from '../../components/ui'

const STATUS_TEXT: Record<string, string> = {
  registered: 'Registrado',
  pledged: 'En garantía',
  released: 'Liberado',
  executed: 'Ejecutado',
}

const selectClasses =
  'h-11 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:h-9'

export function CollateralTab({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const collaterals = useQuery({
    queryKey: ['collaterals', customerId],
    queryFn: () => listCollaterals(customerId),
  })
  const [type, setType] = useState<'vehicle' | 'property' | 'other'>('vehicle')
  const [description, setDescription] = useState('')
  const [value, setValue] = useState('')
  const [vehicle, setVehicle] = useState({ brand: '', model: '', year: '', plate: '' })
  const [property, setProperty] = useState({ title_number: '', location: '' })
  const [message, setMessage] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        owner: customerId,
        type,
        description,
        appraised_value: value || null,
      }
      if (type === 'vehicle') {
        payload.vehicle = { ...vehicle, year: vehicle.year ? Number(vehicle.year) : null }
      }
      if (type === 'property') payload.property = property
      return createCollateral(payload)
    },
    onSuccess: () => {
      setDescription('')
      setValue('')
      setVehicle({ brand: '', model: '', year: '', plate: '' })
      setProperty({ title_number: '', location: '' })
      setMessage(null)
      queryClient.invalidateQueries({ queryKey: ['collaterals', customerId] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400 && error.data) {
        const data = error.data as Record<string, string[]>
        setMessage(Object.values(data).flat()[0] ?? 'Revisa los datos.')
      } else {
        setMessage('No se pudo registrar la garantía.')
      }
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-base font-semibold">Registrar un bien</h3>
        {message ? <Alert tone="danger">{message}</Alert> : null}
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Tipo">
            <select
              className={selectClasses}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="vehicle">Vehículo</option>
              <option value="property">Inmueble</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field label="Descripción">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Valor tasado (RD$)">
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>

          {type === 'vehicle' ? (
            <>
              <Field label="Marca">
                <Input
                  value={vehicle.brand}
                  onChange={(e) => setVehicle({ ...vehicle, brand: e.target.value })}
                />
              </Field>
              <Field label="Modelo">
                <Input
                  value={vehicle.model}
                  onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Año">
                  <Input
                    inputMode="numeric"
                    value={vehicle.year}
                    onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })}
                  />
                </Field>
                <Field label="Placa">
                  <Input
                    value={vehicle.plate}
                    onChange={(e) => setVehicle({ ...vehicle, plate: e.target.value })}
                  />
                </Field>
              </div>
            </>
          ) : null}

          {type === 'property' ? (
            <>
              <Field label="Número de título">
                <Input
                  value={property.title_number}
                  onChange={(e) => setProperty({ ...property, title_number: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Ubicación">
                  <Input
                    value={property.location}
                    onChange={(e) => setProperty({ ...property, location: e.target.value })}
                  />
                </Field>
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-3">
          <Button
            onClick={() => add.mutate()}
            disabled={add.isPending || !description}
            variant="secondary"
          >
            {add.isPending ? 'Registrando…' : 'Registrar bien'}
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold">Bienes del cliente</h3>
        <ul className="space-y-2 text-sm">
          {collaterals.data?.results.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <span>
                <span className="font-medium">{item.description}</span>{' '}
                <span className="text-muted">
                  {item.vehicle
                    ? `· ${item.vehicle.brand} ${item.vehicle.model} ${item.vehicle.year ?? ''} ${
                        item.vehicle.plate ? `· placa ${item.vehicle.plate}` : ''
                      }`
                    : ''}
                  {item.property?.location ? `· ${item.property.location}` : ''}
                  {item.appraised_value
                    ? ` · tasado RD$ ${Number(item.appraised_value).toLocaleString('es-DO', {
                        minimumFractionDigits: 2,
                      })}`
                    : ''}
                </span>
              </span>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[12.5px] font-medium text-brand-800">
                {STATUS_TEXT[item.status] ?? item.status}
              </span>
            </li>
          ))}
          {collaterals.data && collaterals.data.results.length === 0 ? (
            <li className="text-muted">Sin bienes registrados.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  )
}
