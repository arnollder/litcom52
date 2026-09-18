import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'litcom52-theme'

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return null
}

function systemTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function persistTheme(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref(readStoredTheme() || systemTheme())
  applyTheme(theme.value)

  const isLight = computed(() => theme.value === 'light')
  const label = computed(() =>
    theme.value === 'light' ? 'Тёмная тема' : 'Светлая тема',
  )

  function setTheme(next) {
    if (next !== 'light' && next !== 'dark') return
    if (next === theme.value) return

    const applyChange = () => {
      theme.value = next
      applyTheme(next)
      persistTheme(next)
    }

    if (
      typeof document === 'undefined'
      || prefersReducedMotion()
      || typeof document.startViewTransition !== 'function'
    ) {
      applyChange()
      return
    }

    document.startViewTransition(applyChange)
  }

  function toggle() {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }

  return {
    theme,
    isLight,
    label,
    setTheme,
    toggle,
  }
})
