import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import catalog from '../data/catalog.json'

const STORAGE_KEY = 'litcom52-cart'

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const productIndex = new Map()
for (const category of catalog.categories) {
  for (const product of category.products) {
    productIndex.set(product.id, { ...product, category: category.category })
    productIndex.set(product.name, { ...product, category: category.category })
  }
}

export const useCartStore = defineStore('cart', () => {
  const quantities = ref(loadCart())
  const toast = ref(null)

  watch(
    quantities,
    (value) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    },
    { deep: true },
  )

  const lines = computed(() =>
    Object.entries(quantities.value)
      .map(([id, qty]) => {
        const product = productIndex.get(Number(id))
        if (!product || qty <= 0) return null
        return {
          ...product,
          qty,
          sum: product.price * qty,
        }
      })
      .filter(Boolean),
  )

  const total = computed(() => lines.value.reduce((sum, line) => sum + line.sum, 0))
  const count = computed(() => lines.value.reduce((sum, line) => sum + line.qty, 0))

  function getQty(id) {
    return quantities.value[id] || 0
  }

  function setQty(id, qty) {
    const product = productIndex.get(Number(id))
    if (!product) return
    const next = Math.max(0, Math.min(product.stock, Math.floor(Number(qty) || 0)))
    if (next === 0) {
      const copy = { ...quantities.value }
      delete copy[id]
      quantities.value = copy
      return
    }
    quantities.value = { ...quantities.value, [id]: next }
  }

  function changeQty(id, delta) {
    setQty(id, getQty(id) + delta)
  }

  function clear() {
    quantities.value = {}
  }

  function showToast(message) {
    toast.value = message
    window.clearTimeout(showToast._t)
    showToast._t = window.setTimeout(() => {
      toast.value = null
    }, 4200)
  }

  function addByName(name, requestedQty, result) {
    const product = productIndex.get(name)
    if (!product) {
      result.skipped.push(name)
      return 0
    }
    const current = getQty(product.id)
    const available = Math.max(0, product.stock - current)
    const added = Math.min(requestedQty, available)
    if (added > 0) setQty(product.id, current + added)
    if (added === 0) result.skipped.push(name)
    else if (added < requestedQty) {
      result.partial.push(`${name}: добавлено ${added} из ${requestedQty}`)
    }
    return added
  }

  function addStarterSet() {
    const result = { partial: [], skipped: [] }
    const [hard, soft] = catalog.starterSet.alternatives[0]
    const hardProduct = productIndex.get(hard)
    const softProduct = productIndex.get(soft)
    const pick =
      hardProduct && getQty(hardProduct.id) < hardProduct.stock
        ? hard
        : softProduct && getQty(softProduct.id) < softProduct.stock
          ? soft
          : null

    if (pick) addByName(pick, 1, result)
    else result.skipped.push('«Базовый текст» в любой обложке')

    for (const item of catalog.starterSet.items) {
      addByName(item.name, item.qty, result)
    }

    let message = 'Стартовый набор добавлен в корзину.'
    if (result.partial.length) {
      message += `\n\nДобавлено частично:\n• ${result.partial.join('\n• ')}`
    }
    if (result.skipped.length) {
      message += `\n\nНе добавлено из-за отсутствия:\n• ${result.skipped.join('\n• ')}`
    }
    showToast(message)
  }

  return {
    catalog,
    quantities,
    lines,
    total,
    count,
    toast,
    getQty,
    setQty,
    changeQty,
    clear,
    addStarterSet,
    showToast,
    productIndex,
  }
})
