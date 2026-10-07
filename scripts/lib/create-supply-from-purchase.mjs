#!/usr/bin/env node

import { getBaseUrl, moyskladFetch } from './moysklad-env.mjs'
import { createCashOutForSupply } from './create-cashout-for-supply.mjs'

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

async function resolveStoreId() {
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
 * Create MoySklad supply (приёмка) from checked purchase lines.
 * Idempotent if supply already exists on the purchase.
 * @param {object} purchase
 */
export async function createSupplyFromPurchase(purchase) {
  if (purchase?.moysklad?.supplyId) {
    return {
      id: purchase.moysklad.supplyId,
      name: purchase.moysklad.supplyName,
      href: purchase.moysklad.supplyHref,
      created: false,
    }
  }

  const purchaseOrderId = String(purchase?.moysklad?.purchaseOrderId || '').trim()
  if (!purchaseOrderId) {
    const error = new Error('Сначала создайте заказ поставщику')
    error.status = 409
    throw error
  }

  const checked = (Array.isArray(purchase.lines) ? purchase.lines : []).filter((line) => {
    if (!line.checked) return false
    const qty = Number(line.qtyReceived ?? line.qtyOrdered)
    return Number.isFinite(qty) && qty > 0 && line.moyskladAssortmentHref
  })

  if (!checked.length) {
    const error = new Error('Отметьте хотя бы одну позицию в чек-листе')
    error.status = 400
    throw error
  }

  const baseUrl = getBaseUrl()
  const organizationId = await resolveOrganizationId(baseUrl)
  const storeId = await resolveStoreId()

  let agentId = String(purchase?.moysklad?.agentId || '').trim()
  if (!agentId) {
    const order = await moyskladFetch(`/entity/purchaseorder/${purchaseOrderId}?expand=agent`)
    agentId = order?.agent?.id || idFromHref(order?.agent?.meta?.href)
  }
  if (!agentId) {
    const error = new Error('У заказа поставщику нет контрагента')
    error.status = 409
    throw error
  }

  const positions = checked.map((line) => {
    const qty = Number(line.qtyReceived ?? line.qtyOrdered)
    const price = Number(line.price)
    return {
      quantity: qty,
      ...(Number.isFinite(price) ? { price: Math.round(price * 100) } : {}),
      assortment: {
        meta: {
          href: line.moyskladAssortmentHref,
          type: line.moyskladAssortmentType || 'product',
          mediaType: 'application/json',
        },
      },
    }
  })

  const acceptedSumKopecks = checked.reduce((sum, line) => {
    const qty = Number(line.qtyReceived ?? line.qtyOrdered)
    const price = Number(line.price)
    if (!(qty > 0) || !Number.isFinite(price)) return sum
    return sum + Math.round(price * 100) * qty
  }, 0)

  const body = {
    applicable: true,
    organization: { meta: meta('organization', organizationId, baseUrl) },
    agent: { meta: meta('counterparty', agentId, baseUrl) },
    store: { meta: meta('store', storeId, baseUrl) },
    purchaseOrder: { meta: meta('purchaseorder', purchaseOrderId, baseUrl) },
    description:
      [
        purchase.invoiceNumber ? `Счёт ${purchase.invoiceNumber}` : '',
        'Приёмка из админки litcom52',
      ]
        .filter(Boolean)
        .join(' · '),
    positions,
  }

  const created = await moyskladFetch('/entity/supply', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  const sumKopecks =
    typeof created.sum === 'number' && created.sum > 0 ? created.sum : acceptedSumKopecks

  let cashOut = null
  let cashOutError = null
  try {
    // Если заказ поставщику уже оплачен расходником — не плодим второй на ту же сумму.
    // В МС «Оплачено» на приёмке часто подтягивается со связанного оплаченного заказа.
    const purchaseOrder = await moyskladFetch(`/entity/purchaseorder/${purchaseOrderId}`)
    const poPaid = Number(purchaseOrder?.payedSum) || 0
    const supplyFresh = await moyskladFetch(`/entity/supply/${created.id}`)
    const supplyPaid = Number(supplyFresh?.payedSum) || 0

    if (supplyPaid >= sumKopecks || poPaid >= sumKopecks) {
      cashOut = {
        id: null,
        name: null,
        href: null,
        created: false,
        sum: Math.max(supplyPaid, poPaid) / 100,
        skipped: true,
      }
    } else {
      cashOut = await createCashOutForSupply({
        supplyId: created.id,
        purchaseOrderId,
        organizationId,
        agentId,
        sumKopecks,
        purpose: purchase.invoiceNumber
          ? `Оплата приёмки по счёту ${purchase.invoiceNumber}`
          : `Оплата приёмки ${created.name || created.id}`,
      })
    }
  } catch (error) {
    cashOutError =
      error instanceof Error ? error.message : 'Не удалось создать расходный ордер'
    console.error('[purchases] cashout after supply failed', error)
  }

  return {
    id: created.id,
    name: created.name || null,
    href: created?.meta?.uuidHref || created?.meta?.href || null,
    created: true,
    payedSum: cashOut?.sum ?? null,
    cashOut,
    cashOutError,
  }
}
