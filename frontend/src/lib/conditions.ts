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
