#!/usr/bin/env node

import { getBaseUrl, moyskladFetch } from './moysklad-env.mjs'

const STATE_CACHE_TTL_MS = 5 * 60 * 1000

/** @type {{ expiresAt: number, byName: Map<string, object> } | null} */
let statesCache = null

function stateMeta(stateId, baseUrl) {
  return {
    href: `${baseUrl}/entity/customerorder/metadata/states/${stateId}`,
    type: 'state',
    mediaType: 'application/json',
  }
}

function normalizeStateName(name = '') {
  return String(name).trim().toLowerCase()
}

/**
 * Maps MoySklad workflow state name → local admin status.
 */
export function mapMoySkladStateToStatus(stateName) {
  const name = normalizeStateName(stateName)
  if (!name) return null
  if (name.includes('отгруж') || name.includes('отгруз')) return 'shipped'
  if (name.includes('оплач')) return 'paid'
  if (name.includes('отмен')) return 'cancelled'
  if (name.includes('нов')) return 'new'
  return null
}

export function isNewCustomerOrderState(stateName) {
  return mapMoySkladStateToStatus(stateName) === 'new'
}

export function isPaidLikeStatus(status, stateName) {
  if (status === 'paid' || status === 'shipped') return true
  const mapped = mapMoySkladStateToStatus(stateName)
  return mapped === 'paid' || mapped === 'shipped'
}

async function loadCustomerOrderStates() {
  const now = Date.now()
  if (statesCache && statesCache.expiresAt > now) return statesCache.byName

  const metadata = await moyskladFetch('/entity/customerorder/metadata')
  const byName = new Map()
  for (const state of Array.isArray(metadata?.states) ? metadata.states : []) {
    if (!state?.id || !state?.name) continue
    byName.set(normalizeStateName(state.name), state)
  }
  statesCache = { expiresAt: now + STATE_CACHE_TTL_MS, byName }
  return byName
}

export async function resolveCustomerOrderState(target) {
  const byName = await loadCustomerOrderStates()
  const wanted = normalizeStateName(target)

  for (const [name, state] of byName.entries()) {
    if (name === wanted) return state
  }
  for (const [name, state] of byName.entries()) {
    if (name.includes(wanted) || wanted.includes(name)) return state
  }

  const error = new Error(
    `В МойСклад не найден статус заказа «${target}». Проверьте статусы заказов покупателя.`,
  )
  error.status = 400
  throw error
}

export async function buildCustomerOrderStatePayload(stateName) {
  const state = await resolveCustomerOrderState(stateName)
  const baseUrl = getBaseUrl()
  return {
    state,
    payload: {
      state: {
        meta: stateMeta(state.id, baseUrl),
      },
    },
  }
}

/**
 * Fetches live MoySklad customer order fields used by admin.
 */
export async function fetchCustomerOrderSnapshot(orderId) {
  const id = String(orderId || '').trim()
  if (!id) return null

  const order = await moyskladFetch(`/entity/customerorder/${id}?expand=state`)
  const stateName = order?.state?.name || null
  const sum = typeof order?.sum === 'number' ? order.sum / 100 : null
  const payedSum = typeof order?.payedSum === 'number' ? order.payedSum / 100 : 0
  const shippedSum = typeof order?.shippedSum === 'number' ? order.shippedSum / 100 : 0

  return {
    id: order.id,
    name: order.name,
    href: order?.meta?.href || null,
    stateName,
    status: mapMoySkladStateToStatus(stateName),
    sum,
    payedSum,
    shippedSum,
  }
}

/**
 * Sets customerorder workflow state in MoySklad (e.g. Оплачен / Отгружен).
 * @param {string} orderId
 * @param {'Оплачен'|'Отгружен'|'Новый'} stateName
 */
export async function setCustomerOrderState(orderId, stateName) {
  const id = String(orderId || '').trim()
  if (!id) {
    const error = new Error('Не указан id заказа МойСклад')
    error.status = 400
    throw error
  }

  const { state, payload } = await buildCustomerOrderStatePayload(stateName)

  const updated = await moyskladFetch(`/entity/customerorder/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })

  const snapshot = await fetchCustomerOrderSnapshot(id)
  return {
    id: updated.id || id,
    name: updated.name || snapshot?.name || null,
    href: updated?.meta?.href || snapshot?.href || null,
    stateName: snapshot?.stateName || state.name,
    status: snapshot?.status || mapMoySkladStateToStatus(state.name),
  }
}
