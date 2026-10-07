#!/usr/bin/env node

import { getBaseUrl, moyskladFetch } from './moysklad-env.mjs'
import { createCashOutForPurchaseOrder } from './create-cashout-for-supply.mjs'

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

function entityId(entity) {
  return String(entity?.id || idFromHref(entity?.meta?.href) || '').trim()
}

/**
 * Find purchaseorder by externalCode (invoice number).
 * @param {string} externalCode
 */
async function findPurchaseOrderByExternalCode(externalCode) {
  const code = String(externalCode || '').trim()
  if (!code) return null
  const filter = encodeURIComponent(`externalCode=${code}`)
  const listed = await moyskladFetch(`/entity/purchaseorder?filter=${filter}&limit=5`)
  const rows = Array.isArray(listed?.rows) ? listed.rows : []
  return rows.find((row) => String(row?.externalCode || '').trim() === code) || rows[0] || null
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
 * Find or create supplier counterparty by name.
 * @param {string} name
 */
export async function resolveSupplierAgent(name) {
  const supplierName = String(name || 'Литература АН').trim() || 'Литература АН'
  const filter = encodeURIComponent(`name=${supplierName}`)
  const listed = await moyskladFetch(`/entity/counterparty?filter=${filter}&limit=5`)
  const rows = Array.isArray(listed?.rows) ? listed.rows : []
  const exact = rows.find((row) => String(row?.name || '').trim() === supplierName)
  if (exact?.id) {
    return { id: exact.id, name: exact.name, created: false }
  }

  const fuzzy = await moyskladFetch(
    `/entity/counterparty?search=${encodeURIComponent(supplierName)}&limit=10`,
  )
  const fuzzyRows = Array.isArray(fuzzy?.rows) ? fuzzy.rows : []
  const match = fuzzyRows.find((row) =>
    String(row?.name || '')
      .toLowerCase()
      .includes(supplierName.toLowerCase()),
  )
  if (match?.id) {
    return { id: match.id, name: match.name, created: false }
  }

  const created = await moyskladFetch('/entity/counterparty', {
    method: 'POST',
    body: JSON.stringify({
      name: supplierName,
      companyType: 'legal',
    }),
  })
  return { id: created.id, name: created.name || supplierName, created: true }
}

/** @type {Array<{ id: string, name: string, article: string, code: string, type: string, href: string, norm: string, normBare: string }> | null} */
let productIndexCache = null

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/^книга\s+/i, '')
    .replace(/[«»"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripParens(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toMatchRow(row) {
  if (!row?.id || !row?.meta?.href || !row?.meta?.type) return null
  const name = row.name || ''
  const norm = normalizeName(name)
  return {
    id: row.id,
    name,
    article: row.article || '',
    code: row.code || '',
    type: row.meta.type,
    href: row.meta.href,
    norm,
    normBare: stripParens(norm),
  }
}

async function loadProductIndex() {
  if (productIndexCache) return productIndexCache
  const rows = []
  let path = '/entity/product?limit=100'
  while (path) {
    const data = await moyskladFetch(path.startsWith('http') ? path : path)
    for (const row of data?.rows || []) {
      const item = toMatchRow(row)
      if (item) rows.push(item)
    }
    path = data?.meta?.nextHref || null
    if (rows.length > 1000) break
  }
  productIndexCache = rows
  return rows
}

/**
 * Resolve MoySklad assortment by article.
 * @param {string} article
 */
export async function resolveAssortmentByArticle(article) {
  const code = String(article || '').trim()
  if (!code) return null

  for (const field of ['article', 'code', 'externalCode']) {
    const filter = encodeURIComponent(`${field}=${code}`)
    const data = await moyskladFetch(`/entity/product?filter=${filter}&limit=5`)
    const rows = Array.isArray(data?.rows) ? data.rows : []
    const exact =
      rows.find((row) => String(row?.[field] || row?.article || row?.code || '').trim() === code) ||
      rows[0]
    const mapped = toMatchRow(exact)
    if (mapped) return mapped
  }
  return null
}

/**
 * Fallback: match by invoice line name against MoySklad product names.
 * Supplier articles (B_BT_06…) often are absent in local MS catalog.
 * @param {string} name
 */
export async function resolveAssortmentByName(name) {
  const index = await loadProductIndex()
  const raw = normalizeName(name)
  const bare = stripParens(raw)
  if (!raw) return null

  let best = null
  let bestScore = 0

  for (const item of index) {
    let score = 0
    if (item.norm === raw || item.normBare === bare) score = 100
    else if (item.norm.includes(bare) || bare.includes(item.normBare)) score = 80
    else if (item.normBare.includes(bare) || bare.includes(item.normBare)) score = 70
    else {
      const tokens = bare.split(' ').filter((t) => t.length > 2)
      if (!tokens.length) continue
      const hit = tokens.filter((t) => item.norm.includes(t)).length
      score = (hit / tokens.length) * 60
    }

    // Core phrases that differ a lot between supplier invoice and local MS names.
    if (/базовый текст/.test(bare) && /базовый текст/.test(item.norm)) {
      score = Math.max(score, 75)
    }
    if (/с возвращением/.test(bare) && /с возвращением/.test(item.norm)) {
      score = Math.max(score, 85)
    }

    // Prefer hardcover/base edition over soft mini when invoice says «твердая».
    if (/тверд/i.test(name) && /мягк|уменьшен/i.test(item.name)) score -= 30
    if (/тверд|базовый текст/i.test(name) && /анонимные наркоманы.*базовый текст/i.test(item.name)) {
      score += 20
    }
    // «Книга "Только сегодня"» → ежедневник, не IP-буклет.
    if (/только сегодня/.test(bare) && !/брелок/.test(bare)) {
      if (/ежедневник/i.test(item.name)) score += 25
      if (/\bip\b/i.test(item.name) || /ip\s*#/i.test(item.name)) score -= 25
    }

    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }

  if (!best || bestScore < 55) return null
  return best
}

function findInProductIndexByArticle(index, article) {
  const code = String(article || '').trim().toLowerCase()
  if (!code) return null
  return (
    index.find((item) => String(item.article || '').trim().toLowerCase() === code) ||
    index.find((item) => String(item.code || '').trim().toLowerCase() === code) ||
    null
  )
}

/**
 * Enrich purchase lines with MoySklad assortment matches.
 * Already-matched lines are kept as-is (no rematch / no catalog download).
 * @param {Array<object>} lines
 */
export async function matchPurchaseLines(lines) {
  const list = Array.isArray(lines) ? lines : []
  const needsMatch = list.some(
    (line) => !(line?.moyskladAssortmentHref && line?.moyskladAssortmentType),
  )
  if (!needsMatch) return list

  const index = await loadProductIndex()
  const next = []
  for (const line of list) {
    if (line?.moyskladAssortmentHref && line?.moyskladAssortmentType) {
      next.push(line)
      continue
    }
    try {
      // Prefer in-memory index first — avoids 3 HTTP filters per line.
      let matched = findInProductIndexByArticle(index, line.article)
      let matchNote = matched ? 'article' : null
      if (!matched) {
        matched = await resolveAssortmentByName(line.name)
        matchNote = matched ? 'name' : null
      }
      if (!matched && String(line.article || '').trim()) {
        matched = await resolveAssortmentByArticle(line.article)
        matchNote = matched ? 'article' : null
      }
      if (!matched) {
        next.push({
          ...line,
          moyskladProductId: null,
          moyskladAssortmentHref: null,
          moyskladAssortmentType: null,
          matchError: `Не найден в МС («${line.article || line.name}»)`,
        })
        continue
      }
      next.push({
        ...line,
        moyskladProductId: matched.id,
        moyskladAssortmentHref: matched.href,
        moyskladAssortmentType: matched.type,
        matchError: matchNote === 'name' ? `по названию: ${matched.name}` : null,
      })
    } catch (error) {
      next.push({
        ...line,
        moyskladProductId: null,
        moyskladAssortmentHref: null,
        moyskladAssortmentType: null,
        matchError: error instanceof Error ? error.message : 'Ошибка матча',
      })
    }
  }
  return next
}

function sumLinesKopecks(lines = []) {
  return (Array.isArray(lines) ? lines : []).reduce((sum, line) => {
    const qty = Number(line.qtyOrdered)
    const price = Number(line.price)
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return sum
    return sum + Math.round(qty * price * 100)
  }, 0)
}

/**
 * Link an already-existing MoySklad purchaseorder (local id or externalCode).
 * @param {object} purchase
 * @param {object} existing
 * @param {{ created?: boolean, lines?: object[], pay?: boolean }} [opts]
 */
async function linkExistingPurchaseOrder(purchase, existing, opts = {}) {
  const id = entityId(existing)
  if (!id) {
    const error = new Error('МойСклад не вернул id заказа поставщику')
    error.status = 502
    throw error
  }

  const lines = opts.lines || purchase.lines || []
  // Do NOT await org/agent here — that delays the UI. Cashout resolves them in background.
  const sumKopecks =
    typeof existing.sum === 'number' && existing.sum > 0
      ? existing.sum
      : sumLinesKopecks(lines)

  return {
    id,
    name: existing.name || purchase.moysklad?.purchaseOrderName || null,
    href:
      existing?.meta?.uuidHref ||
      existing?.meta?.href ||
      purchase.moysklad?.purchaseOrderHref ||
      null,
    agentId: purchase.moysklad?.agentId || null,
    organizationId: null,
    sumKopecks,
    created: Boolean(opts.created),
    lines,
  }
}

/**
 * Create MoySklad purchaseorder from a local purchase draft.
 * Cash-out / «Оплачено» is intentionally separate so the local store can be
 * persisted right after the order exists in MoySklad.
 * @param {object} purchase
 */
export async function createPurchaseOrderInMoySklad(purchase) {
  if (purchase?.moysklad?.purchaseOrderId) {
    return {
      id: purchase.moysklad.purchaseOrderId,
      name: purchase.moysklad.purchaseOrderName,
      href: purchase.moysklad.purchaseOrderHref,
      agentId: purchase.moysklad.agentId,
      organizationId: null,
      sumKopecks: null,
      created: false,
      lines: purchase.lines,
    }
  }

  const externalCode = purchase.invoiceNumber
    ? String(purchase.invoiceNumber).slice(0, 255)
    : ''

  // Recover stuck drafts: order already in МС, local purchaseOrderId still null.
  if (externalCode) {
    const existing = await findPurchaseOrderByExternalCode(externalCode).catch(() => null)
    if (existing && entityId(existing)) {
      return linkExistingPurchaseOrder(purchase, existing, {
        created: false,
        lines: purchase.lines,
      })
    }
  }

  const baseUrl = getBaseUrl()
  const lines = Array.isArray(purchase.lines) ? purchase.lines : []
  const alreadyMatched =
    lines.length > 0 &&
    lines.every((line) => line?.moyskladAssortmentHref && line?.moyskladAssortmentType)

  const [organizationId, storeId, agent, matchedLines] = await Promise.all([
    resolveOrganizationId(baseUrl),
    resolveStoreId(),
    resolveSupplierAgent(purchase.supplierName),
    alreadyMatched ? Promise.resolve(lines) : matchPurchaseLines(lines),
  ])

  const unmatched = matchedLines.filter((line) => !line.moyskladAssortmentHref)
  if (unmatched.length) {
    const sample = unmatched
      .slice(0, 5)
      .map((line) => line.article || line.name)
      .join(', ')
    const error = new Error(
      `Не удалось сопоставить ${unmatched.length} поз. с каталогом МС: ${sample}`,
    )
    error.status = 422
    error.lines = matchedLines
    throw error
  }

  const positions = matchedLines.map((line) => ({
    quantity: Number(line.qtyOrdered),
    price: Math.round(Number(line.price) * 100),
    assortment: {
      meta: {
        href: line.moyskladAssortmentHref,
        type: line.moyskladAssortmentType,
        mediaType: 'application/json',
      },
    },
  }))

  if (!positions.length) {
    const error = new Error('Нет позиций для заказа поставщику')
    error.status = 400
    throw error
  }

  const descriptionParts = [
    purchase.invoiceNumber ? `Счёт ${purchase.invoiceNumber}` : '',
    purchase.invoiceDate ? `от ${purchase.invoiceDate}` : '',
    purchase.sourcePdfName ? `PDF: ${purchase.sourcePdfName}` : '',
  ].filter(Boolean)

  const body = {
    organization: { meta: meta('organization', organizationId, baseUrl) },
    agent: { meta: meta('counterparty', agent.id, baseUrl) },
    store: { meta: meta('store', storeId, baseUrl) },
    description: descriptionParts.join(' · ') || 'Закупка из админки litcom52',
    positions,
  }

  if (externalCode) {
    body.externalCode = externalCode
  }

  let created
  try {
    created = await moyskladFetch('/entity/purchaseorder', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (error) {
    // Race: created in МС between our pre-check and POST.
    if (externalCode) {
      const existing = await findPurchaseOrderByExternalCode(externalCode).catch(() => null)
      if (existing && entityId(existing)) {
        return linkExistingPurchaseOrder(purchase, existing, {
          created: false,
          lines: matchedLines,
        })
      }
    }
    throw error
  }

  const id = entityId(created)
  if (!id) {
    const error = new Error('МойСклад не вернул id заказа поставщику')
    error.status = 502
    throw error
  }

  const orderedSumKopecks = sumLinesKopecks(matchedLines)
  const sumKopecks =
    typeof created.sum === 'number' && created.sum > 0 ? created.sum : orderedSumKopecks

  return {
    id,
    name: created.name || null,
    href: created?.meta?.uuidHref || created?.meta?.href || null,
    agentId: agent.id,
    organizationId,
    sumKopecks,
    created: true,
    lines: matchedLines,
  }
}

/**
 * Create cashout for an already-created purchase order (marks «Оплачено» in МС).
 * @param {{
 *   purchaseOrderId: string,
 *   organizationId: string,
 *   agentId: string,
 *   sumKopecks: number,
 *   purpose?: string,
 * }} input
 */
export async function payPurchaseOrderInMoySklad(input) {
  return createCashOutForPurchaseOrder(input)
}
