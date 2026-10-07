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

/** @type {string | null} */
let expenseItemIdCache = null

/**
 * Resolve expense item «Закупка товаров» (or MOYSKLAD_EXPENSE_ITEM_ID).
 */
async function resolveExpenseItemId() {
  const configured = String(process.env.MOYSKLAD_EXPENSE_ITEM_ID || '').trim()
  if (configured) return configured
  if (expenseItemIdCache) return expenseItemIdCache

  const data = await moyskladFetch('/entity/expenseitem?limit=100')
  const rows = Array.isArray(data?.rows) ? data.rows : []
  const preferred =
    rows.find((row) => String(row?.name || '').trim() === 'Закупка товаров') ||
    rows.find((row) => /закупк/i.test(String(row?.name || ''))) ||
    rows[0]
  if (!preferred?.id) {
    const error = new Error(
      'Не найдена статья расходов в МойСклад. Укажите MOYSKLAD_EXPENSE_ITEM_ID в .env',
    )
    error.status = 400
    throw error
  }
  expenseItemIdCache = preferred.id
  return expenseItemIdCache
}

/**
 * Create cashout so document «Оплачено» equals the given sum.
 * @param {{
 *   documentType: 'supply' | 'purchaseorder',
 *   documentId: string,
 *   organizationId: string,
 *   agentId: string,
 *   sumKopecks: number,
 *   purpose?: string,
 * }} input
 */
export async function createCashOutForDocument(input) {
  const documentType = input?.documentType === 'purchaseorder' ? 'purchaseorder' : 'supply'
  const documentId = String(input?.documentId || '').trim()
  const organizationId = String(input?.organizationId || '').trim()
  const agentId = String(input?.agentId || '').trim()
  const sumKopecks = Math.round(Number(input?.sumKopecks) || 0)

  if (!documentId || !organizationId || !agentId) {
    const error = new Error('Недостаточно данных для расходного ордера')
    error.status = 400
    throw error
  }
  if (!(sumKopecks > 0)) {
    const error = new Error('Сумма нулевая — оплату создать нельзя')
    error.status = 409
    throw error
  }

  const document = await moyskladFetch(`/entity/${documentType}/${documentId}`)
  const alreadyPaid = Number(document?.payedSum) || 0
  if (alreadyPaid >= sumKopecks) {
    return {
      id: null,
      name: null,
      href: null,
      created: false,
      sum: alreadyPaid / 100,
      skipped: true,
    }
  }

  const baseUrl = getBaseUrl()
  const expenseItemId = await resolveExpenseItemId()
  const linkedSum = Math.max(0, sumKopecks - alreadyPaid)
  const label = documentType === 'purchaseorder' ? 'заказа поставщику' : 'приёмки'

  const created = await moyskladFetch('/entity/cashout', {
    method: 'POST',
    body: JSON.stringify({
      applicable: true,
      sum: linkedSum,
      organization: { meta: meta('organization', organizationId, baseUrl) },
      agent: { meta: meta('counterparty', agentId, baseUrl) },
      expenseItem: { meta: meta('expenseitem', expenseItemId, baseUrl) },
      operations: [{ meta: meta(documentType, documentId, baseUrl), linkedSum }],
      paymentPurpose:
        input.purpose || `Оплата ${label} ${document?.name || documentId}`,
    }),
  })

  return {
    id: created.id || idFromHref(created?.meta?.href),
    name: created.name || null,
    href: created?.meta?.uuidHref || created?.meta?.href || null,
    created: true,
    sum: typeof created.sum === 'number' ? created.sum / 100 : linkedSum / 100,
    skipped: false,
  }
}

/**
 * @param {{
 *   supplyId: string,
 *   purchaseOrderId?: string | null,
 *   organizationId: string,
 *   agentId: string,
 *   sumKopecks: number,
 *   purpose?: string,
 * }} input
 */
export async function createCashOutForSupply(input) {
  return createCashOutForDocument({
    documentType: 'supply',
    documentId: input.supplyId,
    organizationId: input.organizationId,
    agentId: input.agentId,
    sumKopecks: input.sumKopecks,
    purpose: input.purpose,
  })
}

/**
 * @param {{
 *   purchaseOrderId: string,
 *   organizationId: string,
 *   agentId: string,
 *   sumKopecks: number,
 *   purpose?: string,
 * }} input
 */
export async function createCashOutForPurchaseOrder(input) {
  return createCashOutForDocument({
    documentType: 'purchaseorder',
    documentId: input.purchaseOrderId,
    organizationId: input.organizationId,
    agentId: input.agentId,
    sumKopecks: input.sumKopecks,
    purpose: input.purpose,
  })
}
