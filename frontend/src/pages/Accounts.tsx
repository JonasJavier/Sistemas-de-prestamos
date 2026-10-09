import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { listBranches, type Me } from '../api/accounts'
import { ApiError } from '../api/client'
import {
  accountMovements,
  capitalMovement,
  createAccount,
  listAccounts,
  transferBetween,
  type FinancialAccount,
} from '../api/origination'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'
import { day, errorMessage, rd } from '../lib/format'
import { ACCESS, hasRole } from '../lib/roles'

const KIND_LABEL: Record<FinancialAccount['kind'], string> = {
  cash: 'Caja',
  bank: 'Banco',
  drawer: 'Caja de cajero',
  route: 'Efectivo de cobrador',
}

function Movements({ account }: { account: FinancialAccount }) {
  const query = useQuery({
    queryKey: ['account', account.id, 'movements'],
    queryFn: () => accountMovements(account.id),
  })
  if (query.isPending) return <Spinner />
  const rows = query.data?.results ?? []
  if (rows.length === 0) return <p className="text-sm text-muted">Sin movimientos.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[12.5px] text-muted">
            <th className="py-2 pr-3">Fecha</th>
            <th className="py-2 pr-3">Asiento</th>
            <th className="py-2 pr-3">Descripción</th>
            <th className="py-2 pr-3 text-right">Entra</th>
            <th className="py-2 text-right">Sale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-edge/60 last:border-0">
              <td className="py-1.5 pr-3 tabular-nums">{day(row.date)}</td>
              <td className="py-1.5 pr-3 tabular-nums text-muted">{row.number}</td>
              <td className="py-1.5 pr-3">{row.description}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-success-600">
                {Number(row.debit) ? rd(row.debit) : ''}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {Number(row.credit) ? rd(row.credit) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** P53: cash boxes and banks, their balances (from the ledger) and moves. */
export function AccountsPage({ me }: { me: Me }) {
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['accounts'] })
  const canManage = hasRole(me, ACCESS.manageAccounts)
  const isManager = hasRole(me, ACCESS.adjustCapital)
  const [open, setOpen] = useState<string | null>(null)
  const [panel, setPanel] = useState<'new' | 'transfer' | 'capital' | null>(null)

  const branches = useQuery({ queryKey: ['branches'], queryFn: listBranches })
  const [branch, setBranch] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'cash' | 'bank'>('bank')
  const [bank, setBank] = useState('')
  const [number, setNumber] = useState('')
  const create = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      createAccount({
        name,
        kind,
        bank_name: bank,
        account_number: number,
        branch: branch || null,
      }),
    onSuccess: () => {
      setName('')
      setBank('')
      setNumber('')
      setPanel(null)
      refresh()
    },
  })

  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const move = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      panel === 'transfer'
        ? transferBetween({ source, target, amount, note })
        : capitalMovement(target, { amount, direction, note }),
    onSuccess: () => {
      setAmount('')
      setNote('')
      setPanel(null)
      refresh()
      queryClient.invalidateQueries({ queryKey: ['account'] })
    },
  })
  const failure = [create.error, move.error].find((e) => e instanceof ApiError) as
    ApiError | undefined
  const rows = accounts.data ?? []
  const total = rows.reduce((sum, a) => sum + Number(a.balance), 0)
  // A cashier's drawer or a collector's cash moves only through its session.
  const movable = rows.filter((a) => (a.kind === 'cash' || a.kind === 'bank') && a.is_active)

  return (
    <>
      <PageHeader
        title="Cuentas y bancos"
        subtitle="Saldos calculados del libro de movimientos; ninguna cuenta admite sobregiro."
        actions={
          canManage ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setPanel(panel === 'transfer' ? null : 'transfer')}
              >
                Transferir
              </Button>
              {isManager ? (
                <Button
                  variant="secondary"
                  onClick={() => setPanel(panel === 'capital' ? null : 'capital')}
                >
                  Aporte o retiro
                </Button>
              ) : null}
              <Button onClick={() => setPanel(panel === 'new' ? null : 'new')}>Nueva cuenta</Button>
            </>
          ) : null
        }
      />

      {panel === 'new' ? (
        <Card>
          <form
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[120px_1fr_1fr_1fr_160px_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <Field label="Tipo">
              <Select value={kind} onChange={(e) => setKind(e.target.value as 'cash' | 'bank')}>
                <option value="bank">Banco</option>
                <option value="cash">Caja</option>
              </Select>
            </Field>
            <Field label="Nombre">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Popular operativa"
              />
            </Field>
            <Field label="Banco">
              <Input
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                disabled={kind === 'cash'}
              />
            </Field>
            <Field label="Número (se guardan solo los últimos 4)">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                disabled={kind === 'cash'}
              />
            </Field>
            <Field label="Sucursal">
              <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">Toda la empresa</option>
                {branches.data?.results.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={!name || create.isPending}>
              Crear
            </Button>
          </form>
        </Card>
      ) : null}

      {panel === 'transfer' || panel === 'capital' ? (
        <Card>
          <form
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault()
              move.mutate()
            }}
          >
            {panel === 'transfer' ? (
              <Field label="Desde">
                <Select value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Elegir…</option>
                  {movable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {rd(a.balance)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Movimiento">
                <Select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as 'in' | 'out')}
                >
                  <option value="in">Aporte de capital (entra)</option>
                  <option value="out">Retiro de capital (sale)</option>
                </Select>
              </Field>
            )}
            <Field label={panel === 'transfer' ? 'Hacia' : 'Cuenta'}>
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Elegir…</option>
                {movable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Monto">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label={panel === 'capital' ? 'Motivo (obligatorio)' : 'Nota'}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="sm:col-span-4 flex justify-end">
              <Button
                type="submit"
                disabled={
                  !target || !amount || (panel === 'transfer' ? !source : !note) || move.isPending
                }
              >
                {panel === 'transfer' ? 'Transferir' : 'Registrar'}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {failure ? <Alert tone="danger">{errorMessage(failure.data)}</Alert> : null}

      {accounts.isPending ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState>Aún no hay cuentas.</EmptyState>
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-edge">
            {rows.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => setOpen(open === account.id ? null : account.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <span>
                    <span className="font-semibold">{account.name}</span>
                    {account.account_number_last4 ? (
                      <span className="ml-1 text-muted tabular-nums">
                        ••{account.account_number_last4}
                      </span>
                    ) : null}{' '}
                    <Badge tone={account.kind === 'bank' ? 'info' : 'brand'}>
                      {KIND_LABEL[account.kind] ?? account.kind}
                      {account.kind === 'bank' && account.bank_name
                        ? ` · ${account.bank_name}`
                        : ''}
                    </Badge>
                    {!account.is_active ? <Badge>Inactiva</Badge> : null}
                    <span className="block text-[12px] text-muted">
                      {account.ledger_code}
                      {account.branch_name ? ` · ${account.branch_name}` : ' · toda la empresa'}
                    </span>
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums">
                    {rd(account.balance)}
                  </span>
                </button>
                {open === account.id ? (
                  <div className="border-t border-edge bg-surface-2 px-4 py-3">
                    <Movements account={account} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t-2 border-brand-700/40 px-4 py-2 font-semibold">
            <span>Total disponible</span>
            <span className="tabular-nums">{rd(total)}</span>
          </div>
        </Card>
      )}
    </>
  )
}
