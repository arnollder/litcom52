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

function normalizeStarterSet(rawStarterSet) {
  if (!Array.isArray(rawStarterSet)) return rawStarterSet
  return {
    title: 'Стартовый набор',
    description: 'Быстрое добавление базового комплекта в корзину.',
    note: 'Набор автоматически учитывает текущие остатки.',
    alternatives: [['"Базовый текст" в твёрдой обложке', '"Базовый текст" в мягкой обложке']],
    items: rawStarterSet,
  }
}

const normalizedCatalog = {
  ...catalog,
  starterSet: normalizeStarterSet(catalog.starterSet),
}

const productIndex = new Map()
for (const category of normalizedCatalog.categories) {
  for (const product of category.products) {
    productIndex.set(String(product.id), { ...product, category: category.category })
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
        const product = productIndex.get(String(id))
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
    return quantities.value[String(id)] || 0
  }

  function setQty(id, qty) {
    const key = String(id)
    const product = productIndex.get(key)
    if (!product) return
    const next = Math.max(0, Math.min(product.stock, Math.floor(Number(qty) || 0)))
    if (next === 0) {
      const copy = { ...quantities.value }
      delete copy[key]
      quantities.value = copy
      return
    }
    quantities.value = { ...quantities.value, [key]: next }
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
    const [hard, soft] = normalizedCatalog.starterSet.alternatives[0]
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

    for (const item of normalizedCatalog.starterSet.items) {
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
    catalog: normalizedCatalog,
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
