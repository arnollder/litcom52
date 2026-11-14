#!/usr/bin/env node

import webpush from 'web-push'
import {
  listAdminFcmTokens,
  listAdminPushSubscriptions,
  listCustomerFcmTokens,
  listPushSubscriptionsForCounterparty,
  removePushSubscriptionById,
  removePushSubscription,
  removePushSubscriptionByToken,
} from './push-subscriptions.mjs'
import { sendFcmToTokens } from './fcm-push.mjs'

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

function groupLabel(name) {
  const value = String(name || '').trim()
  return value || 'неизвестной группы'
}

export async function notifyNewOrders({
  newCount,
  orderName = '',
  orderId = '',
  counterpartyName = '',
} = {}) {
  const count = Math.max(Number(newCount) || 0, 1)
  const group = groupLabel(counterpartyName)
  const title = count === 1 ? 'Новый заказ' : `Новых заказов: ${count}`
  const body =
    count === 1
      ? `Группа ${group} оформила заказ. Ждём подтверждения оплаты.`
      : `${count} новых заказов ждут подтверждения оплаты.`

  const payload = {
    title,
    body,
    badge: count,
    url: '/admin',
    tag: orderId ? `order-${orderId}` : 'new-orders',
  }
  const subscriptions = await listAdminPushSubscriptions()
  const web = await sendPushToSubscriptions(subscriptions, payload)
  const fcmTokens = await listAdminFcmTokens()
  const fcm = await sendFcmToTokens(fcmTokens, payload, {
    onDeadToken: (token) => removePushSubscriptionByToken(token),
  })
  return {
    sent: (web.sent || 0) + (fcm.sent || 0),
    failed: (web.failed || 0) + (fcm.failed || 0),
    web,
    fcm,
  }
}

export async function notifyOrderPaid({
  orderName = '',
  orderId = '',
  counterpartyName = '',
} = {}) {
  const group = groupLabel(counterpartyName)
  const title = 'Оплачено'
  const body = `Платёж от группы ${group} подтверждён. Ждём отгрузку.`

  const payload = {
    title,
    body,
    url: '/admin',
    tag: orderId ? `order-paid-${orderId}` : 'order-paid',
  }
  const subscriptions = await listAdminPushSubscriptions()
  const web = await sendPushToSubscriptions(subscriptions, payload)
  const fcmTokens = await listAdminFcmTokens()
  const fcm = await sendFcmToTokens(fcmTokens, payload, {
    onDeadToken: (token) => removePushSubscriptionByToken(token),
  })
  return {
    sent: (web.sent || 0) + (fcm.sent || 0),
    failed: (web.failed || 0) + (fcm.failed || 0),
    web,
    fcm,
  }
}

/**
 * Notify customer subscribers when an order is marked shipped in MoySklad.
 */
export async function notifyOrderShipped(payload) {
  const counterpartyId = String(payload?.counterpartyId || '').trim()
  if (!counterpartyId) return { sent: 0, skipped: true, reason: 'no-counterparty' }

  const rows = await listPushSubscriptionsForCounterparty(counterpartyId)
  const webRows = rows.filter((row) => row.endpoint && row.keys)
  const fcmTokens = await listCustomerFcmTokens(counterpartyId)
  if (!webRows.length && !fcmTokens.length) {
    return { sent: 0, skipped: false, reason: 'no-subscribers' }
  }

  const orderLabel = payload.orderName ? `№${payload.orderName}` : 'ваш'
  const party = payload.counterpartyName ? ` (${payload.counterpartyName})` : ''
  const body = `Заказ ${orderLabel}${party} отгружен — можно забирать.`
  const message = {
    title: 'Заказ готов к выдаче',
    body,
    url: '/shop',
    tag: 'litcom52-shipped',
  }

  const web = await sendPushToSubscriptions(webRows, message, {
    onDeadEndpoint: (row) => removePushSubscriptionById(row.id),
  })
  const fcm = await sendFcmToTokens(fcmTokens, message, {
    onDeadToken: (token) => removePushSubscriptionByToken(token),
  })
  return {
    sent: (web.sent || 0) + (fcm.sent || 0),
    failed: (web.failed || 0) + (fcm.failed || 0),
    web,
    fcm,
  }
}
