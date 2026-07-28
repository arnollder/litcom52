import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import catalog from '../data/catalog.json'
import { fetchLiveStock } from '../services/moysklad'

const STORAGE_KEY = 'litcom52-cart'

function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function stripCategoryNumber(name) {
  return String(name || '')
    .replace(/^\d+[\s.\-–—_]*/u, '')
    .trim() || String(name || '').trim()
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

function cloneCatalog(source) {
  return {
    ...source,
    categories: source.categories.map((cat) => ({
      ...cat,
      category: stripCategoryNumber(cat.category),
      products: cat.products.map((product) => ({ ...product })),
    })),
    starterSet: normalizeStarterSet(source.starterSet),
  }
}

function rebuildProductIndex(catalogValue, indexMap) {
  indexMap.clear()
  for (const category of catalogValue.categories) {
    for (const product of category.products) {
      const entry = { ...product, category: category.category }
      indexMap.set(String(product.id), entry)
      indexMap.set(product.name, entry)
    }
  }
}

export const useCartStore = defineStore('cart', () => {
  const liveCatalog = ref(cloneCatalog(catalog))
  const productIndex = new Map()
  rebuildProductIndex(liveCatalog.value, productIndex)

  const quantities = ref(loadCart())
  const toast = ref(null)
  const stockStatus = ref({
    loading: false,
    error: '',
    updatedAt: null,
    live: false,
  })

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

  function clampCartToStock() {
    const next = { ...quantities.value }
    let changed = false
    for (const [id, qty] of Object.entries(next)) {
      const product = productIndex.get(String(id))
      const max = product ? product.stock : 0
      if (!product || max <= 0) {
        delete next[id]
        changed = true
        continue
      }
      if (qty > max) {
        next[id] = max
        changed = true
      }
    }
    if (changed) quantities.value = next
  }

  function applyStockMap(stockById) {
    const nextCatalog = cloneCatalog(liveCatalog.value)
    for (const category of nextCatalog.categories) {
      for (const product of category.products) {
        const key = String(product.id)
        if (Object.prototype.hasOwnProperty.call(stockById, key)) {
          product.stock = Math.max(0, Math.floor(Number(stockById[key]) || 0))
        }
      }
    }
    liveCatalog.value = nextCatalog
    rebuildProductIndex(liveCatalog.value, productIndex)
    clampCartToStock()
  }

  async function refreshStock() {
    stockStatus.value = {
      ...stockStatus.value,
      loading: true,
      error: '',
    }
    try {
      const payload = await fetchLiveStock()
      applyStockMap(payload.stockById || {})
      stockStatus.value = {
        loading: false,
        error: '',
        updatedAt: payload.updatedAt || new Date().toISOString(),
        live: true,
      }
      return payload
    } catch (error) {
      stockStatus.value = {
        ...stockStatus.value,
        loading: false,
        error: error instanceof Error ? error.message : 'Не удалось обновить остатки',
        live: false,
      }
      throw error
    }
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
    const [hard, soft] = liveCatalog.value.starterSet.alternatives[0]
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

    for (const item of liveCatalog.value.starterSet.items) {
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
    catalog: liveCatalog,
    quantities,
    lines,
    total,
    count,
    toast,
    stockStatus,
    getQty,
    setQty,
    changeQty,
    clear,
    addStarterSet,
    showToast,
    refreshStock,
    applyStockMap,
    productIndex,
  }
})
