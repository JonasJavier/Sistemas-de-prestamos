import type { LoanProduct } from '../api/lending'

/** Loan conditions as typed in a form, and their simulator request. */

export interface Conditions {
  productId: string
  amount: string
  installments: string
  frequency: string
  rate: string
}

export const EMPTY_CONDITIONS: Conditions = {
  productId: '',
  amount: '',
  installments: '',
  frequency: '',
  rate: '',
}

export function toRequest(value: Conditions) {
  return value.productId && value.amount && value.installments && value.frequency
    ? {
        product: value.productId,
        amount: value.amount,
        installments: Number(value.installments),
        frequency: value.frequency,
        rate: value.rate || undefined,
      }
    : null
}

/** The first active product with its defaults, so a form starts useful. */
export function startingConditions(products: LoanProduct[]): Conditions {
  const first = products.find((product) => product.is_active)
  return first
    ? {
        productId: first.id,
        amount: String(Number(first.min_amount)),
        installments: String(first.min_term),
        frequency: first.allowed_frequencies[0] ?? '',
        rate: first.default_rate ?? first.min_rate,
      }
    : EMPTY_CONDITIONS
}
