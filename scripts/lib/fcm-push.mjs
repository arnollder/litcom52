#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let messaging = null
let initAttempted = false
let initError = ''

function parseServiceAccount(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function loadServiceAccount() {
  const inline = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT)
  if (inline) return inline

  const pathRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim()
  if (!pathRaw) return null
  const absolute = resolve(pathRaw)
  const raw = await readFile(absolute, 'utf8')
  return parseServiceAccount(raw)
}

/**
 * Firebase Admin (FCM HTTP v1). Optional: skip if credentials missing.
 */
export async function isFcmConfigured() {
  try {
    await ensureMessaging()
    return Boolean(messaging)
  } catch {
    return false
  }
}

async function ensureMessaging() {
  if (messaging) return messaging
  if (initAttempted) {
    if (!messaging && initError) throw new Error(initError)
    return messaging
  }
  initAttempted = true

  try {
    const serviceAccount = await loadServiceAccount()
    if (!serviceAccount) {
      initError = 'FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_PATH не задан'
      return null
    }

    // firebase-admin v12+ ESM: modular app/messaging entrypoints
    const { initializeApp, getApps, cert } = await import('firebase-admin/app')
    const { getMessaging } = await import('firebase-admin/messaging')
    if (!getApps().length) {
      initializeApp({
        credential: cert(serviceAccount),
      })
    }
    messaging = getMessaging()
    return messaging
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error)
    console.error('[fcm] init failed', initError)
    messaging = null
    return null
  }
}

/**
 * Send the same payload shape as web-push (title/body/url/tag/badge) to FCM tokens.
 */
export async function sendFcmToTokens(tokens, payload, { onDeadToken } = {}) {
  const list = [...new Set((tokens || []).map((t) => String(t || '').trim()).filter(Boolean))]
  if (!list.length) {
    return { sent: 0, failed: 0, skipped: false, reason: 'no-subscribers' }
  }

  const api = await ensureMessaging()
  if (!api) {
    console.warn('[fcm] not configured — skip notify')
    return { sent: 0, failed: 0, skipped: true, reason: 'no-fcm' }
  }

  const title = String(payload?.title || 'Литком М52')
  const body = String(payload?.body || '')
  const data = {
    title,
    body,
    url: String(payload?.url || '/'),
    tag: String(payload?.tag || 'litcom52'),
    badge: String(payload?.badge ?? ''),
  }

  let sent = 0
  let failed = 0

  for (const token of list) {
    try {
      await api.send({
        token,
        notification: { title, body },
        data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'litcom52_default',
            sound: 'default',
            tag: data.tag || undefined,
          },
        },
      })
      sent += 1
    } catch (error) {
      failed += 1
      const code = error?.code || error?.errorInfo?.code || ''
      console.error('[fcm] send failed', token.slice(0, 16), code, error?.message || error)
      const dead =
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      if (dead && onDeadToken) await onDeadToken(token)
    }
  }

  return { sent, failed, skipped: false }
}
