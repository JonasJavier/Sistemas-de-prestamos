import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { listCustomers } from '../api/customers'
import { Button, Card, Input } from '../components/ui'

export function CustomersPage() {
  const [q, setQ] = useState('')
  const [submitted, setSubmitted] = useState('')
  const customers = useQuery({
    queryKey: ['customers', submitted],
    queryFn: () => listCustomers({ q: submitted }),
  })

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <Link to="/clientes/nuevo">
          <Button>Nuevo cliente</Button>
        </Link>
      </div>

      <Card>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setSubmitted(q)
          }}
        >
          <Input
            placeholder="Buscar por nombre, cédula, RNC o teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        {customers.isPending ? <p className="text-sm text-muted">Cargando…</p> : null}
        {customers.data && customers.data.count === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {submitted
              ? 'Ningún cliente coincide con la búsqueda.'
              : 'Aún no hay clientes · crea el primero con «Nuevo cliente».'}
          </p>
        ) : null}
        {customers.data && customers.data.count > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-[12.5px] text-muted">
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Teléfono</th>
                <th className="py-2 pr-3">Sucursal</th>
                <th className="py-2 pr-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {customers.data.results.map((customer) => (
                <tr key={customer.id} className="border-b border-edge/60 last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      to="/clientes/$id"
                      params={{ id: customer.id }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {customer.display_name}
                    </Link>
                    <span className="ml-2 text-[12.5px] text-muted">
                      {customer.kind === 'company' ? 'Empresa' : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {customer.document_number /* masked by the API (doc 06 - 7) */}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{customer.phone}</td>
                  <td className="py-2 pr-3">{customer.branch_code}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[12.5px] font-medium ${
                        customer.status === 'active'
                          ? 'bg-brand-100 text-brand-800'
                          : 'bg-danger-600/15 text-danger-600'
                      }`}
                    >
                      {customer.status === 'active' ? 'Activo' : 'Bloqueado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </>
  )
}
