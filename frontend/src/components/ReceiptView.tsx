import type { Receipt } from '../api/payments'
import { day, documentText, moment, rd } from '../lib/format'

/** The receipt (doc 09): breakdown by installment and component, waivers
 * apart, the exact total, change and the balance after. The same markup
 * prints on a letter page or on an 80 mm thermal roll. */
export function ReceiptView({ receipt, thermal = false }: { receipt: Receipt; thermal?: boolean }) {
  const r = receipt
  const company = r.company.trade_name || r.company.name
  // A column of dashes says nothing: charges show only when some were paid.
  const showCharges = !thermal && r.lines.some((line) => Number(line.charges))
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <span className="min-w-0 text-muted print:text-black">{label}</span>
      <span className="shrink-0 whitespace-nowrap text-right tabular-nums">{value}</span>
    </div>
  )
  return (
    <article
      className={`relative mx-auto space-y-3 bg-white text-[13px] text-black ${
        thermal
          ? 'w-[72mm] p-1 font-mono text-[11px]'
          : 'max-w-2xl rounded-xl border border-edge p-6 shadow-sm print:border-0 print:shadow-none'
      }`}
    >
      {r.status === 'reversed' ? (
        <div
          aria-label="Reversado"
          className="pointer-events-none absolute inset-0 grid place-items-center text-5xl font-black uppercase tracking-widest text-danger-600/25 -rotate-12"
        >
          Reversado
        </div>
      ) : null}
      <header className={thermal ? 'text-center' : 'flex items-start justify-between gap-4'}>
        <div>
          <div className="text-base font-bold">{company}</div>
          {r.company.trade_name && r.company.name !== r.company.trade_name ? (
            <div className="text-[11px]">{r.company.name}</div>
          ) : null}
          <div className="text-[11px]">
            {r.company.rnc ? `RNC ${r.company.rnc} · ` : ''}
            {r.branch.name}
            {r.branch.address ? ` · ${r.branch.address}` : ''}
            {r.company.phone ? ` · Tel. ${r.company.phone}` : ''}
          </div>
        </div>
        <div className={thermal ? 'mt-1' : 'text-right'}>
          <div className="text-sm font-bold uppercase tracking-wide">Recibo de pago</div>
          <div className="tabular-nums">{r.number}</div>
          <div className="text-[11px]">{moment(r.paid_at)}</div>
        </div>
      </header>

      <section className="space-y-0.5 border-y border-black/20 py-2">
        {row('Cliente', r.customer.name)}
        {row('Documento', documentText(r.customer.document))}
        {row('Préstamo', `${r.loan.number} · ${r.loan.product}`)}
        {row('Concepto', r.kind_label)}
      </section>

      <table className="w-full tabular-nums">
        <thead className="text-left text-[11px] uppercase">
          <tr>
            <th className="py-0.5">Cuota</th>
            {showCharges ? <th className="text-right">Cargos</th> : null}
            <th className="text-right">Mora</th>
            <th className="text-right">Interés</th>
            <th className="text-right">Capital</th>
            {!thermal ? <th className="text-right">Total</th> : null}
          </tr>
        </thead>
        <tbody>
          {r.lines.map((line) => (
            <tr key={line.number} className="border-t border-black/10">
              <td className="py-0.5">
                {line.number}
                {/* On a phone the date would push the figures off the screen. */}
                {!thermal ? (
                  <span className="ml-1 hidden text-[11px] sm:inline print:inline">
                    ({day(line.due_date)})
                  </span>
                ) : null}
              </td>
              {showCharges ? (
                <td className="text-right">
                  {Number(line.charges) ? rd(line.charges).slice(4) : '—'}
                </td>
              ) : null}
              <td className="text-right">
                {Number(line.late_fee) ? rd(line.late_fee).slice(4) : '—'}
              </td>
              <td className="text-right">
                {Number(line.interest) ? rd(line.interest).slice(4) : '—'}
              </td>
              <td className="text-right">
                {Number(line.principal) ? rd(line.principal).slice(4) : '—'}
              </td>
              {!thermal ? (
                <td className="text-right font-medium">{rd(line.total).slice(4)}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="space-y-0.5 border-t border-black/30 pt-2">
        {Number(r.totals.charges) ? row('Cargos', rd(r.totals.charges)) : null}
        {Number(r.totals.late_fee) ? row('Mora', rd(r.totals.late_fee)) : null}
        {row('Interés', rd(r.totals.interest))}
        {row('Capital', rd(r.totals.principal))}
        {Number(r.late_fee_waived)
          ? row('Mora condonada (no se cobra)', rd(r.late_fee_waived))
          : null}
        {Number(r.discount) ? row('Descuento autorizado', rd(r.discount)) : null}
        {Number(r.interest_waived) ? row('Interés futuro condonado', rd(r.interest_waived)) : null}
        <div className="flex justify-between gap-3 border-t border-black/30 pt-1 text-base font-bold">
          <span>Total pagado</span>
          <span className="tabular-nums">{rd(r.amount)}</span>
        </div>
        {r.method === 'cash' ? (
          <>
            {row('Recibido', rd(r.received))}
            {Number(r.change) ? row('Cambio', rd(r.change)) : null}
          </>
        ) : (
          row('Referencia', r.reference || '—')
        )}
        {row('Forma de pago', r.method_label)}
      </section>

      <section className="space-y-0.5 border-t border-black/20 pt-2">
        {row('Capital pendiente después del pago', rd(r.principal_after), true)}
        {row('Saldo total por cuotas', rd(r.owed_after))}
      </section>

      {r.reversed ? (
        <p className="rounded border border-danger-600/40 p-2 text-[12px] text-danger-600">
          Reversado el {day(r.reversed.on)}: {r.reversed.reason}.
          {r.reversed.replacement ? ` Lo reemplaza el recibo ${r.reversed.replacement}.` : ''}
        </p>
      ) : null}
      {r.replaces ? <p className="text-[12px]">Corrige el recibo {r.replaces}.</p> : null}

      <footer className="pt-2 text-center text-[11px]">
        {r.qr ? (
          // Decision 098: the receipt's public page, to check it is authentic.
          <img src={r.qr} alt="Código para verificar el recibo" className="mx-auto mb-1 size-20" />
        ) : null}
        {r.collected_by ? `Cobró: ${r.collected_by} · ` : ''}Conserve este recibo.
        <div className="mt-1 opacity-70">Generado con Cobradía</div>
      </footer>
    </article>
  )
}
