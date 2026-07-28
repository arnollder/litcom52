#!/usr/bin/env node

import { moyskladFetch } from './moysklad-env.mjs'

const PAGE_SIZE = 100

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

/**
 * Returns free stock map from MoySklad assortment.
 * Free stock excludes reserved units (quantity = stock - reserve).
 */
export async function fetchLiveStockMap() {
  const rows = await fetchAssortmentRows()
  const stockById = {}

  for (const item of rows) {
    if (!item?.id || item.archived) continue
    stockById[String(item.id)] = parseFreeStock(item)
  }

  return {
    updatedAt: new Date().toISOString(),
    stockById,
    count: Object.keys(stockById).length,
  }
}
