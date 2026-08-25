#!/usr/bin/env node

import webpush from 'web-push'
import {
  listPushSubscriptions,
  removePushSubscriptionByEndpoint,
} from './push-subscriptions-store.mjs'

let configured = false

function getVapidSubject() {
  const subject = String(process.env.VAPID_SUBJECT || '').trim()
  if (subject) return subject
  return 'mailto:admin@litkom-m52.ru'
}

export function isWebPushConfigured() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  return Boolean(publicKey && privateKey)
}

export function getVapidPublicKey() {
  return String(process.env.VAPID_PUBLIC_KEY || '').trim()
}

function ensureWebPush() {
  if (configured) return
  const publicKey = getVapidPublicKey()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!publicKey || !privateKey) {
    const error = new Error('Web Push не настроен: задайте VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY в .env')
    error.status = 503
    throw error
  }
  webpush.setVapidDetails(getVapidSubject(), publicKey, privateKey)
  configured = true
}

export async function sendPushToAll(payload) {
  if (!isWebPushConfigured()) return { sent: 0, failed: 0, skipped: true }

  ensureWebPush()
  const subscriptions = await listPushSubscriptions()
  if (!subscriptions.length) return { sent: 0, failed: 0, skipped: false }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: row.keys,
        },
        body,
        { TTL: 60 * 60 },
      )
      sent += 1
    } catch (error) {
      failed += 1
      const status = error?.statusCode || error?.status
      if (status === 404 || status === 410) {
        await removePushSubscriptionByEndpoint(row.endpoint)
      }
      console.error('[web-push] delivery failed', row.endpoint.slice(0, 48), error?.message || error)
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

  return sendPushToAll({
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

  return sendPushToAll({
    title,
    body,
    url: '/',
    tag: orderId ? `order-paid-${orderId}` : 'order-paid',
  })
}
