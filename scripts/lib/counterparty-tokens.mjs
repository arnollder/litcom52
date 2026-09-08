import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const TOKENS_PATH = resolve(ROOT_DIR, 'data/counterparty-tokens.json')
const COUNTERPARTIES_PATH = resolve(ROOT_DIR, 'data/counterparties.json')

/** @type {{ map: Map<string, { id: string, name: string }>, loadedAt: number } | null} */
let cache = null
const CACHE_TTL_MS = 30_000

/**
 * Compact raw input: lowercase, drop parentheticals and separators.
 */
function compactCounterpartyToken(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

/**
 * Normalize a human-entered group token.
 * "Белый День" / "ДвеNAшка" / "NA берегу (Заволжье)" → "белыйдень" / "двенашка" / "наберегу"
 */
export function normalizeCounterpartyToken(raw) {
  return compactCounterpartyToken(raw).replace(/na/g, 'на')
}

async function readTokensFile() {
  const raw = await readFile(TOKENS_PATH, 'utf8')
  const parsed = JSON.parse(raw)
  const entries = parsed?.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {}
  const map = new Map()
  for (const [key, value] of Object.entries(entries)) {
    const id = String(value?.id || '').trim()
    const name = String(value?.name || '').trim()
    if (!id || !name) continue
    const row = { id, name }
    const compact = compactCounterpartyToken(key)
    const normalized = normalizeCounterpartyToken(key)
    if (compact) map.set(compact, row)
    if (normalized) map.set(normalized, row)
  }
  return map
}

async function loadTokenMap({ force = false } = {}) {
  const now = Date.now()
  if (!force && cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.map
  }
  const map = await readTokensFile()
  cache = { map, loadedAt: now }
  return map
}

async function loadContactById(id) {
  try {
    const raw = await readFile(COUNTERPARTIES_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const rows = Array.isArray(parsed?.rows) ? parsed.rows : []
    const row = rows.find((item) => String(item?.id || '') === id)
    return String(row?.contact || row?.phone || '').trim()
  } catch {
    return ''
  }
}

/**
 * Resolve counterparty by storefront token.
 * @param {string} rawToken
 * @returns {Promise<{ id: string, name: string, contact: string, token: string }>}
 */
export async function resolveCounterpartyByToken(rawToken) {
  const token = normalizeCounterpartyToken(rawToken)
  if (!token) {
    const error = new Error('Введите токен группы')
    error.status = 400
    throw error
  }

  const map = await loadTokenMap()
  const match = map.get(token)
  if (!match) {
    const error = new Error('Неверный токен группы')
    error.status = 401
    throw error
  }

  const contact = await loadContactById(match.id)
  return {
    id: match.id,
    name: match.name,
    contact,
    token,
  }
}
