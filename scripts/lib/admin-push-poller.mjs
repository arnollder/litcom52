#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { listCustomerOrdersForAdmin } from './list-customer-orders.mjs'
import { isWebPushConfigured, notifyNewOrders } from './web-push.mjs'
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
    }
  } catch {
    return { knownNewIds: [] }
  }
}

async function writeState(state) {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  await writeFile(
    STATE_PATH,
    `${JSON.stringify({ knownNewIds: state.knownNewIds }, null, 2)}\n`,
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
    const nextIds = newOrders.map((order) => order.id)
    const state = await readState()
    const known = new Set(state.knownNewIds)

    if (bootstrap && !known.size) {
      await writeState({ knownNewIds: nextIds })
      return
    }

    const fresh = newOrders.filter((order) => !known.has(order.id))
    if (fresh.length) {
      const latest = fresh[0]
      await notifyNewOrders({
        newCount: fresh.length,
        orderName: latest.moySklad?.name || '',
        orderId: latest.id,
      })
    }

    await writeState({ knownNewIds: nextIds })
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
  await writeState({ knownNewIds: [...known] })
}
