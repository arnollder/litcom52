import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

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

export const useThemeStore = defineStore('theme', () => {
  const theme = ref(readStoredTheme() || systemTheme())
  applyTheme(theme.value)

  const isLight = computed(() => theme.value === 'light')
  const label = computed(() =>
    theme.value === 'light' ? 'Тёмная тема' : 'Светлая тема',
  )

  watch(theme, (value) => {
    applyTheme(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* ignore */
    }
  })

  function setTheme(next) {
    if (next === 'light' || next === 'dark') theme.value = next
  }

  function toggle() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  return {
    theme,
    isLight,
    label,
    setTheme,
    toggle,
  }
})
