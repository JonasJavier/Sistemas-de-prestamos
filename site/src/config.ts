/** Where the app lives (doc 10: app.cobradia.com) and how to reach us. */
export const APP_URL = (import.meta.env.PUBLIC_APP_URL ?? 'https://app.cobradia.com').replace(
  /\/$/,
  '',
)
export const SIGN_UP = `${APP_URL}/registro`
export const SIGN_IN = `${APP_URL}/entrar`
export const CONTACT_EMAIL = 'hola@cobradia.com'
export const TRIAL_DAYS = 30
/** Version of the terms and the privacy notice (decision 102). */
export const LEGAL_UPDATED = '9 de octubre de 2026'
