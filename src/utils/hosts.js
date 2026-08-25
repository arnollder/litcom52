export const STORE_HOST = 'litkom-m52.ru'
export const ADMIN_HOST = 'admin.litkom-m52.ru'

export function isAdminHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  return hostname === ADMIN_HOST || hostname.startsWith('admin.')
}

export function isStoreHost(hostname = typeof window !== 'undefined' ? window.location.hostname : '') {
  return hostname === STORE_HOST || hostname === `www.${STORE_HOST}`
}

export function adminOrigin() {
  return `https://${ADMIN_HOST}`
}
