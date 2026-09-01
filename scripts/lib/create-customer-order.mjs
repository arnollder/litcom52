#!/usr/bin/env node

import { getBaseUrl, moyskladFetch } from './moysklad-env.mjs'
import { buildCustomerOrderStatePayload } from './customer-order-state.mjs'
import { buildStorefrontOrderComment } from './storefront-order-comment.mjs'

function meta(type, id, baseUrl) {
  return {
    href: `${baseUrl}/entity/${type}/${id}`,
    type,
    mediaType: 'application/json',
  }
}

async function resolveOrganizationId(baseUrl) {
  const configured = process.env.MOYSKLAD_ORGANIZATION_ID
  if (configured) return configured

  const data = await moyskladFetch('/entity/organization?limit=1')
  const first = Array.isArray(data?.rows) ? data.rows[0] : null
  if (!first?.id) {
    throw new Error('Не найдена организация в МойСклад. Укажите MOYSKLAD_ORGANIZATION_ID в .env')
  }
  return first.id
}

async function resolveAssortmentType(id) {
  // Catalog sync pulls from assortment; literature items are almost always products.
  const candidates = ['product', 'variant', 'bundle', 'service']
  let lastError = null

  for (const type of candidates) {
    try {
      await moyskladFetch(`/entity/${type}/${id}`)
      return type
    } catch (error) {
      lastError = error
      if (error?.status === 404) continue
      throw error
    }
  }

  throw lastError || new Error(`Товар/позиция ${id} не найдена в МойСклад`)
}

/**
 * Builds MoySklad customerorder position payloads with reserve = quantity.
 */
export async function buildReservedPositions(items) {
  const baseUrl = getBaseUrl()
  const positions = []

  for (const item of items) {
    const id = String(item.id || '').trim()
    const qty = Number(item.qty)
    if (!id || !(qty > 0)) {
      throw new Error(`Некорректная позиция заказа: ${item.name || id}`)
    }

    const type = await resolveAssortmentType(id)
    const price = Number(item.price)
    positions.push({
      quantity: qty,
      reserve: qty,
      ...(Number.isFinite(price) ? { price: Math.round(price * 100) } : {}),
      assortment: {
        meta: meta(type, id, baseUrl),
      },
    })
  }

  return positions
}

/**
 * Creates a MoySklad customer order and reserves each line.
 * @param {{ counterpartyId: string, counterpartyName?: string, items: Array<{ id: string, qty: number, price?: number, name?: string }>, comment?: string }} order
 */
export async function createReservedCustomerOrder(order) {
  const counterpartyId = String(order?.counterpartyId || '').trim()
  const items = Array.isArray(order?.items) ? order.items : []

  if (!counterpartyId) {
    throw new Error('Не выбран контрагент')
  }
  if (!items.length) {
    throw new Error('Корзина пуста')
  }

  const baseUrl = getBaseUrl()
  const organizationId = await resolveOrganizationId(baseUrl)

  const positions = await buildReservedPositions(items)

  const body = {
    organization: {
      meta: meta('organization', organizationId, baseUrl),
    },
    agent: {
      meta: meta('counterparty', counterpartyId, baseUrl),
    },
    description: buildStorefrontOrderComment({
      counterpartyName: order.counterpartyName,
      extra: order.comment,
    }),
    positions,
  }

  let stateName = null
  try {
    const { state, payload } = await buildCustomerOrderStatePayload('Новый')
    Object.assign(body, payload)
    stateName = state.name
  } catch (error) {
    console.error('[customer-order] failed to resolve state Новый', error)
  }

  const created = await moyskladFetch('/entity/customerorder', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return {
    id: created.id,
    name: created.name,
    href: created?.meta?.href || null,
    reservedPositions: positions.length,
    sum: typeof created.sum === 'number' ? created.sum / 100 : null,
    stateName: created?.state?.name || stateName,
    description: body.description,
  }
}
