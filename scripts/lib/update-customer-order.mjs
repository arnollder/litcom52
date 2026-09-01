#!/usr/bin/env node

import { moyskladFetch } from './moysklad-env.mjs'
import { buildReservedPositions } from './create-customer-order.mjs'
import { getCustomerOrderForCounterparty } from './list-customer-orders.mjs'

const PAGE_SIZE = 100

async function fetchRawPositions(orderId) {
  const rows = []
  let offset = 0
  while (true) {
    const data = await moyskladFetch(
      `/entity/customerorder/${orderId}/positions?limit=${PAGE_SIZE}&offset=${offset}`,
    )
    const chunk = Array.isArray(data?.rows) ? data.rows : []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return rows
}

async function assertEditableByCounterparty(orderId, counterpartyId) {
  const order = await getCustomerOrderForCounterparty(orderId, counterpartyId)
  if (!order) {
    const error = new Error('Заказ не найден')
    error.status = 404
    throw error
  }
  if (order.status !== 'new') {
    const error = new Error(
      `Редактирование недоступно: заказ в статусе «${order.moySklad?.stateName || order.status}».`,
    )
    error.status = 409
    throw error
  }
  return order
}

/**
 * Replaces line items on a customer order (status must be «Новый»).
 */
export async function updateCustomerOrderItems({ orderId, counterpartyId, items }) {
  const id = String(orderId || '').trim()
  const cpId = String(counterpartyId || '').trim()
  const lines = Array.isArray(items) ? items.filter((item) => Number(item.qty) > 0) : []

  if (!id || !cpId) {
    const error = new Error('Не указан заказ или контрагент')
    error.status = 400
    throw error
  }
  if (!lines.length) {
    const error = new Error('Добавьте хотя бы одну позицию')
    error.status = 400
    throw error
  }

  await assertEditableByCounterparty(id, cpId)

  const existing = await fetchRawPositions(id)
  for (const row of existing) {
    if (!row?.id) continue
    await moyskladFetch(`/entity/customerorder/${id}/positions/${row.id}`, {
      method: 'DELETE',
    })
  }

  const positions = await buildReservedPositions(lines)
  for (const position of positions) {
    await moyskladFetch(`/entity/customerorder/${id}/positions`, {
      method: 'POST',
      body: JSON.stringify(position),
    })
  }

  return getCustomerOrderForCounterparty(id, cpId)
}
