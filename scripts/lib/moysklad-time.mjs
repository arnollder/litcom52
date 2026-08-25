/**
 * MoySklad document `moment` values are account-local wall clocks without an
 * offset (e.g. "2026-07-29 20:07:00.000"). Russian accounts use Moscow time.
 */
export const MOYSKLAD_TIME_ZONE = 'Europe/Moscow'
const MOYSKLAD_OFFSET = '+03:00'

/**
 * @param {string|null|undefined} moment
 * @returns {string|null} ISO-8601 UTC instant, or null
 */
export function moySkladMomentToIso(moment) {
  if (!moment) return null
  const raw = String(moment).trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?/)
  if (!match) {
    const fallback = new Date(raw)
    return Number.isNaN(fallback.getTime()) ? raw : fallback.toISOString()
  }

  const isoWithOffset = `${match[1]}T${match[2]}${match[3] || ''}${MOYSKLAD_OFFSET}`
  const date = new Date(isoWithOffset)
  return Number.isNaN(date.getTime()) ? raw : date.toISOString()
}

/**
 * Formats an instant the same way MoySklad shows Moscow wall time.
 * @param {string|Date|null|undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatMoySkladDateTime(value, options = {}) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: MOYSKLAD_TIME_ZONE,
      ...options,
    }).format(value instanceof Date ? value : new Date(value))
  } catch {
    return String(value)
  }
}
