import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'
import { PushNotifications } from '@capacitor/push-notifications'

/**
 * Importing plugin modules registers them with the native bridge.
 * Required when the Vue app loads from https://… inside the Capacitor WebView
 * (window.Capacitor.Plugins alone is often empty on remote origins).
 */
const PLUGIN_MAP = {
  App,
  Browser,
  Preferences,
  PushNotifications,
}

/** True inside Capacitor Android/iOS WebView. */
export function isCapacitorNative() {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(Capacitor.isNativePlatform())
  } catch {
    return false
  }
}

export function getCapacitorPlugin(name) {
  if (!isCapacitorNative()) return null
  try {
    return PLUGIN_MAP[name] || Capacitor.Plugins?.[name] || null
  } catch {
    return null
  }
}

export function getCapacitorPlatform() {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}
