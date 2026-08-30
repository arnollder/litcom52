#!/usr/bin/env node

import webpush from 'web-push'
import {
  listPushSubscriptionsForCounterparty,
  removePushSubscriptionById,
} from './push-subscriptions.mjs'

let configured = false

function readVapidConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:litkom-m52@litkom-m52.ru').trim()
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

export function getVapidPublicKey() {
  return readVapidConfig()?.publicKey || ''
}

function ensureConfigured() {
  if (configured) return readVapidConfig()
  const config = readVapidConfig()
  if (!config) return null
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  configured = true
  return config
}

/**
 * Notify subscribers when an order is marked shipped in MoySklad.
 * @param {{ counterpartyId: string, orderName?: string, counterpartyName?: string }} payload
 */
export async function notifyOrderShipped(payload) {
  const counterpartyId = String(payload?.counterpartyId || '').trim()
  if (!counterpartyId) return { sent: 0, skipped: true, reason: 'no-counterparty' }

  if (!ensureConfigured()) {
    console.warn('[push] VAPID keys not configured — skip notify')
    return { sent: 0, skipped: true, reason: 'no-vapid' }
  }

  const rows = await listPushSubscriptionsForCounterparty(counterpartyId)
  if (!rows.length) return { sent: 0, skipped: false, reason: 'no-subscribers' }

  const orderLabel = payload.orderName ? `№${payload.orderName}` : 'ваш'
  const party = payload.counterpartyName ? ` (${payload.counterpartyName})` : ''
  const body = `Заказ ${orderLabel}${party} отгружен — можно забирать.`

  const pushPayload = JSON.stringify({
    title: 'Заказ готов к выдаче',
    body,
    url: '/shop',
  })

  let sent = 0
  for (const row of rows) {
    try {
      await webpush.sendNotification(row.subscription, pushPayload)
      sent += 1
    } catch (error) {
      const status = error?.statusCode || error?.status
      console.error('[push] send failed', row.id, status, error?.message || error)
      if (status === 404 || status === 410) {
        await removePushSubscriptionById(row.id)
      }
    }
  }

  return { sent, skipped: false }
}
