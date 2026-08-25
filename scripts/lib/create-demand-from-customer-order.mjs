#!/usr/bin/env node

import { getBaseUrl, moyskladFetch } from './moysklad-env.mjs'

function meta(type, id, baseUrl) {
  return {
    href: `${baseUrl}/entity/${type}/${id}`,
    type,
    mediaType: 'application/json',
  }
}

function idFromHref(href = '') {
  const parts = String(href).split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

async function resolveStoreId(baseUrl) {
  const configured = String(process.env.MOYSKLAD_STORE_ID || '').trim()
  if (configured) return configured

  const data = await moyskladFetch('/entity/store?limit=1')
  const first = Array.isArray(data?.rows) ? data.rows[0] : null
  if (!first?.id) {
    const error = new Error('Не найден склад в МойСклад. Укажите MOYSKLAD_STORE_ID в .env')
    error.status = 400
    throw error
  }
  return first.id
}

/**
 * Returns existing demands linked to a customer order (if any).
 * @param {string} orderId
 */
export async function listDemandsForCustomerOrder(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return []

  const order = await moyskladFetch(`/entity/customerorder/${id}?expand=demands`)
  return Array.isArray(order?.demands) ? order.demands : []
}

/**
 * Creates a MoySklad demand (Отгрузка) based on a customer order.
 * Idempotent: if a demand already exists for the order, returns it.
 *
 * @param {string} customerOrderId
 * @returns {Promise<{ id: string, name: string | null, href: string | null, created: boolean }>}
 */
export async function createDemandFromCustomerOrder(customerOrderId) {
  const orderId = String(customerOrderId || '').trim()
  if (!orderId) {
    const error = new Error('Не указан id заказа МойСклад для отгрузки')
    error.status = 400
    throw error
  }

  const existing = await listDemandsForCustomerOrder(orderId)
  if (existing.length) {
    const first = existing[0]
    return {
      id: first.id || idFromHref(first?.meta?.href),
      name: first.name || null,
      href: first?.meta?.uuidHref || first?.meta?.href || null,
      created: false,
    }
  }

  const baseUrl = getBaseUrl()
  const order = await moyskladFetch(
    `/entity/customerorder/${orderId}?expand=positions.assortment,organization,agent`,
  )

  const organizationId =
    order?.organization?.id || idFromHref(order?.organization?.meta?.href)
  const agentId = order?.agent?.id || idFromHref(order?.agent?.meta?.href)
  if (!organizationId || !agentId) {
    const error = new Error(
      `У заказа ${order?.name || orderId} нет организации или контрагента — отгрузку создать нельзя`,
    )
    error.status = 409
    throw error
  }

  const rows = Array.isArray(order?.positions?.rows) ? order.positions.rows : []
  const positions = []
  for (const row of rows) {
    const qty = Number(row?.quantity)
    if (!(qty > 0)) continue
    const assortmentMeta = row?.assortment?.meta
    if (!assortmentMeta?.href || !assortmentMeta?.type) continue

    const price = Number(row?.price)
    positions.push({
      quantity: qty,
      ...(Number.isFinite(price) ? { price: Math.round(price) } : {}),
      ...(typeof row?.discount === 'number' ? { discount: row.discount } : {}),
      ...(typeof row?.vat === 'number' ? { vat: row.vat } : {}),
      assortment: {
        meta: {
          href: assortmentMeta.href,
          type: assortmentMeta.type,
          mediaType: assortmentMeta.mediaType || 'application/json',
        },
      },
    })
  }

  if (!positions.length) {
    const error = new Error(
      `В заказе ${order?.name || orderId} нет позиций для отгрузки`,
    )
    error.status = 409
    throw error
  }

  const storeId = await resolveStoreId(baseUrl)

  const body = {
    applicable: true,
    organization: { meta: meta('organization', organizationId, baseUrl) },
    agent: { meta: meta('counterparty', agentId, baseUrl) },
    store: { meta: meta('store', storeId, baseUrl) },
    customerOrder: { meta: meta('customerorder', orderId, baseUrl) },
    positions,
  }

  if (typeof order?.vatEnabled === 'boolean') body.vatEnabled = order.vatEnabled
  if (typeof order?.vatIncluded === 'boolean') body.vatIncluded = order.vatIncluded
  if (order?.description) body.description = order.description

  const created = await moyskladFetch('/entity/demand', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return {
    id: created.id,
    name: created.name || null,
    href: created?.meta?.uuidHref || created?.meta?.href || null,
    created: true,
  }
}
