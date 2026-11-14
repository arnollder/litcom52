/** True inside Capacitor Android/iOS WebView (injected bridge). */
export function isCapacitorNative() {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

export function getCapacitorPlugin(name) {
  if (!isCapacitorNative()) return null
  try {
    return window.Capacitor?.Plugins?.[name] || null
  } catch {
    return null
  }
}
