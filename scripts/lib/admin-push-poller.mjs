#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { listCustomerOrdersForAdmin } from './list-customer-orders.mjs'
import { isWebPushConfigured, notifyNewOrders, notifyOrderPaid } from './web-push.mjs'
import { loadEnvFromFile } from './moysklad-env.mjs'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '../..')
const STATE_PATH = resolve(ROOT_DIR, 'data', 'push-poller-state.json')
const POLL_MS = Number(process.env.ADMIN_PUSH_POLL_MS || 30_000)

let timer = null
let polling = false

async function readState() {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  try {
    const raw = await readFile(STATE_PATH, 'utf8')
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      knownNewIds: Array.isArray(parsed.knownNewIds) ? parsed.knownNewIds : [],
      knownPaidIds: Array.isArray(parsed.knownPaidIds) ? parsed.knownPaidIds : [],
    }
  } catch {
    return { knownNewIds: [], knownPaidIds: [] }
  }
}

async function writeState(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  await writeFile(
    STATE_PATH,
    `${JSON.stringify(
      {
        knownNewIds: state.knownNewIds,
        knownPaidIds: state.knownPaidIds,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

async function pollOnce({ bootstrap = false } = {}) {
  if (polling) return
  polling = true
  try {
    await loadEnvFromFile()
    if (!isWebPushConfigured()) return

    const listed = await listCustomerOrdersForAdmin({ limit: 100 })
    const newOrders = listed.orders.filter((order) => order.status === 'new')
    const paidOrders = listed.orders.filter((order) => order.status === 'paid')
    const nextNewIds = newOrders.map((order) => order.id)
    const nextPaidIds = paidOrders.map((order) => order.id)
    const state = await readState()
    const knownNew = new Set(state.knownNewIds)
    const knownPaid = new Set(state.knownPaidIds)

    if (bootstrap && !knownNew.size && !knownPaid.size) {
      await writeState({ knownNewIds: nextNewIds, knownPaidIds: nextPaidIds })
      return
    }

    const freshNew = newOrders.filter((order) => !knownNew.has(order.id))
    if (freshNew.length) {
      const latest = freshNew[0]
      await notifyNewOrders({
        newCount: freshNew.length,
        orderName: latest.moySklad?.name || '',
        orderId: latest.id,
      })
    }

    let freshPaid = []
    if (knownPaid.size === 0 && nextPaidIds.length) {
      // Seed existing paid orders silently (first run / migration).
    } else {
      freshPaid = paidOrders.filter((order) => !knownPaid.has(order.id))
    }
    for (const order of freshPaid) {
      await notifyOrderPaid({
        orderName: order.moySklad?.name || '',
        orderId: order.id,
      })
    }

    await writeState({ knownNewIds: nextNewIds, knownPaidIds: nextPaidIds })
  } catch (error) {
    console.error('[admin-push-poller]', error instanceof Error ? error.message : error)
  } finally {
    polling = false
  }
}

export function startAdminPushPoller() {
  if (timer) return
  if (!isWebPushConfigured()) {
    console.log('[admin-push-poller] disabled — VAPID keys missing')
    return
  }

  console.log(`[admin-push-poller] started (every ${POLL_MS}ms)`)
  pollOnce({ bootstrap: true })
  timer = setInterval(() => pollOnce(), POLL_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopAdminPushPoller() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export async function notifyPushForNewOrder(order = {}) {
  if (!isWebPushConfigured()) return
  await notifyNewOrders({
    newCount: 1,
    orderName: order?.name || order?.moySklad?.name || '',
    orderId: order?.id || order?.moySklad?.id || '',
  })

  const state = await readState()
  const id = String(order?.id || order?.moySklad?.id || '').trim()
  if (!id) return
  const known = new Set(state.knownNewIds)
  known.add(id)
  await writeState({ knownNewIds: [...known], knownPaidIds: state.knownPaidIds })
}

export async function notifyPushForPaidOrder(order = {}) {
  if (!isWebPushConfigured()) return
  await notifyOrderPaid({
    orderName: order?.moySklad?.name || order?.name || '',
    orderId: order?.id || order?.moySklad?.id || '',
    paymentName: order?.moySklad?.paymentName || order?.paymentName || '',
  })

  const state = await readState()
  const id = String(order?.id || order?.moySklad?.id || '').trim()
  if (!id) return
  const knownPaid = new Set(state.knownPaidIds)
  knownPaid.add(id)
  await writeState({ knownNewIds: state.knownNewIds, knownPaidIds: [...knownPaid] })
}
