#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const ORDERS_PATH = resolve(ROOT_DIR, 'data', 'orders.json')

const ALLOWED_STATUSES = new Set(['new', 'paid', 'shipped', 'cancelled'])

function emptyStore() {
  return { version: 1, orders: [] }
}

function migrateStatus(status) {
  if (status === 'seen') return 'paid'
  if (status === 'done') return 'shipped'
  if (ALLOWED_STATUSES.has(status)) return status
  return 'new'
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
    return {
      version: 1,
      orders: parsed.orders.map((order) => ({
        ...order,
        status: migrateStatus(order.status),
      })),
    }
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

export async function getOrderById(id) {
  const store = await readStore()
  return store.orders.find((order) => order.id === id) || null
}

/**
 * @param {string} id
 * @param {string} status
 * @param {{ moySklad?: object }} [extra]
 */
export async function updateOrderStatus(id, status, extra = {}) {
  const nextStatus = migrateStatus(status)
  if (!ALLOWED_STATUSES.has(nextStatus)) {
    const error = new Error('Некорректный статус. Допустимо: new, paid, shipped')
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
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    ...(extra.moySklad
      ? {
          moySklad: {
            ...(store.orders[index].moySklad || {}),
            ...extra.moySklad,
          },
        }
      : {}),
  }
  await writeStore(store)
  return store.orders[index]
}

/**
 * Replace one order document in the store.
 */
export async function saveOrder(order) {
  const store = await readStore()
  const index = store.orders.findIndex((item) => item.id === order.id)
  if (index < 0) {
    const error = new Error('Заказ не найден')
    error.status = 404
    throw error
  }
  store.orders[index] = order
  await writeStore(store)
  return store.orders[index]
}
