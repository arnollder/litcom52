import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const PAYMENT_PATH = resolve(ROOT_DIR, 'data/payment-details.json')

/** @type {{ details: object, loadedAt: number } | null} */
let cache = null
const CACHE_TTL_MS = 30_000

function fromEnv() {
  const phone = String(process.env.PAYMENT_PHONE || '').trim()
  const method = String(process.env.PAYMENT_METHOD || '').trim()
  const recipient = String(process.env.PAYMENT_RECIPIENT || '').trim()
  const phoneLabel = String(process.env.PAYMENT_PHONE_LABEL || '').trim()
  if (!phone || !method || !recipient) return null
  return {
    method,
    phone,
    phoneLabel: phoneLabel || phone,
    recipient,
  }
}

async function fromFile() {
  const raw = await readFile(PAYMENT_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  const method = String(parsed?.method || '').trim()
  const phone = String(parsed?.phone || '').trim()
  const recipient = String(parsed?.recipient || '').trim()
  const phoneLabel = String(parsed?.phoneLabel || '').trim()
  if (!method || !phone || !recipient) {
    const error = new Error('Реквизиты оплаты на сервере заполнены не полностью')
    error.status = 503
    throw error
  }
  return {
    method,
    phone,
    phoneLabel: phoneLabel || phone,
    recipient,
  }
}

/**
 * Payment details are server-only — never ship in the public JS bundle.
 * Prefer env overrides, fall back to data/payment-details.json.
 */
export async function getPaymentDetails() {
  const now = Date.now()
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.details
  }

  const envDetails = fromEnv()
  const details = envDetails || (await fromFile())
  cache = { details, loadedAt: now }
  return details
}
