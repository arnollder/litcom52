/**
 * Capacitor bridge for the APK WebView.
 *
 * Do NOT import @capacitor/* packages into the Vite bundle: that registers
 * web stubs and yields "plugin is not implemented on web" inside the native
 * WebView. Use the bridge injected by the Android WebView instead.
 */

/** True inside Capacitor Android/iOS WebView (native bridge present). */
export function isCapacitorNative() {
  if (typeof window === 'undefined') return false
  try {
    const cap = window.Capacitor
    if (!cap) return false
    if (typeof cap.isNativePlatform === 'function') return Boolean(cap.isNativePlatform())
    const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : ''
    return platform === 'android' || platform === 'ios'
  } catch {
    return false
  }
}

export function getCapacitorPlatform() {
  try {
    return window.Capacitor?.getPlatform?.() || 'web'
  } catch {
    return 'web'
  }
}

export function getCapacitorPlugin(name) {
  if (!isCapacitorNative()) return null
  try {
    const cap = window.Capacitor
    if (typeof cap?.isPluginAvailable === 'function' && !cap.isPluginAvailable(name)) {
      return null
    }
    return cap?.Plugins?.[name] || null
  } catch {
    return null
  }
}
