#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>}
 */
export async function pdfToText(pdfBuffer) {
  const dir = await mkdtemp(join(tmpdir(), 'litcom-invoice-'))
  const pdfPath = join(dir, 'invoice.pdf')
  try {
    await writeFile(pdfPath, pdfBuffer)
    const text = await new Promise((resolve, reject) => {
      const child = spawn('pdftotext', ['-layout', pdfPath, '-'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const chunks = []
      const errChunks = []
      child.stdout.on('data', (c) => chunks.push(c))
      child.stderr.on('data', (c) => errChunks.push(c))
      child.on('error', (err) => {
        if (err?.code === 'ENOENT') {
          reject(new Error('pdftotext не найден. Установите poppler-utils.'))
          return
        }
        reject(err)
      })
      child.on('close', (code) => {
        if (code !== 0) {
          const errText = Buffer.concat(errChunks).toString('utf8').trim()
          reject(new Error(errText || `pdftotext завершился с кодом ${code}`))
          return
        }
        resolve(Buffer.concat(chunks).toString('utf8'))
      })
    })
    return text
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function parseMoney(raw) {
  let cleaned = String(raw || '')
    .replace(/\s/g, '')
    .replace(/₽/g, '')
  // 8,000.00 (US) или 8.000,00 (EU)
  if (/\.\d{2}$/.test(cleaned) && cleaned.includes(',')) {
    cleaned = cleaned.replace(/,/g, '')
  } else if (/,\d{2}$/.test(cleaned) && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    cleaned = cleaned.replace(',', '.')
  }
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseQty(raw) {
  const n = Number(String(raw || '').replace(/\s/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Parse «Литература АН» invoice text from pdftotext -layout.
 * @param {string} text
 */
export function parseInvoiceText(text) {
  const raw = String(text || '')
  const invoiceNumber =
    (raw.match(/Номер счета:\s*(\S+)/i) || [])[1] ||
    (raw.match(/Номер заказа:\s*(\S+)/i) || [])[1] ||
    ''
  const invoiceDate =
    (raw.match(/Дата счета:\s*(\d{2}\.\d{2}\.\d{4})/i) || [])[1] ||
    (raw.match(/Дата заказа:\s*(\d{2}\.\d{2}\.\d{4})/i) || [])[1] ||
    ''

  let supplierName = 'Литература АН'
  const supplierMatch = raw.match(/Литература АН[^\n]*/i)
  if (supplierMatch) supplierName = 'Литература АН'

  const lines = raw.split(/\r?\n/)
  /** @type {Array<{ name: string, article: string, qtyOrdered: number, price: number, weightKg: number | null }>} */
  const items = []
  let pendingName = ''
  let pendingQty = null
  let pendingPrice = null

  // Колонка «Цена» бывает 600.00 / 8,000.00 / 3,900.00 ₽
  const lineItemRe =
    /^(.+?)\s{2,}(\d+)\s{2,}([\d\s.,]+)\s*₽?\s*$/
  const articleRe = /^Артикул:\s*(\S+)\s*$/i
  const weightRe = /^Вес:\s*([\d.,]+)\s*kg/i

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^Товар\b/i.test(trimmed) && /Количество/i.test(trimmed)) continue
    if (/^Итого\b/i.test(trimmed)) continue
    if (/^Customer Notes/i.test(trimmed)) continue
    if (/^Доставка\b/i.test(trimmed)) continue

    const articleMatch = trimmed.match(articleRe)
    if (articleMatch) {
      const article = articleMatch[1]
      if (pendingName && pendingQty != null && pendingPrice != null) {
        items.push({
          name: pendingName,
          article,
          qtyOrdered: pendingQty,
          price: pendingPrice,
          weightKg: null,
        })
      }
      pendingName = ''
      pendingQty = null
      pendingPrice = null
      continue
    }

    const weightMatch = trimmed.match(weightRe)
    if (weightMatch && items.length) {
      const w = parseMoney(weightMatch[1])
      if (w != null) items[items.length - 1].weightKg = w
      continue
    }

    const itemMatch = trimmed.match(lineItemRe)
    if (itemMatch) {
      const name = itemMatch[1].trim()
      const qty = parseQty(itemMatch[2])
      // В счёте «Литература АН» в колонке «Цена» — сумма строки, не цена за шт.
      const lineTotal = parseMoney(itemMatch[3])
      if (name && qty != null && lineTotal != null && !/^Итого$/i.test(name)) {
        pendingName = name
        pendingQty = qty
        pendingPrice = Math.round((lineTotal / qty) * 100) / 100
      }
    }
  }

  const totalMatch = raw.match(/Итого\s+([\d\s.,]+)\s*₽/)
  const total = totalMatch ? parseMoney(totalMatch[1]) : null

  return {
    invoiceNumber: String(invoiceNumber || '').trim(),
    invoiceDate: String(invoiceDate || '').trim(),
    supplierName,
    total,
    lines: items.map((item) => ({
      name: item.name,
      article: item.article,
      qtyOrdered: item.qtyOrdered,
      price: item.price,
      weightKg: item.weightKg,
    })),
  }
}

/**
 * @param {Buffer} pdfBuffer
 * @param {{ filename?: string }} [opts]
 */
export async function parseInvoicePdf(pdfBuffer, opts = {}) {
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) {
    const error = new Error('PDF пустой')
    error.status = 400
    throw error
  }
  const text = await pdfToText(pdfBuffer)
  const parsed = parseInvoiceText(text)
  if (!parsed.lines.length) {
    const error = new Error('В PDF не найдены позиции с артикулами')
    error.status = 422
    throw error
  }
  return {
    ...parsed,
    sourcePdfName: opts.filename || '',
    parsedAt: new Date().toISOString(),
  }
}
