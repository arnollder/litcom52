#!/usr/bin/env node

import { moyskladFetch } from './moysklad-env.mjs'
import { moySkladMomentToIso } from './moysklad-time.mjs'

const PAGE_SIZE = 100
const DEFAULT_LIMIT = 50

function uiHref(orderId) {
  return `https://online.moysklad.ru/app/#purchaseorder/edit?id=${orderId}`
}

function idFromHref(href = '') {
  const parts = String(href).split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

/**
 * Maps a MoySklad purchaseorder row for admin history.
 * @param {object} row
 */
export function mapPurchaseOrder(row) {
  const id = row?.id || idFromHref(row?.meta?.href)
  const shipped = typeof row?.shippedSum === 'number' ? row.shippedSum / 100 : 0
  const sum = typeof row?.sum === 'number' ? row.sum / 100 : null
  let receipt = 'open'
  if (sum != null && sum > 0 && shipped >= sum) receipt = 'received'
  else if (shipped > 0) receipt = 'partial'

  return {
    id,
    name: row?.name || '—',
    moment: moySkladMomentToIso(row?.moment) || null,
    description: row?.description || '',
    externalCode: row?.externalCode || '',
    applicable: Boolean(row?.applicable),
    sum,
    shippedSum: shipped,
    positionsCount: Number(row?.positions?.meta?.size) || 0,
    agent: {
      id: row?.agent?.id || idFromHref(row?.agent?.meta?.href) || null,
      name: row?.agent?.name || 'Поставщик не указан',
    },
    stateName: row?.state?.name || null,
    receipt,
    href: id ? uiHref(id) : 'https://online.moysklad.ru/app/#purchaseorder',
  }
}

async function fetchPurchaseOrderPositions(orderId) {
  const rows = []
  let offset = 0
  while (true) {
    const data = await moyskladFetch(
      `/entity/purchaseorder/${orderId}/positions?limit=${PAGE_SIZE}&offset=${offset}&expand=assortment`,
    )
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows.map((row) => {
    const qty = Number(row?.quantity) || 0
    const price = typeof row?.price === 'number' ? row.price / 100 : 0
    return {
      id: row?.id || null,
      name: row?.assortment?.name || 'Позиция',
      article: row?.assortment?.article || row?.assortment?.code || '',
      qty,
      price,
      sum: Math.round(qty * price * 100) / 100,
      shipped: Number(row?.shipped) || 0,
    }
  })
}

/**
 * Lists MoySklad «Заказы поставщикам» — same source as
 * https://online.moysklad.ru/app/#purchaseorder
 * @param {{ limit?: number }} [opts]
 */
export async function listPurchaseOrdersFromMoySklad({ limit = DEFAULT_LIMIT } = {}) {
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 200)
  const rows = []
  let offset = 0

  while (rows.length < cap) {
    const pageLimit = Math.min(PAGE_SIZE, cap - rows.length)
    const data = await moyskladFetch(
      `/entity/purchaseorder?limit=${pageLimit}&offset=${offset}&order=moment,desc&expand=agent,state`,
    )
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < pageLimit) break
    offset += chunk.length
  }

  return {
    orders: rows.map(mapPurchaseOrder),
    count: rows.length,
  }
}

/**
 * Full purchaseorder document with positions for in-admin invoice view.
 * @param {string} orderId
 */
export async function getPurchaseOrderFromMoySklad(orderId) {
  const id = String(orderId || '').trim()
  if (!id) {
    const error = new Error('Не указан id заказа поставщику')
    error.status = 400
    throw error
  }

  let row
  try {
    row = await moyskladFetch(
      `/entity/purchaseorder/${id}?expand=agent,state,positions.assortment`,
    )
  } catch (error) {
    if (error?.status === 404) {
      const notFound = new Error('Заказ поставщику не найден в МойСклад')
      notFound.status = 404
      throw notFound
    }
    throw error
  }

  const mapped = mapPurchaseOrder(row)
  let positions = Array.isArray(row?.positions?.rows)
    ? row.positions.rows.map((pos) => {
        const qty = Number(pos?.quantity) || 0
        const price = typeof pos?.price === 'number' ? pos.price / 100 : 0
        return {
          id: pos?.id || null,
          name: pos?.assortment?.name || 'Позиция',
          article: pos?.assortment?.article || pos?.assortment?.code || '',
          qty,
          price,
          sum: Math.round(qty * price * 100) / 100,
          shipped: Number(pos?.shipped) || 0,
        }
      })
    : []

  if (!positions.length && mapped.positionsCount > 0) {
    positions = await fetchPurchaseOrderPositions(id)
  }

  return {
    ...mapped,
    positions,
  }
}
