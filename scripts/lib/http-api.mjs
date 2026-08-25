#!/usr/bin/env node

import {
  appendOrder,
  getOrderById,
  updateOrderStatus,
} from './orders-store.mjs'
import { createReservedCustomerOrder } from './create-customer-order.mjs'
import {
  fetchCustomerOrderSnapshot,
  isPaidLikeStatus,
  setCustomerOrderState,
} from './customer-order-state.mjs'
import { createDemandFromCustomerOrder } from './create-demand-from-customer-order.mjs'
import {
  getCustomerOrderForAdmin,
  listCustomerOrdersForAdmin,
} from './list-customer-orders.mjs'
import { fetchLiveStockMap } from './fetch-stock.mjs'
import { getAdminReportMetrics } from './admin-reports.mjs'
import { loadEnvFromFile } from './moysklad-env.mjs'

export function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(payload))
}

export async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

export function pathOnly(url = '') {
  return decodeURIComponent((url || '').split('?')[0] || '/')
}

function corsPreflight(res, methods) {
  res.statusCode = 204
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token')
  res.end()
}

function getAdminToken() {
  return String(process.env.ADMIN_TOKEN || '').trim()
}

function extractBearer(req) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (match) return match[1].trim()
  return String(req.headers['x-admin-token'] || '').trim()
}

function assertAdmin(req) {
  const expected = getAdminToken()
  if (!expected) {
    const error = new Error('ADMIN_TOKEN не задан на сервере. Добавьте его в .env')
    error.status = 503
    throw error
  }
  const provided = extractBearer(req)
  if (!provided || provided !== expected) {
    const error = new Error('Неверный токен администратора')
    error.status = 401
    throw error
  }
}

function mapErrorStatus(error) {
  const status = error?.status && Number.isInteger(error.status) ? error.status : 500
  return status >= 400 && status < 600 ? status : 500
}

export async function handleReserveOrder(req, res) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'POST, OPTIONS')
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    await loadEnvFromFile()
    const body = await readJsonBody(req)
    const result = await createReservedCustomerOrder({
      counterpartyId: body.counterpartyId,
      counterpartyName:
        body.counterpartyName || body.customer?.counterparty?.name || body.customer?.name || '',
      items: body.items,
      comment: body.comment,
    })

    let inboxOrder = null
    try {
      inboxOrder = await appendOrder({
        createdAt: body.createdAt || new Date().toISOString(),
        customer: body.customer || null,
        items: body.items,
        total: body.total,
        comment: result.description || body.comment || '',
        moySklad: result,
      })
    } catch (storeError) {
      console.error('[orders-store] failed to persist order', storeError)
    }

    sendJson(res, 200, { ok: true, order: result, inbox: inboxOrder })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reserve failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

export async function handleStock(req, res) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, OPTIONS')
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    await loadEnvFromFile()
    const result = await fetchLiveStockMap()
    sendJson(res, 200, { ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stock fetch failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

async function applyAdminStatus(orderId, requestedStatus) {
  const status = String(requestedStatus || '').trim()
  const moySkladId = String(orderId || '').trim()
  if (!moySkladId) {
    const error = new Error('Не указан id заказа')
    error.status = 400
    throw error
  }

  // Prefer MoySklad id (admin list is sourced from customerorder).
  // Fall back to local store lookup for older inbox UUIDs.
  let resolvedMoySkladId = moySkladId
  const local = await getOrderById(moySkladId)
  if (local?.moySklad?.id) {
    resolvedMoySkladId = local.moySklad.id
  }

  if (status === 'paid') {
    const ms = await setCustomerOrderState(resolvedMoySkladId, 'Оплачен')
    if (local) {
      await updateOrderStatus(local.id, 'paid', {
        moySklad: {
          id: ms.id,
          name: ms.name,
          href: ms.href,
          stateName: ms.stateName,
        },
      })
    }
    return getCustomerOrderForAdmin(resolvedMoySkladId)
  }

  if (status === 'shipped') {
    const snapshot = await fetchCustomerOrderSnapshot(resolvedMoySkladId)
    if (!isPaidLikeStatus(snapshot.status, snapshot.stateName)) {
      const error = new Error(
        `Отгрузка недоступна: в МойСклад статус «${snapshot.stateName || 'не задан'}», нужен «Оплачен».`,
      )
      error.status = 409
      throw error
    }

    // Create Отгрузка (demand) before flipping the workflow state.
    let demand = null
    try {
      demand = await createDemandFromCustomerOrder(resolvedMoySkladId)
    } catch (error) {
      console.error('[demand] failed to create shipment for', resolvedMoySkladId, error)
      throw error
    }

    const ms = await setCustomerOrderState(resolvedMoySkladId, 'Отгружен')
    if (local) {
      await updateOrderStatus(local.id, 'shipped', {
        moySklad: {
          id: ms.id,
          name: ms.name,
          href: ms.href,
          stateName: ms.stateName,
          demandId: demand?.id || null,
          demandName: demand?.name || null,
          demandHref: demand?.href || null,
        },
      })
    }
    return getCustomerOrderForAdmin(resolvedMoySkladId)
  }

  const error = new Error('Некорректный статус. Допустимо: paid, shipped')
  error.status = 400
  throw error
}

export async function handleAdminOrders(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, PATCH, OPTIONS')
    return
  }

  try {
    await loadEnvFromFile()
    assertAdmin(req)

    if (pathname === '/api/admin/orders' && req.method === 'GET') {
      const listed = await listCustomerOrdersForAdmin({ limit: 100 })
      sendJson(res, 200, {
        ok: true,
        orders: listed.orders,
        count: listed.count,
        newCount: listed.newCount,
        source: 'moysklad-customerorder',
      })
      return
    }

    const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/)
    if (match && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      const order = await applyAdminStatus(match[1], body.status)
      sendJson(res, 200, { ok: true, order })
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin orders failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

export async function handleAdminReports(req, res) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, OPTIONS')
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    await loadEnvFromFile()
    assertAdmin(req)

    const url = new URL(req.url || '/api/admin/reports', 'http://localhost')
    const fromDate = String(url.searchParams.get('fromDate') || '').trim()
    const toDate = String(url.searchParams.get('toDate') || '').trim()
    const metrics = await getAdminReportMetrics({ fromDate, toDate })

    sendJson(res, 200, {
      ok: true,
      fromDate,
      toDate,
      metrics,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin reports failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

/**
 * Returns true if the request was handled.
 */
export async function handleApiRequest(req, res) {
  const pathname = pathOnly(req.url || '/')

  if (pathname === '/api/orders/reserve') {
    await handleReserveOrder(req, res)
    return true
  }
  if (pathname === '/api/stock') {
    await handleStock(req, res)
    return true
  }
  if (pathname === '/api/admin/orders' || pathname.startsWith('/api/admin/orders/')) {
    await handleAdminOrders(req, res, pathname)
    return true
  }
  if (pathname === '/api/admin/reports') {
    await handleAdminReports(req, res)
    return true
  }
  return false
}
