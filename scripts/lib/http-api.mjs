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
import {
  getCustomerOrderForAdmin,
  getCustomerOrderForCounterparty,
  listCustomerOrdersForAdmin,
  listCustomerOrdersForCounterparty,
} from './list-customer-orders.mjs'
import { updateCustomerOrderItems } from './update-customer-order.mjs'
import { fetchLiveStockMap } from './fetch-stock.mjs'
import { getAdminReportMetrics } from './admin-reports.mjs'
import { loadEnvFromFile } from './moysklad-env.mjs'
import {
  removePushSubscription,
  upsertAdminPushSubscription,
  upsertPushSubscription,
} from './push-subscriptions.mjs'
import {
  getVapidPublicKey,
  isWebPushConfigured,
  notifyOrderShipped,
} from './web-push.mjs'
import { notifyPushForNewOrder, notifyPushForPaidOrder } from './admin-push-poller.mjs'
import { resolveCounterpartyByToken } from './counterparty-tokens.mjs'
import { getPaymentDetails } from './payment-details.mjs'
import { parseInvoicePdf } from './parse-invoice-pdf.mjs'
import { parseMultipart, readRawBody } from './multipart.mjs'
import {
  createPurchase,
  deletePurchase,
  getPurchaseById,
  listPurchases,
  updatePurchase,
  updatePurchaseChecklist,
} from './purchases-store.mjs'
import {
  createPurchaseOrderInMoySklad,
  matchPurchaseLines,
  payPurchaseOrderInMoySklad,
} from './create-purchase-order.mjs'
import { createSupplyFromPurchase } from './create-supply-from-purchase.mjs'
import {
  getPurchaseOrderFromMoySklad,
  listPurchaseOrdersFromMoySklad,
} from './list-purchase-orders.mjs'
import { fetchInvoicePdfsFromMail } from './fetch-invoice-mail.mjs'
import {
  addMailCounterparty,
  deleteMailCounterparty,
  listMailCounterparties,
  updateMailCounterparty,
} from './mail-counterparties-store.mjs'
import {
  consumeMailInboxItem,
  listActiveMailInbox,
} from './mail-inbox-store.mjs'

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
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Admin-Token, X-Counterparty-Token',
  )
  res.end()
}

function extractCounterpartyToken(req, body = {}, url = null) {
  const fromHeader = String(req.headers['x-counterparty-token'] || '').trim()
  const fromBody = String(body?.token || body?.groupToken || '').trim()
  const fromQuery = url ? String(url.searchParams.get('token') || '').trim() : ''
  return fromBody || fromHeader || fromQuery
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

export async function handleResolveCounterparty(req, res) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'POST, OPTIONS')
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  try {
    const body = await readJsonBody(req)
    const token = extractCounterpartyToken(req, body)
    const counterparty = await resolveCounterpartyByToken(token)
    sendJson(res, 200, {
      ok: true,
      counterparty: {
        id: counterparty.id,
        name: counterparty.name,
        contact: counterparty.contact,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resolve failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
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
    const token = extractCounterpartyToken(req, body)
    const counterparty = await resolveCounterpartyByToken(token)

    const customer = {
      ...(body.customer && typeof body.customer === 'object' ? body.customer : {}),
      contact: body.customer?.contact || counterparty.contact || '',
      counterparty: {
        id: counterparty.id,
        name: counterparty.name,
      },
    }

    const result = await createReservedCustomerOrder({
      counterpartyId: counterparty.id,
      counterpartyName: counterparty.name,
      items: body.items,
      comment: body.comment,
    })

    let inboxOrder = null
    try {
      inboxOrder = await appendOrder({
        createdAt: body.createdAt || new Date().toISOString(),
        customer,
        items: body.items,
        total: body.total,
        comment: result.description || body.comment || '',
        moySklad: result,
      })
    } catch (storeError) {
      console.error('[orders-store] failed to persist order', storeError)
    }

    const payment = await getPaymentDetails()

    sendJson(res, 200, {
      ok: true,
      order: result,
      inbox: inboxOrder,
      counterparty: {
        id: counterparty.id,
        name: counterparty.name,
        contact: counterparty.contact,
      },
      payment,
    })

    notifyPushForNewOrder({
      id: result?.id,
      name: result?.name,
      moySklad: result,
      counterpartyName: counterparty.name,
    }).catch((pushError) => {
      console.error('[push] reserve notify failed', pushError)
    })
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
    const etag = result.etag || ''
    const clientEtag = String(req.headers['if-none-match'] || '').trim()
    if (etag && clientEtag && clientEtag === etag) {
      res.statusCode = 304
      res.setHeader('ETag', etag)
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end()
      return
    }
    if (etag) res.setHeader('ETag', etag)
    const { etag: _etag, cached: _cached, ...payload } = result
    sendJson(res, 200, { ok: true, ...payload })
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
    const order = await getCustomerOrderForAdmin(resolvedMoySkladId)
    notifyPushForPaidOrder(order).catch((pushError) => {
      console.error('[push] paid notify failed', pushError)
    })
    return order
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

    const ms = await setCustomerOrderState(resolvedMoySkladId, 'Отгружен')
    if (local) {
      await updateOrderStatus(local.id, 'shipped', {
        moySklad: {
          id: ms.id,
          name: ms.name,
          href: ms.href,
          stateName: ms.stateName,
        },
      })
    }
    const updated = await getCustomerOrderForAdmin(resolvedMoySkladId)
    const counterpartyId = updated?.customer?.counterparty?.id
    if (counterpartyId) {
      notifyOrderShipped({
        counterpartyId,
        counterpartyName: updated.customer?.counterparty?.name || '',
        orderName: updated.moySklad?.name || '',
      }).catch((err) => {
        console.error('[push] shipped notify failed', err)
      })
    }
    return updated
  }

  if (status === 'new') {
    const ms = await setCustomerOrderState(resolvedMoySkladId, 'Новый')
    if (local) {
      await updateOrderStatus(local.id, 'new', {
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

  const error = new Error('Некорректный статус. Допустимо: new, paid, shipped')
  error.status = 400
  throw error
}

async function readPdfUpload(req) {
  const contentType = String(req.headers['content-type'] || '')
  if (contentType.includes('multipart/form-data')) {
    const raw = await readRawBody(req)
    const { file } = parseMultipart(raw, contentType)
    if (!file?.data?.length) {
      const error = new Error('Загрузите PDF-файл (поле pdf или file)')
      error.status = 400
      throw error
    }
    return { buffer: file.data, filename: file.filename || 'invoice.pdf' }
  }

  const body = await readJsonBody(req)
  const b64 = String(body.pdfBase64 || body.pdf || '').trim()
  if (!b64) {
    const error = new Error('Передайте PDF: multipart или pdfBase64')
    error.status = 400
    throw error
  }
  const cleaned = b64.replace(/^data:application\/pdf;base64,/i, '')
  return {
    buffer: Buffer.from(cleaned, 'base64'),
    filename: String(body.filename || body.sourcePdfName || 'invoice.pdf'),
  }
}

export async function handleAdminPurchases(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, POST, PATCH, DELETE, OPTIONS')
    return
  }

  try {
    await loadEnvFromFile()
    assertAdmin(req)

    if (pathname === '/api/admin/purchases/parse' && req.method === 'POST') {
      const { buffer, filename } = await readPdfUpload(req)
      const parsed = await parseInvoicePdf(buffer, { filename })
      let lines = parsed.lines
      try {
        lines = await matchPurchaseLines(parsed.lines)
      } catch (err) {
        console.error('[purchases] match skipped', err)
      }
      sendJson(res, 200, { ok: true, parsed: { ...parsed, lines } })
      return
    }

    if (pathname === '/api/admin/purchases/mail-inbox' && req.method === 'GET') {
      const messages = await listActiveMailInbox()
      sendJson(res, 200, {
        ok: true,
        messages,
        count: messages.length,
        source: 'cache',
      })
      return
    }

    if (pathname === '/api/admin/purchases/check-mail' && req.method === 'POST') {
      const result = await fetchInvoicePdfsFromMail()
      sendJson(res, 200, {
        ok: true,
        messages: result.messages,
        count: result.messages.length,
        added: result.added,
        scanned: result.scanned,
        matched: result.matched,
        skippedKnown: result.skippedKnown,
        fromFilters: result.fromFilters,
        source: 'sync',
      })
      return
    }

    if (pathname === '/api/admin/purchases/counterparties' && req.method === 'GET') {
      const emails = await listMailCounterparties()
      const mailbox = String(process.env.MAIL_IMAP_USER || '').trim()
      sendJson(res, 200, {
        ok: true,
        emails,
        count: emails.length,
        mailbox: mailbox || null,
      })
      return
    }

    if (pathname === '/api/admin/purchases/counterparties' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const item = await addMailCounterparty({
        email: body?.email,
        name: body?.name,
      })
      sendJson(res, 201, { ok: true, email: item })
      return
    }

    const counterpartyById = pathname.match(
      /^\/api\/admin\/purchases\/counterparties\/([^/]+)$/,
    )
    if (counterpartyById && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      const updated = await updateMailCounterparty(decodeURIComponent(counterpartyById[1]), {
        email: body?.email,
        name: body?.name,
      })
      if (!updated) {
        sendJson(res, 404, { ok: false, error: 'Контрагент не найден' })
        return
      }
      sendJson(res, 200, { ok: true, email: updated })
      return
    }
    if (counterpartyById && req.method === 'DELETE') {
      const removed = await deleteMailCounterparty(decodeURIComponent(counterpartyById[1]))
      if (!removed) {
        sendJson(res, 404, { ok: false, error: 'Контрагент не найден' })
        return
      }
      sendJson(res, 200, { ok: true, email: removed })
      return
    }

    if (pathname === '/api/admin/purchases/history' && req.method === 'GET') {
      const listed = await listPurchaseOrdersFromMoySklad({ limit: 50 })
      sendJson(res, 200, {
        ok: true,
        orders: listed.orders,
        count: listed.count,
        source: 'moysklad-purchaseorder',
        href: 'https://online.moysklad.ru/app/#purchaseorder',
      })
      return
    }

    const historyById = pathname.match(/^\/api\/admin\/purchases\/history\/([^/]+)$/)
    if (historyById && req.method === 'GET') {
      const order = await getPurchaseOrderFromMoySklad(historyById[1])
      sendJson(res, 200, { ok: true, order })
      return
    }

    if (pathname === '/api/admin/purchases' && req.method === 'GET') {
      const purchases = await listPurchases()
      sendJson(res, 200, { ok: true, purchases, count: purchases.length })
      return
    }

    if (pathname === '/api/admin/purchases' && req.method === 'POST') {
      const body = await readJsonBody(req)
      const source = body.parsed || body
      let lines = Array.isArray(source.lines) ? source.lines : []
      if (lines.length && !lines.some((line) => line.moyskladAssortmentHref)) {
        try {
          lines = await matchPurchaseLines(lines)
        } catch (err) {
          console.error('[purchases] match on create skipped', err)
        }
      }
      const purchase = await createPurchase({
        invoiceNumber: source.invoiceNumber,
        invoiceDate: source.invoiceDate,
        supplierName: source.supplierName,
        sourcePdfName: source.sourcePdfName || body.sourcePdfName,
        parsedAt: source.parsedAt,
        total: source.total,
        lines,
      })
      const mailInboxId =
        body.mailInboxId ||
        source.mailInboxId ||
        (source.mail?.uid != null && source.id ? source.id : null)
      if (mailInboxId) {
        try {
          await consumeMailInboxItem(String(mailInboxId), purchase.id)
        } catch (err) {
          console.error('[purchases] mail inbox consume skipped', err)
        }
      }
      sendJson(res, 200, { ok: true, purchase })
      return
    }

    const byId = pathname.match(/^\/api\/admin\/purchases\/([^/]+)$/)
    if (byId && req.method === 'GET') {
      const purchase = await getPurchaseById(byId[1])
      if (!purchase) {
        sendJson(res, 404, { ok: false, error: 'Закупка не найдена' })
        return
      }
      sendJson(res, 200, { ok: true, purchase })
      return
    }

    if (byId && req.method === 'DELETE') {
      const removed = await deletePurchase(byId[1])
      if (!removed) {
        sendJson(res, 404, { ok: false, error: 'Закупка не найдена' })
        return
      }
      sendJson(res, 200, { ok: true, purchase: removed })
      return
    }

    const createOrder = pathname.match(/^\/api\/admin\/purchases\/([^/]+)\/create-order$/)
    if (createOrder && req.method === 'POST') {
      const purchase = await getPurchaseById(createOrder[1])
      if (!purchase) {
        sendJson(res, 404, { ok: false, error: 'Закупка не найдена' })
        return
      }
      try {
        const created = await createPurchaseOrderInMoySklad(purchase)
        // Persist ordered state and answer the client BEFORE cashout.
        // Cashout can hang/timeout — UI must already show «Заказ создан».
        const updated = await updatePurchase(purchase.id, (current) => ({
          ...current,
          lines: created.lines || current.lines,
          moysklad: {
            ...current.moysklad,
            purchaseOrderId: created.id,
            purchaseOrderName: created.name,
            purchaseOrderHref: created.href,
            agentId: created.agentId || current.moysklad?.agentId || null,
          },
        }))

        sendJson(res, 200, {
          ok: true,
          purchase: updated,
          created: created.created,
        })

        // Cashout in background — never blocks UI transition to «Принять товар».
        if (created.id && Number(created.sumKopecks) > 0) {
          void (async () => {
            try {
              const { moyskladFetch } = await import('./moysklad-env.mjs')
              const { resolveSupplierAgent } = await import('./create-purchase-order.mjs')
              let organizationId = created.organizationId
              let agentId = created.agentId || updated.moysklad?.agentId
              if (!organizationId) {
                organizationId = String(process.env.MOYSKLAD_ORGANIZATION_ID || '').trim() || null
                if (!organizationId) {
                  const data = await moyskladFetch('/entity/organization?limit=1')
                  organizationId = data?.rows?.[0]?.id || null
                }
              }
              if (!agentId) {
                const agent = await resolveSupplierAgent(
                  updated.supplierName || purchase.supplierName,
                )
                agentId = agent.id
              }
              if (!organizationId || !agentId) return

              const cashOut = await payPurchaseOrderInMoySklad({
                purchaseOrderId: created.id,
                organizationId,
                agentId,
                sumKopecks: created.sumKopecks,
                purpose: purchase.invoiceNumber
                  ? `Оплата заказа по счёту ${purchase.invoiceNumber}`
                  : `Оплата заказа поставщику ${created.name || created.id}`,
              })
              await updatePurchase(purchase.id, (current) => ({
                ...current,
                moysklad: {
                  ...current.moysklad,
                  agentId: agentId || current.moysklad?.agentId || null,
                  cashOutId: cashOut?.id || current.moysklad?.cashOutId || null,
                  cashOutName: cashOut?.name || current.moysklad?.cashOutName || null,
                  payedSum: cashOut?.sum ?? current.moysklad?.payedSum ?? null,
                },
              }))
            } catch (error) {
              console.error('[purchases] cashout after purchaseorder failed', error)
            }
          })()
        }
        return
      } catch (error) {
        if (Array.isArray(error?.lines)) {
          await updatePurchase(purchase.id, (current) => ({
            ...current,
            lines: error.lines,
          }))
        }
        throw error
      }
    }

    const checklist = pathname.match(/^\/api\/admin\/purchases\/([^/]+)\/checklist$/)
    if (checklist && req.method === 'PATCH') {
      const body = await readJsonBody(req)
      const updated = await updatePurchaseChecklist(checklist[1], body.lines || body)
      if (!updated) {
        sendJson(res, 404, { ok: false, error: 'Закупка не найдена' })
        return
      }
      sendJson(res, 200, { ok: true, purchase: updated })
      return
    }

    const accept = pathname.match(/^\/api\/admin\/purchases\/([^/]+)\/accept$/)
    if (accept && req.method === 'POST') {
      const purchase = await getPurchaseById(accept[1])
      if (!purchase) {
        sendJson(res, 404, { ok: false, error: 'Закупка не найдена' })
        return
      }
      const supply = await createSupplyFromPurchase(purchase)
      const updated = await updatePurchase(purchase.id, (current) => ({
        ...current,
        moysklad: {
          ...current.moysklad,
          supplyId: supply.id,
          supplyName: supply.name,
          supplyHref: supply.href,
          cashOutId: supply.cashOut?.id || current.moysklad?.cashOutId || null,
          cashOutName: supply.cashOut?.name || current.moysklad?.cashOutName || null,
          payedSum: supply.payedSum ?? current.moysklad?.payedSum ?? null,
        },
      }))
      sendJson(res, 200, {
        ok: true,
        purchase: updated,
        created: supply.created,
        ...(supply.cashOutError
          ? {
              warning: `Приёмка создана, но «Оплачено» не проставлено: ${supply.cashOutError}`,
            }
          : {}),
      })
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin purchases failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
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

export async function handleAdminPush(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, POST, DELETE, OPTIONS')
    return
  }

  try {
    await loadEnvFromFile()

    if (pathname === '/api/admin/push/vapid-public-key' && req.method === 'GET') {
      if (!isWebPushConfigured()) {
        sendJson(res, 503, { ok: false, error: 'Web Push не настроен на сервере' })
        return
      }
      sendJson(res, 200, { ok: true, publicKey: getVapidPublicKey() })
      return
    }

    assertAdmin(req)

    if (pathname === '/api/admin/push/subscribe' && req.method === 'POST') {
      if (!isWebPushConfigured()) {
        sendJson(res, 503, { ok: false, error: 'Web Push не настроен на сервере' })
        return
      }
      const body = await readJsonBody(req)
      const row = await upsertAdminPushSubscription(body.subscription || body)
      sendJson(res, 200, { ok: true, id: row.id })
      return
    }

    if (pathname === '/api/admin/push/subscribe' && req.method === 'DELETE') {
      const body = await readJsonBody(req)
      const endpoint = String(body.subscription?.endpoint || body.endpoint || '').trim()
      const removed = await removePushSubscription(endpoint)
      sendJson(res, 200, { ok: true, removed: removed > 0 })
      return
    }

    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin push failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

export async function handlePushVapidPublicKey(req, res) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, OPTIONS')
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  await loadEnvFromFile()
  const publicKey = getVapidPublicKey()
  if (!publicKey) {
    sendJson(res, 503, { ok: false, error: 'Push не настроен на сервере (VAPID keys)' })
    return
  }
  sendJson(res, 200, { ok: true, publicKey })
}

export async function handlePushSubscribe(req, res) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'POST, DELETE, OPTIONS')
    return
  }

  try {
    await loadEnvFromFile()
    const body = await readJsonBody(req)

    if (req.method === 'DELETE') {
      const removed = await removePushSubscription(body.endpoint)
      sendJson(res, 200, { ok: true, removed })
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    let counterpartyId = ''
    let counterpartyName = ''
    const token = extractCounterpartyToken(req, body)
    if (!token) {
      const error = new Error('Нужен токен группы для подписки на уведомления')
      error.status = 400
      throw error
    }
    const counterparty = await resolveCounterpartyByToken(token)
    counterpartyId = counterparty.id
    counterpartyName = counterparty.name

    const row = await upsertPushSubscription({
      counterpartyId,
      counterpartyName,
      subscription: body.subscription,
    })
    sendJson(res, 200, { ok: true, id: row.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push subscribe failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

export async function handleCustomerOrders(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    corsPreflight(res, 'GET, PATCH, OPTIONS')
    return
  }

  try {
    await loadEnvFromFile()
    const url = new URL(req.url || '/api/orders', 'http://localhost')

    if (pathname === '/api/orders' && req.method === 'GET') {
      const token = extractCounterpartyToken(req, {}, url)
      const counterparty = await resolveCounterpartyByToken(token)
      const result = await listCustomerOrdersForCounterparty(counterparty.id)
      const payment = await getPaymentDetails()
      sendJson(res, 200, {
        ok: true,
        counterparty: { id: counterparty.id, name: counterparty.name },
        payment,
        ...result,
      })
      return
    }

    const match = pathname.match(/^\/api\/orders\/([^/]+)$/)
    if (match) {
      const orderId = match[1]

      if (req.method === 'GET') {
        const token = extractCounterpartyToken(req, {}, url)
        const counterparty = await resolveCounterpartyByToken(token)
        const order = await getCustomerOrderForCounterparty(orderId, counterparty.id)
        if (!order) {
          sendJson(res, 404, { ok: false, error: 'Заказ не найден' })
          return
        }
        sendJson(res, 200, { ok: true, order })
        return
      }

      if (req.method === 'PATCH') {
        const body = await readJsonBody(req)
        const token = extractCounterpartyToken(req, body, url)
        const counterparty = await resolveCounterpartyByToken(token)
        const order = await updateCustomerOrderItems({
          orderId,
          counterpartyId: counterparty.id,
          items: body.items,
        })
        sendJson(res, 200, { ok: true, order })
        return
      }
    }

    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Customer orders failed'
    sendJson(res, mapErrorStatus(error), { ok: false, error: message })
  }
}

/**
 * Returns true if the request was handled.
 */
export async function handleApiRequest(req, res) {
  const pathname = pathOnly(req.url || '/')

  if (pathname === '/api/push/vapid-public-key') {
    await handlePushVapidPublicKey(req, res)
    return true
  }
  if (pathname === '/api/push/subscribe') {
    await handlePushSubscribe(req, res)
    return true
  }

  if (pathname === '/api/counterparty/resolve') {
    await handleResolveCounterparty(req, res)
    return true
  }

  if (pathname === '/api/orders/reserve') {
    await handleReserveOrder(req, res)
    return true
  }
  if (pathname === '/api/orders' || pathname.startsWith('/api/orders/')) {
    await handleCustomerOrders(req, res, pathname)
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
  if (pathname === '/api/admin/purchases' || pathname.startsWith('/api/admin/purchases/')) {
    await handleAdminPurchases(req, res, pathname)
    return true
  }
  if (pathname === '/api/admin/reports') {
    await handleAdminReports(req, res)
    return true
  }
  if (pathname === '/api/admin/push/vapid-public-key' || pathname === '/api/admin/push/subscribe') {
    await handleAdminPush(req, res, pathname)
    return true
  }
  return false
}
