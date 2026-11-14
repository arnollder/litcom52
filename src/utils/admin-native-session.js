import { getCapacitorPlugin, isCapacitorNative } from './capacitor.js'

const MODE_KEY = 'litcom52.adminMode'
const TOKEN_KEY = 'litcom52.adminToken'

/**
 * Persist admin login in native Preferences (shared with Capacitor splash).
 * Next app cold-start opens /admin with the token automatically.
 */
export async function saveNativeAdminSession(token) {
  if (!isCapacitorNative()) return
  const Preferences = getCapacitorPlugin('Preferences')
  if (!Preferences?.set) return
  const value = String(token || '').trim()
  if (!value) return
  try {
    await Preferences.set({ key: MODE_KEY, value: '1' })
    await Preferences.set({ key: TOKEN_KEY, value })
  } catch (error) {
    console.warn('[admin-session] save failed', error)
  }
}

export async function clearNativeAdminSession() {
  if (!isCapacitorNative()) return
  const Preferences = getCapacitorPlugin('Preferences')
  if (!Preferences?.remove) return
  try {
    await Preferences.remove({ key: MODE_KEY })
    await Preferences.remove({ key: TOKEN_KEY })
  } catch (error) {
    console.warn('[admin-session] clear failed', error)
  }
}

export async function readNativeAdminSession() {
  if (!isCapacitorNative()) return { mode: false, token: '' }
  const Preferences = getCapacitorPlugin('Preferences')
  if (!Preferences?.get) return { mode: false, token: '' }
  try {
    const mode = await Preferences.get({ key: MODE_KEY })
    const token = await Preferences.get({ key: TOKEN_KEY })
    return {
      mode: String(mode?.value || '') === '1',
      token: String(token?.value || '').trim(),
    }
  } catch {
    return { mode: false, token: '' }
  }
}
