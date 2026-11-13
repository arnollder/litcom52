/** Primary storefront host (Timeweb / arnolder.ru). */
export const STORE_HOST = 'litkom-m52.arnolder.ru'
/** Legacy VPS host — still recognized for bookmarks. */
export const LEGACY_STORE_HOST = 'litkom-m52.ru'
/** Separate admin host on the old setup only. */
export const ADMIN_HOST = 'admin.litkom-m52.ru'

export function isAdminHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  return hostname === ADMIN_HOST || hostname.startsWith('admin.')
}

export function isStoreHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  return (
    hostname === STORE_HOST ||
    hostname === LEGACY_STORE_HOST ||
    hostname === `www.${LEGACY_STORE_HOST}` ||
    hostname === `www.${STORE_HOST}`
  )
}

/**
 * Admin app origin.
 * New prod serves admin on the same host at /admin.
 * Legacy prod used a separate admin.* subdomain.
 */
export function adminOrigin() {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === STORE_HOST || hostname.endsWith('.arnolder.ru')) {
      return window.location.origin
    }
  }
  return `https://${ADMIN_HOST}`
}
