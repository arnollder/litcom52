#!/usr/bin/env node

import webpush from 'web-push'
import {
  listAdminPushSubscriptions,
  listPushSubscriptionsForCounterparty,
  removePushSubscriptionById,
  removePushSubscription,
} from './push-subscriptions.mjs'

let configured = false

function readVapidConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:litkom-m52@litkom-m52.ru').trim()
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

export function isWebPushConfigured() {
  return Boolean(readVapidConfig())
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

async function sendPushToSubscriptions(subscriptions, payload, { onDeadEndpoint } = {}) {
  if (!ensureConfigured()) {
    console.warn('[push] VAPID keys not configured — skip notify')
    return { sent: 0, failed: 0, skipped: true, reason: 'no-vapid' }
  }
  if (!subscriptions.length) {
    return { sent: 0, failed: 0, skipped: false, reason: 'no-subscribers' }
  }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(row, body, { TTL: 60 * 60 })
      sent += 1
    } catch (error) {
      failed += 1
      const status = error?.statusCode || error?.status
      console.error('[push] send failed', row.endpoint?.slice(0, 48), status, error?.message || error)
      if (status === 404 || status === 410) {
        if (onDeadEndpoint) await onDeadEndpoint(row)
        else if (row.id) await removePushSubscriptionById(row.id)
        else if (row.endpoint) await removePushSubscription(row.endpoint)
      }
    }
  }

  return { sent, failed, skipped: false }
}

export async function notifyNewOrders({ newCount, orderName = '', orderId = '' } = {}) {
  const count = Math.max(Number(newCount) || 0, 1)
  const title = count === 1 ? 'Новый заказ' : `Новых заказов: ${count}`
  const body =
    orderName && count === 1
      ? `Заказ №${orderName} ждёт обработки`
      : count === 1
        ? 'Поступил новый заказ в админку'
        : `${count} заказов со статусом «Новый»`

  const subscriptions = await listAdminPushSubscriptions()
  return sendPushToSubscriptions(subscriptions, {
    title,
    body,
    badge: count,
    url: '/',
    tag: orderId ? `order-${orderId}` : 'new-orders',
  })
}

export async function notifyOrderPaid({ orderName = '', orderId = '', paymentName = '' } = {}) {
  const title = 'Заказ оплачен'
  const body =
    orderName && paymentName
      ? `Заказ №${orderName} — платёж ${paymentName}`
      : orderName
        ? `Заказ №${orderName} отмечен как «Оплачен»`
        : 'Заказ переведён в статус «Оплачен»'

  const subscriptions = await listAdminPushSubscriptions()
  return sendPushToSubscriptions(subscriptions, {
    title,
    body,
    url: '/',
    tag: orderId ? `order-paid-${orderId}` : 'order-paid',
  })
}

/**
 * Notify customer subscribers when an order is marked shipped in MoySklad.
 */
export async function notifyOrderShipped(payload) {
  const counterpartyId = String(payload?.counterpartyId || '').trim()
  if (!counterpartyId) return { sent: 0, skipped: true, reason: 'no-counterparty' }

  const rows = await listPushSubscriptionsForCounterparty(counterpartyId)
  if (!rows.length) return { sent: 0, skipped: false, reason: 'no-subscribers' }

  const orderLabel = payload.orderName ? `№${payload.orderName}` : 'ваш'
  const party = payload.counterpartyName ? ` (${payload.counterpartyName})` : ''
  const body = `Заказ ${orderLabel}${party} отгружен — можно забирать.`

  return sendPushToSubscriptions(
    rows,
    {
      title: 'Заказ готов к выдаче',
      body,
      url: '/shop',
      tag: 'litcom52-shipped',
    },
    {
      onDeadEndpoint: (row) => removePushSubscriptionById(row.id),
    },
  )
}
