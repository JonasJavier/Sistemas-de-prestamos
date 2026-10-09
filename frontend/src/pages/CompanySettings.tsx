import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { ApiError } from '../api/client'
import {
  COMPANY_LOGO_URL,
  type CompanySettings,
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
} from '../api/company'
import { EscalationRulesCard } from '../components/EscalationRulesCard'
import { CompanySupportCard } from '../components/Support'
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  PercentInput,
  Spinner,
} from '../components/ui'
import { errorMessage, pct } from '../lib/format'
import { notify } from '../lib/toast'

/** P70 · Empresa: the document header and the operating defaults (075). */
export function CompanySettingsPage() {
  const settings = useQuery({ queryKey: ['company-settings'], queryFn: getCompanySettings })
  return (
    <>
      <PageHeader
        title="Empresa"
        subtitle="Los datos que encabezan recibos, pagarés y reportes, y los valores con que opera tu financiera."
      />
      {/* Doc 06 §10: support access is visible here, with its history. */}
      <CompanySupportCard />
      {settings.data ? (
        // Remount when the saved data changes so every field starts from it.
        <CompanyForm key={JSON.stringify(settings.data)} data={settings.data} />
      ) : (
        <Spinner />
      )}
    </>
  )
}

function CompanyForm({ data }: { data: CompanySettings }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(data)
  const [logoVersion, setLogoVersion] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const set = <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) =>
    setForm((current) => ({ ...current, [key]: value }))
  const saved = (next: CompanySettings) => {
    queryClient.setQueryData(['company-settings'], next)
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      updateCompanySettings({
        legal_name: form.legal_name,
        trade_name: form.trade_name,
        rnc: form.rnc,
        address: form.address,
        phone: form.phone,
        email: form.email,
        application_validity_days: Number(form.application_validity_days),
        capacity_alert_ratio: form.capacity_alert_ratio,
        collector_cash_limit: form.collector_cash_limit,
        max_effective_annual_rate: form.max_effective_annual_rate || null,
        write_off_days: Number(form.write_off_days),
      }),
    onSuccess: (next) => {
      notify('Datos de la empresa guardados.', 'success')
      saved(next)
    },
  })
  const logo = useMutation({
    meta: { inlineError: true },
    mutationFn: (file: File | null) =>
      file ? uploadCompanyLogo(file) : updateCompanySettings({ remove_logo: true }),
    onSuccess: (next) => {
      setLogoVersion((v) => v + 1)
      saved(next)
    },
  })
  const errors =
    save.error instanceof ApiError && save.error.status === 400
      ? (save.error.data as Record<string, string[] | string>)
      : null
  const error = (key: string) => {
    const value = errors?.[key]
    return Array.isArray(value) ? value[0] : value
  }
  const name = form.trade_name || form.legal_name

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">Datos legales</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Razón social" error={error('legal_name')}>
              <Input value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} />
            </Field>
            <Field label="Nombre comercial" error={error('trade_name')}>
              <Input value={form.trade_name} onChange={(e) => set('trade_name', e.target.value)} />
            </Field>
            <Field label="RNC" error={error('rnc')}>
              <Input
                inputMode="numeric"
                placeholder="9 dígitos"
                value={form.rnc}
                onChange={(e) => set('rnc', e.target.value)}
              />
            </Field>
            <Field label="Teléfono" error={error('phone')}>
              <Input
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </Field>
            <Field label="Correo" error={error('email')}>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Field>
            <Field label="Dirección" error={error('address')}>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Operación</h2>
            <p className="text-[12.5px] text-muted">
              Valores por defecto de la empresa; cada uno se aplica desde que lo guardas.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Vigencia de una solicitud (días)"
              hint="Una solicitud sin decidir vence después de estos días."
              error={error('application_validity_days')}
            >
              <Input
                inputMode="numeric"
                value={String(form.application_validity_days)}
                onChange={(e) =>
                  set('application_validity_days', Number(e.target.value.replace(/\D/g, '')))
                }
              />
            </Field>
            <Field
              label="Alerta de capacidad de pago"
              hint="Avisa si la cuota pasa de este porcentaje del ingreso."
              error={error('capacity_alert_ratio')}
            >
              <PercentInput
                value={form.capacity_alert_ratio}
                onChange={(value) => set('capacity_alert_ratio', value)}
              />
            </Field>
            <Field
              label="Límite de efectivo de un cobrador (RD$)"
              hint="Al superarlo se avisa al supervisor; el cobrador puede dejar efectivo en una caja sin cerrar su ruta."
              error={error('collector_cash_limit')}
            >
              <Input
                inputMode="decimal"
                value={form.collector_cash_limit}
                onChange={(e) => set('collector_cash_limit', e.target.value)}
              />
            </Field>
            <Field
              label="Días de atraso para sugerir el castigo"
              hint="Desde ahí el sistema propone castigar el préstamo; el gerente decide."
              error={error('write_off_days')}
            >
              <Input
                inputMode="numeric"
                value={String(form.write_off_days)}
                onChange={(e) => set('write_off_days', Number(e.target.value) || 0)}
              />
            </Field>
            <Field
              label="Tope de costo anual efectivo"
              hint="Opcional. Ningún préstamo nuevo cuesta más que esto al año, con cargos incluidos."
              error={error('max_effective_annual_rate')}
            >
              <PercentInput
                placeholder="Sin tope"
                value={form.max_effective_annual_rate}
                onChange={(value) => set('max_effective_annual_rate', value || null)}
              />
            </Field>
          </div>
          {data.legal_max_effective_annual_rate ? (
            <Alert tone="info">
              La ley fija un tope de costo anual efectivo de{' '}
              <strong>{pct(data.legal_max_effective_annual_rate)}</strong> para todas las
              financieras; se aplica aunque aquí no indiques uno.
            </Alert>
          ) : null}
        </Card>

        {save.error instanceof ApiError && !errors ? (
          <Alert tone="danger">{errorMessage(save.error.data)}</Alert>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Guardar cambios
          </Button>
        </div>

        <EscalationRulesCard />
      </div>

      <Card className="h-fit space-y-3">
        <h2 className="text-base font-semibold">Encabezado de los documentos</h2>
        <div className="flex items-center gap-3 rounded-lg border border-edge p-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-brand-100 text-lg font-semibold text-brand-700">
            {data.has_logo ? (
              <img
                src={`${COMPANY_LOGO_URL}?v=${logoVersion}`}
                alt="Logo de la empresa"
                className="h-full w-full object-contain"
              />
            ) : (
              (name || '?').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 text-[12.5px] leading-snug">
            <p className="truncate text-sm font-semibold">{name || 'Tu financiera'}</p>
            {form.rnc ? <p>RNC {rncText(form.rnc)}</p> : null}
            {form.address ? <p className="truncate">{form.address}</p> : null}
            <p className="truncate text-muted">
              {[form.phone, form.email].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <p className="text-[12.5px] text-muted">
          Así se ve en recibos, pagarés, cartas y reportes. Logo en PNG o JPG, hasta 1 MB.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) logo.mutate(file)
            e.target.value = ''
          }}
        />
        {logo.error instanceof ApiError ? (
          <Alert tone="danger">{errorMessage(logo.error.data)}</Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            disabled={logo.isPending}
          >
            {data.has_logo ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {data.has_logo ? (
            <Button variant="secondary" onClick={() => logo.mutate(null)} disabled={logo.isPending}>
              Quitar logo
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

/** 101234567 -> 1-01-23456-7, the way the DGII prints it. */
function rncText(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 9
    ? `${digits[0]}-${digits.slice(1, 3)}-${digits.slice(3, 8)}-${digits[8]}`
    : value
}
