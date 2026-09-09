#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { moyskladFetch } from './moysklad-env.mjs'

const PAGE_SIZE = 100
const STOCK_TTL_MS = Number(process.env.STOCK_CACHE_TTL_MS || 20_000)

/** @type {{ payload: object, etag: string, loadedAt: number } | null} */
let stockCache = null

function parseFreeStock(item) {
  if (typeof item.quantity === 'number') {
    return Math.max(0, Math.floor(item.quantity))
  }
  const stock = typeof item.stock === 'number' ? item.stock : 0
  const reserve = typeof item.reserve === 'number' ? item.reserve : 0
  return Math.max(0, Math.floor(stock - reserve))
}

async function fetchAssortmentRows() {
  const rows = []
  let offset = 0

  while (true) {
    const data = await moyskladFetch(`/entity/assortment?limit=${PAGE_SIZE}&offset=${offset}`)
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

function buildStockPayload(rows) {
  const stockById = {}
  for (const item of rows) {
    if (!item?.id || item.archived) continue
    stockById[String(item.id)] = parseFreeStock(item)
  }
  const payload = {
    updatedAt: new Date().toISOString(),
    stockById,
    count: Object.keys(stockById).length,
  }
  const etag = `"${createHash('sha1').update(JSON.stringify(stockById)).digest('hex')}"`
  return { payload, etag }
}

/**
 * Returns free stock map from MoySklad assortment.
 * Free stock excludes reserved units (quantity = stock - reserve).
 * Cached briefly to absorb shop polling without hammering MoySklad.
 */
export async function fetchLiveStockMap({ force = false } = {}) {
  const now = Date.now()
  if (!force && stockCache && now - stockCache.loadedAt < STOCK_TTL_MS) {
    return { ...stockCache.payload, etag: stockCache.etag, cached: true }
  }

  const rows = await fetchAssortmentRows()
  const { payload, etag } = buildStockPayload(rows)
  stockCache = { payload, etag, loadedAt: now }
  return { ...payload, etag, cached: false }
}
