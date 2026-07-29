#!/usr/bin/env node

/** Stable marker written into MoySklad customerorder.description */
export const STOREFRONT_ORDER_MARKER = 'Заказ с сервиса Литком ЕКБ (arnolder.ru)'

/** Older marker used by previous checkouts — still treated as storefront orders */
export const LEGACY_STOREFRONT_ORDER_MARKERS = ['Заказ с витрины Литком-ЕКБ']

export function isStorefrontOrderComment(description = '') {
  const text = String(description || '')
  if (!text) return false
  if (text.includes(STOREFRONT_ORDER_MARKER)) return true
  return LEGACY_STOREFRONT_ORDER_MARKERS.some((marker) => text.includes(marker))
}

/**
 * Builds MoySklad order description: always includes the service marker.
 * @param {{ counterpartyName?: string, extra?: string }} [options]
 */
export function buildStorefrontOrderComment(options = {}) {
  const parts = [STOREFRONT_ORDER_MARKER]
  const counterpartyName = String(options.counterpartyName || '').trim()
  if (counterpartyName) parts.push(counterpartyName)
  const extra = String(options.extra || '').trim()
  if (extra && !isStorefrontOrderComment(extra)) parts.push(extra)
  return parts.join(' · ')
}
