#!/usr/bin/env node

import {
  appendOrder,
  getOrderById,
  listOrders,
  saveOrder,
  updateOrderStatus,
} from './orders-store.mjs'
import { createReservedCustomerOrder } from './create-customer-order.mjs'
import {
  fetchCustomerOrderSnapshot,
  isPaidLikeStatus,
  setCustomerOrderState,
} from './customer-order-state.mjs'
import { fetchLiveStockMap } from './fetch-stock.mjs'
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

async function enrichOrderFromMoySklad(order) {
  const moySkladId = order?.moySklad?.id
  if (!moySkladId) {
    return {
      ...order,
      canShip: false,
    }
  }

  try {
    const snapshot = await fetchCustomerOrderSnapshot(moySkladId)
    const nextStatus = snapshot.status || order.status
    const enriched = {
      ...order,
      status: nextStatus,
      canShip: isPaidLikeStatus(nextStatus, snapshot.stateName) && nextStatus !== 'shipped',
      moySklad: {
        ...(order.moySklad || {}),
        id: snapshot.id,
        name: snapshot.name || order.moySklad?.name || null,
        href: snapshot.href || order.moySklad?.href || null,
        stateName: snapshot.stateName,
        payedSum: snapshot.payedSum,
        shippedSum: snapshot.shippedSum,
      },
    }

    if (
      enriched.status !== order.status ||
      enriched.moySklad.stateName !== order.moySklad?.stateName
    ) {
      const { canShip: _canShip, moySkladSyncError: _syncError, ...persistable } = enriched
      await saveOrder({
        ...persistable,
        updatedAt: new Date().toISOString(),
      })
    }

    return enriched
  } catch (error) {
    console.error('[admin-orders] MoySklad sync failed for', moySkladId, error)
    return {
      ...order,
      canShip: isPaidLikeStatus(order.status, order.moySklad?.stateName) && order.status !== 'shipped',
      moySkladSyncError:
        error instanceof Error ? error.message : 'Не удалось синхронизировать статус МойСклад',
    }
  }
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
        comment: body.comment || '',
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
  const order = await getOrderById(orderId)
  if (!order) {
    const error = new Error('Заказ не найден')
    error.status = 404
    throw error
  }

  const moySkladId = order.moySklad?.id
  if (!moySkladId) {
    const error = new Error('У заказа нет документа МойСклад')
    error.status = 400
    throw error
  }

  if (status === 'paid') {
    const ms = await setCustomerOrderState(moySkladId, 'Оплачен')
    return updateOrderStatus(orderId, 'paid', {
      moySklad: {
        id: ms.id,
        name: ms.name,
        href: ms.href,
        stateName: ms.stateName,
      },
    })
  }

  if (status === 'shipped') {
    const snapshot = await fetchCustomerOrderSnapshot(moySkladId)
    if (!isPaidLikeStatus(snapshot.status, snapshot.stateName)) {
      const error = new Error(
        `Отгрузка недоступна: в МойСклад статус «${snapshot.stateName || 'не задан'}», нужен «Оплачен».`,
      )
      error.status = 409
      throw error
    }

    const ms = await setCustomerOrderState(moySkladId, 'Отгружен')
    return updateOrderStatus(orderId, 'shipped', {
      moySklad: {
        id: ms.id,
        name: ms.name,
        href: ms.href,
        stateName: ms.stateName,
      },
    })
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
      const listed = await listOrders()
      const orders = []
      for (const order of listed.orders) {
        orders.push(await enrichOrderFromMoySklad(order))
      }
      sendJson(res, 200, {
        ok: true,
        orders,
        count: orders.length,
        newCount: orders.filter((order) => order.status === 'new').length,
      })
      return
    }

    const match = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/)
    if (match && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      const order = await applyAdminStatus(match[1], body.status)
      const enriched = await enrichOrderFromMoySklad(order)
      sendJson(res, 200, { ok: true, order: enriched })
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin orders failed'
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
  return false
}
