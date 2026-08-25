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

/**
 * Returns existing payments linked to a customer order (if any).
 * @param {string} orderId
 */
export async function listPaymentsForCustomerOrder(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return []

  const order = await moyskladFetch(`/entity/customerorder/${id}?expand=payments`)
  return Array.isArray(order?.payments) ? order.payments : []
}

/**
 * Creates a MoySklad incoming payment (Входящий платёж / paymentin)
 * linked to a customer order for the unpaid remainder.
 * Idempotent: if a payment already exists for the order, returns it.
 *
 * @param {string} customerOrderId
 * @returns {Promise<{ id: string, name: string | null, href: string | null, created: boolean, sum: number | null }>}
 */
export async function createPaymentInFromCustomerOrder(customerOrderId) {
  const orderId = String(customerOrderId || '').trim()
  if (!orderId) {
    const error = new Error('Не указан id заказа МойСклад для входящего платежа')
    error.status = 400
    throw error
  }

  const existing = await listPaymentsForCustomerOrder(orderId)
  if (existing.length) {
    const first = existing[0]
    return {
      id: first.id || idFromHref(first?.meta?.href),
      name: first.name || null,
      href: first?.meta?.uuidHref || first?.meta?.href || null,
      created: false,
      sum: typeof first.sum === 'number' ? first.sum / 100 : null,
    }
  }

  const baseUrl = getBaseUrl()
  const order = await moyskladFetch(
    `/entity/customerorder/${orderId}?expand=organization,agent`,
  )

  const organizationId =
    order?.organization?.id || idFromHref(order?.organization?.meta?.href)
  const agentId = order?.agent?.id || idFromHref(order?.agent?.meta?.href)
  if (!organizationId || !agentId) {
    const error = new Error(
      `У заказа ${order?.name || orderId} нет организации или контрагента — платёж создать нельзя`,
    )
    error.status = 409
    throw error
  }

  const orderSum = Number(order?.sum)
  const payedSum = Number(order?.payedSum) || 0
  if (!Number.isFinite(orderSum) || orderSum <= 0) {
    const error = new Error(
      `У заказа ${order?.name || orderId} нулевая сумма — платёж создать нельзя`,
    )
    error.status = 409
    throw error
  }

  const linkedSum = Math.max(0, Math.round(orderSum - payedSum))
  if (!(linkedSum > 0)) {
    const error = new Error(
      `Заказ ${order?.name || orderId} уже полностью оплачен в МойСклад`,
    )
    error.status = 409
    throw error
  }

  const body = {
    applicable: true,
    sum: linkedSum,
    organization: { meta: meta('organization', organizationId, baseUrl) },
    agent: { meta: meta('counterparty', agentId, baseUrl) },
    operations: [
      {
        meta: meta('customerorder', orderId, baseUrl),
        linkedSum,
      },
    ],
  }

  if (order?.description) {
    body.paymentPurpose = `Оплата заказа ${order.name || orderId}`
  } else if (order?.name) {
    body.paymentPurpose = `Оплата заказа ${order.name}`
  }

  const created = await moyskladFetch('/entity/paymentin', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return {
    id: created.id,
    name: created.name || null,
    href: created?.meta?.uuidHref || created?.meta?.href || null,
    created: true,
    sum: typeof created.sum === 'number' ? created.sum / 100 : linkedSum / 100,
  }
}
