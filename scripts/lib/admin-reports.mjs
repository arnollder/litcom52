#!/usr/bin/env node

import { moyskladFetch } from './moysklad-env.mjs'

const PAGE_SIZE = 100

function toMomentStart(dateValue) {
  if (!dateValue) return null
  return `${dateValue} 00:00:00`
}

function toMomentEnd(dateValue) {
  if (!dateValue) return null
  return `${dateValue} 23:59:59`
}

function buildMomentFilter(fromDate, toDate) {
  const filters = []
  const fromMoment = toMomentStart(fromDate)
  const toMoment = toMomentEnd(toDate)
  if (fromMoment) filters.push(`moment>=${fromMoment}`)
  if (toMoment) filters.push(`moment<=${toMoment}`)
  return filters.join(';')
}

function parseMomentToTs(momentValue) {
  if (!momentValue) return null
  const normalized = String(momentValue).replace(' ', 'T')
  const ts = new Date(normalized).getTime()
  return Number.isFinite(ts) ? ts : null
}

function inDateRange(momentValue, fromDate, toDate) {
  const ts = parseMomentToTs(momentValue)
  if (!Number.isFinite(ts)) return false
  const fromTs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null
  const toTs = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null
  if (fromTs !== null && ts < fromTs) return false
  if (toTs !== null && ts > toTs) return false
  return true
}

async function sumCustomerOrdersSold(fromDate, toDate) {
  let offset = 0
  let total = 0
  const filter = buildMomentFilter(fromDate, toDate)
  const soldStates = new Set(['Оплачен', 'Отгружен'])

  while (true) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      expand: 'state',
      ...(filter ? { filter } : {}),
    })
    const data = await moyskladFetch(`/entity/customerorder?${query.toString()}`)
    const rows = Array.isArray(data?.rows) ? data.rows : []
    for (const row of rows) {
      // Keep strict filtering on our side to avoid API-side filter quirks.
      if (!inDateRange(row?.moment, fromDate, toDate)) continue
      if (!soldStates.has(String(row?.state?.name || '').trim())) continue
      total += (Number(row?.sum) || 0) / 100
    }
    if (rows.length < PAGE_SIZE) break
    offset += rows.length
  }

  return total
}

async function sumSupplies(fromDate, toDate) {
  let offset = 0
  let total = 0
  const filter = buildMomentFilter(fromDate, toDate)

  while (true) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      ...(filter ? { filter } : {}),
    })
    const data = await moyskladFetch(`/entity/supply?${query.toString()}`)
    const rows = Array.isArray(data?.rows) ? data.rows : []
    for (const row of rows) {
      if (!inDateRange(row?.moment, fromDate, toDate)) continue
      total += (Number(row?.sum) || 0) / 100
    }
    if (rows.length < PAGE_SIZE) break
    offset += rows.length
  }

  return total
}

async function sumStockValue() {
  let offset = 0
  let totalStockValue = 0

  while (true) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      stockMode: 'all',
    })
    const data = await moyskladFetch(`/entity/assortment?${query.toString()}`)
    const rows = Array.isArray(data?.rows) ? data.rows : []
    for (const row of rows) {
      // Actual warehouse stock only (without reserve).
      const stock = Math.max(0, Number(row?.stock) || 0)
      const priceKopecks = Number(row?.salePrices?.[0]?.value)
      const unitPriceRub = Number.isFinite(priceKopecks) ? priceKopecks / 100 : 0
      totalStockValue += stock * unitPriceRub
    }
    if (rows.length < PAGE_SIZE) break
    offset += rows.length
  }

  return totalStockValue
}

function stockValueFromRows(rows) {
  let total = 0
  for (const row of rows) {
    // Actual warehouse stock only (without reserve).
    const stock = Math.max(0, Number(row?.stock) || 0)
    const priceKopecks = Number(row?.salePrice || row?.price || row?.salePrices?.[0]?.value)
    const unitPriceRub = Number.isFinite(priceKopecks) ? priceKopecks / 100 : 0
    total += stock * unitPriceRub
  }
  return total
}

async function sumStockAtPeriodEnd(toDate) {
  if (!toDate) {
    return sumStockValue()
  }

  const moment = toMomentEnd(toDate)
  let offset = 0
  const rows = []

  // Snapshot at date-end from stock report endpoint.
  while (true) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      filter: `moment=${moment}`,
    })
    const data = await moyskladFetch(`/report/stock/all?${query.toString()}`)
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    offset += chunk.length
  }

  return stockValueFromRows(rows)
}

export async function getAdminReportMetrics({ fromDate = '', toDate = '' } = {}) {
  // Run sequentially: parallel pages easily hit MoySklad concurrent request limits (429/1073).
  const soldShipped = await sumCustomerOrdersSold(fromDate, toDate)
  const purchasedSupplies = await sumSupplies(fromDate, toDate)
  const stockTotal = await sumStockAtPeriodEnd(toDate)

  return {
    soldShipped,
    purchasedSupplies,
    stockTotal,
  }
}
