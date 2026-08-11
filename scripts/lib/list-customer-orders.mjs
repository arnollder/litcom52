#!/usr/bin/env node

import { moyskladFetch } from './moysklad-env.mjs'
import {
  isPaidLikeStatus,
  mapMoySkladStateToStatus,
} from './customer-order-state.mjs'
import { isStorefrontOrderComment } from './storefront-order-comment.mjs'

const PAGE_SIZE = 100
const DEFAULT_LIMIT = 100

function uiHref(orderId) {
  return `https://online.moysklad.ru/app/#customerorder/edit?id=${orderId}`
}

function momentToIso(moment) {
  if (!moment) return null
  // MoySklad: "2026-07-29 20:07:00.000"
  const normalized = String(moment).replace(' ', 'T')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? String(moment) : date.toISOString()
}

function mapPosition(row) {
  const price = typeof row?.price === 'number' ? row.price / 100 : 0
  return {
    id: row?.assortment?.id || null,
    name: row?.assortment?.name || 'Позиция',
    qty: Number(row?.quantity) || 0,
    price,
    reserve: Number(row?.reserve) || 0,
  }
}

async function fetchPositions(orderId) {
  const rows = []
  let offset = 0
  while (true) {
    const data = await moyskladFetch(
      `/entity/customerorder/${orderId}/positions?limit=${PAGE_SIZE}&offset=${offset}&expand=assortment`,
    )
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows.map(mapPosition)
}

/**
 * Maps a MoySklad customerorder row into the admin inbox shape.
 */
export async function mapCustomerOrderToAdmin(row, { positions } = {}) {
  const stateName = row?.state?.name || null
  const mappedStatus = mapMoySkladStateToStatus(stateName)
  const status = mappedStatus || 'new'
  const description = row?.description || ''

  let items = Array.isArray(positions) ? positions : null
  if (!items && Array.isArray(row?.positions?.rows) && row.positions.rows.length) {
    items = row.positions.rows.map(mapPosition)
  }
  if (!items) {
    const size = Number(row?.positions?.meta?.size)
    if (Number.isFinite(size) && size > 0) {
      items = await fetchPositions(row.id)
    } else {
      items = []
    }
  }

  return {
    id: row.id,
    createdAt: momentToIso(row.moment) || new Date().toISOString(),
    status,
    customer: {
      counterparty: {
        id: row?.agent?.id || null,
        name: row?.agent?.name || 'Контрагент не указан',
      },
      contact: '',
    },
    items,
    total: typeof row?.sum === 'number' ? row.sum / 100 : null,
    comment: description,
    fromStorefront: isStorefrontOrderComment(description),
    canShip: isPaidLikeStatus(status, stateName) && status !== 'shipped',
    moySklad: {
      id: row.id,
      name: row.name,
      href: uiHref(row.id),
      stateName,
      payedSum: typeof row?.payedSum === 'number' ? row.payedSum / 100 : 0,
      shippedSum: typeof row?.shippedSum === 'number' ? row.shippedSum / 100 : 0,
    },
  }
}

/**
 * Lists MoySklad «Заказы покупателей» for the admin inbox.
 * Newest first — same source as the MoySklad customer orders section.
 */
export async function listCustomerOrdersForAdmin({ limit = DEFAULT_LIMIT } = {}) {
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 500)
  const rows = []
  let offset = 0

  while (rows.length < cap) {
    const pageLimit = Math.min(PAGE_SIZE, cap - rows.length)
    const data = await moyskladFetch(
      `/entity/customerorder?limit=${pageLimit}&offset=${offset}&order=moment,desc&expand=agent,state,positions.assortment`,
    )
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < pageLimit) break
    offset += chunk.length
  }

  const orders = []
  for (const row of rows) {
    // Sequential mapping avoids bursting dozens of position fetches into the MoySklad queue.
    orders.push(await mapCustomerOrderToAdmin(row))
  }

  return {
    orders,
    count: orders.length,
    newCount: orders.filter((order) => order.status === 'new').length,
  }
}

/**
 * Loads one customer order by MoySklad id in admin shape.
 */
export async function getCustomerOrderForAdmin(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return null
  const row = await moyskladFetch(
    `/entity/customerorder/${id}?expand=agent,state,positions.assortment`,
  )
  return mapCustomerOrderToAdmin(row)
}
