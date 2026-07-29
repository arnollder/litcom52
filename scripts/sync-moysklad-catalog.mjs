#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '..')
const ENV_PATH = resolve(ROOT_DIR, '.env')
const OUTPUT_PATH = resolve(ROOT_DIR, 'src/data/catalog.json')
const PAGE_SIZE = 100

function parseEnvLine(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const idx = trimmed.indexOf('=')
  if (idx <= 0) return null
  const key = trimmed.slice(0, idx).trim()
  let value = trimmed.slice(idx + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

async function loadEnvFromFile() {
  try {
    const raw = await readFile(ENV_PATH, 'utf8')
    for (const line of raw.split('\n')) {
      const entry = parseEnvLine(line)
      if (!entry) continue
      const [key, value] = entry
      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // .env is optional if env vars are already set.
  }
}

function getAuthHeader() {
  const token = process.env.MOYSKLAD_TOKEN
  const login = process.env.MOYSKLAD_LOGIN
  const password = process.env.MOYSKLAD_PASSWORD

  if (token) {
    return `Bearer ${token}`
  }

  if (login && password) {
    const credentials = Buffer.from(`${login}:${password}`, 'utf8').toString('base64')
    return `Basic ${credentials}`
  }

  throw new Error(
    'Provide either MOYSKLAD_TOKEN or both MOYSKLAD_LOGIN and MOYSKLAD_PASSWORD in .env',
  )
}

function parsePrice(item) {
  const raw = item.salePrices?.[0]?.value
  if (typeof raw !== 'number') return 0
  return Number((raw / 100).toFixed(2))
}

function parseStock(item) {
  // MoySklad assortment:
  // - stock: physical stock
  // - reserve: reserved
  // - quantity: free stock (stock - reserve)
  // Catalog "в наличии" must exclude reserved units.
  if (typeof item.quantity === 'number') {
    return Math.max(0, Math.floor(item.quantity))
  }

  const stock = typeof item.stock === 'number' ? item.stock : 0
  const reserve = typeof item.reserve === 'number' ? item.reserve : 0
  return Math.max(0, Math.floor(stock - reserve))
}

function stripCategoryNumber(name) {
  return String(name || '')
    .replace(/^\d+[\s.\-–—_]*/u, '')
    .trim() || String(name || '').trim()
}

function categorySortKey(name) {
  const raw = String(name || '').trim()
  const match = raw.match(/^(\d+)/u)
  return {
    order: match ? Number(match[1]) : Number.POSITIVE_INFINITY,
    raw,
  }
}

function compareCategoriesByMoySkladOrder(a, b) {
  if (a.order !== b.order) return a.order - b.order
  return a.raw.localeCompare(b.raw, 'ru')
}

function categoryNameFromItem(item, categoryByHref) {
  const href = item.productFolder?.meta?.href
  if (href && categoryByHref.has(href)) return categoryByHref.get(href)
  if (typeof item.pathName === 'string' && item.pathName.trim()) {
    return item.pathName.split('/')[0].trim()
  }
  return 'Без категории'
}

async function fetchPaged(baseUrl, authHeader, endpoint, extraParams = '') {
  const rows = []
  let offset = 0

  while (true) {
    const url = `${baseUrl}${endpoint}?limit=${PAGE_SIZE}&offset=${offset}${extraParams}`
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
        Accept: 'application/json;charset=utf-8',
      },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Request failed (${response.status}) for ${endpoint}: ${body}`)
    }

    const data = await response.json()
    const chunk = Array.isArray(data.rows) ? data.rows : []
    rows.push(...chunk)

    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

function makeStarterSet(existingCatalog) {
  const oldStarterArray = Array.isArray(existingCatalog?.starterSet) ? existingCatalog.starterSet : []
  const items = oldStarterArray
    .filter((entry) => entry && typeof entry.name === 'string')
    .map((entry) => ({ name: entry.name, qty: Number(entry.qty) > 0 ? Number(entry.qty) : 1 }))

  return {
    title: 'Стартовый набор',
    description: 'Быстрое добавление базового комплекта в корзину.',
    note: 'Набор автоматически учитывает текущие остатки.',
    alternatives: [['"Базовый текст" в твёрдой обложке', '"Базовый текст" в мягкой обложке']],
    items,
  }
}

function buildCatalog(categories, assortment, existingCatalog) {
  // Keep raw MoySklad folder names (with numeric prefixes) for order;
  // strip numbers only when writing display names into catalog.json.
  const categoryByHref = new Map(
    categories
      .filter((row) => row?.meta?.href && row?.name)
      .map((row) => [row.meta.href, String(row.name).trim()]),
  )

  const grouped = new Map()
  for (const item of assortment) {
    if (!item || !item.name || item.archived) continue
    const rawCategory = categoryNameFromItem(item, categoryByHref)
    if (!grouped.has(rawCategory)) grouped.set(rawCategory, [])

    grouped.get(rawCategory).push({
      id: item.id,
      name: item.name,
      price: parsePrice(item),
      stock: parseStock(item),
    })
  }

  const sortedCategories = Array.from(grouped.entries())
    .map(([rawCategory, products]) => ({
      rawCategory,
      sortKey: categorySortKey(rawCategory),
      products,
    }))
    .sort((a, b) => compareCategoriesByMoySkladOrder(a.sortKey, b.sortKey))
    .map(({ rawCategory, products }) => ({
      category: stripCategoryNumber(rawCategory),
      products: products.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    }))

  return {
    categories: sortedCategories,
    starterSet: makeStarterSet(existingCatalog),
  }
}

async function main() {
  await loadEnvFromFile()

  const authHeader = getAuthHeader()
  const baseUrl = (process.env.MOYSKLAD_BASE_URL || 'https://api.moysklad.ru/api/remap/1.2').replace(/\/+$/, '')
  const stockMode = process.env.MOYSKLAD_STOCK_MODE || 'all'

  const existingRaw = await readFile(OUTPUT_PATH, 'utf8')
  const existingCatalog = JSON.parse(existingRaw)

  const categories = await fetchPaged(baseUrl, authHeader, '/entity/productfolder')
  const assortmentParams = stockMode === 'all' ? '' : `&stockMode=${encodeURIComponent(stockMode)}`
  const assortment = await fetchPaged(baseUrl, authHeader, '/entity/assortment', assortmentParams)

  const nextCatalog = buildCatalog(categories, assortment, existingCatalog)
  await writeFile(OUTPUT_PATH, `${JSON.stringify(nextCatalog, null, 2)}\n`, 'utf8')

  const productCount = nextCatalog.categories.reduce((sum, cat) => sum + cat.products.length, 0)
  console.log(
    `Catalog synced: ${nextCatalog.categories.length} categories, ${productCount} products -> src/data/catalog.json`,
  )
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
