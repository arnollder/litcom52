import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const deferredPrompt = ref(null)
const installed = ref(false)
let listenersAttached = false

function isStandaloneDisplay() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  )
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function onBeforeInstallPrompt(event) {
  event.preventDefault()
  deferredPrompt.value = event
}

function onAppInstalled() {
  deferredPrompt.value = null
  installed.value = true
}

function ensureListeners() {
  if (listenersAttached || typeof window === 'undefined') return
  listenersAttached = true

  if (isStandaloneDisplay()) {
    installed.value = true
    return
  }

  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
}

export function usePwaInstall() {
  const tipOpen = ref(false)

  const isIos = computed(() => (typeof window === 'undefined' ? false : isIosDevice()))
  const canNativeInstall = computed(() => Boolean(deferredPrompt.value))
  const visible = computed(() => !installed.value)

  onMounted(() => {
    ensureListeners()
    if (isStandaloneDisplay()) installed.value = true
  })

  async function install() {
    tipOpen.value = false

    if (deferredPrompt.value) {
      deferredPrompt.value.prompt()
      const choice = await deferredPrompt.value.userChoice
      deferredPrompt.value = null
      if (choice.outcome === 'accepted') installed.value = true
      return
    }

    tipOpen.value = true
  }

  function closeTip() {
    tipOpen.value = false
  }

  onBeforeUnmount(() => {
    tipOpen.value = false
  })

  return {
    visible,
    canNativeInstall,
    isIos,
    tipOpen,
    install,
    closeTip,
  }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
