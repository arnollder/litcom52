#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const ORDERS_PATH = resolve(ROOT_DIR, 'data', 'orders.json')

function emptyStore() {
  return { version: 1, orders: [] }
}

async function ensureStoreFile() {
  await mkdir(dirname(ORDERS_PATH), { recursive: true })
  try {
    await readFile(ORDERS_PATH, 'utf8')
  } catch {
    await writeFile(ORDERS_PATH, `${JSON.stringify(emptyStore(), null, 2)}\n`, 'utf8')
  }
}

async function readStore() {
  await ensureStoreFile()
  try {
    const raw = await readFile(ORDERS_PATH, 'utf8')
    const parsed = raw ? JSON.parse(raw) : emptyStore()
    if (!Array.isArray(parsed?.orders)) return emptyStore()
    return { version: 1, orders: parsed.orders }
  } catch {
    return emptyStore()
  }
}

async function writeStore(store) {
  await ensureStoreFile()
  const payload = {
    version: 1,
    orders: Array.isArray(store.orders) ? store.orders : [],
  }
  await writeFile(ORDERS_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

/**
 * Persist a storefront order after successful MoySklad reserve.
 * @param {{
 *   customer?: object,
 *   items?: array,
 *   total?: number,
 *   comment?: string,
 *   moySklad?: object,
 *   createdAt?: string,
 * }} input
 */
export async function appendOrder(input) {
  const store = await readStore()
  const order = {
    id: randomUUID(),
    createdAt: input.createdAt || new Date().toISOString(),
    status: 'new',
    customer: input.customer || null,
    items: Array.isArray(input.items) ? input.items : [],
    total: Number.isFinite(Number(input.total)) ? Number(input.total) : null,
    comment: input.comment || '',
    moySklad: input.moySklad || null,
  }
  store.orders.unshift(order)
  await writeStore(store)
  return order
}

export async function listOrders({ status } = {}) {
  const store = await readStore()
  let orders = store.orders
  if (status) {
    orders = orders.filter((order) => order.status === status)
  }
  return {
    orders,
    count: orders.length,
    newCount: store.orders.filter((order) => order.status === 'new').length,
  }
}

export async function updateOrderStatus(id, status) {
  const allowed = new Set(['new', 'seen', 'done'])
  if (!allowed.has(status)) {
    const error = new Error('Некорректный статус. Допустимо: new, seen, done')
    error.status = 400
    throw error
  }

  const store = await readStore()
  const index = store.orders.findIndex((order) => order.id === id)
  if (index < 0) {
    const error = new Error('Заказ не найден')
    error.status = 404
    throw error
  }

  store.orders[index] = {
    ...store.orders[index],
    status,
    updatedAt: new Date().toISOString(),
  }
  await writeStore(store)
  return store.orders[index]
}
