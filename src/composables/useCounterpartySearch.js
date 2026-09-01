import { computed, onMounted, ref } from 'vue'
import { fetchCounterpartiesFromMoySklad } from '../services/moysklad'
import { getSavedCounterparty, saveCounterparty } from '../utils/counterparty.js'

const MAX_VISIBLE_COUNTERPARTIES = 24
const EN_LAYOUT = '`qwertyuiop[]asdfghjkl;\'zxcvbnm,./'
const RU_LAYOUT = 'ёйцукенгшщзхъфывапролджэячсмитьбю.'

function makeLayoutMap(from, to) {
  const map = Object.create(null)
  for (let i = 0; i < from.length; i += 1) {
    map[from[i]] = to[i]
  }
  return map
}

const EN_TO_RU = makeLayoutMap(EN_LAYOUT, RU_LAYOUT)
const RU_TO_EN = makeLayoutMap(RU_LAYOUT, EN_LAYOUT)

const CYR_TO_LAT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
}

function swapLayout(value, map) {
  return String(value || '')
    .split('')
    .map((char) => map[char] || char)
    .join('')
}

function toLatinPhonetic(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((char) => CYR_TO_LAT[char] ?? char)
    .join('')
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
}

function makeSearchForms(value) {
  const raw = String(value || '').toLowerCase().trim()
  if (!raw) return []
  const variants = [
    raw,
    swapLayout(raw, EN_TO_RU),
    swapLayout(raw, RU_TO_EN),
    toLatinPhonetic(raw),
    toLatinPhonetic(swapLayout(raw, EN_TO_RU)),
    toLatinPhonetic(swapLayout(raw, RU_TO_EN)),
  ]
  return [...new Set(variants.map((item) => normalizeText(item)).filter(Boolean))]
}

/**
 * @param {{ persist?: boolean, onSelect?: (value: { id: string, name: string } | null) => void }} [options]
 */
export function useCounterpartySearch(options = {}) {
  const persist = options.persist !== false

  const counterparties = ref([])
  const isLoading = ref(false)
  const error = ref('')
  const warning = ref('')
  const selectedId = ref('')
  const query = ref('')
  const resultsOpen = ref(false)

  const selected = computed(
    () => counterparties.value.find((item) => item.id === selectedId.value) || null,
  )

  const indexedCounterparties = computed(() =>
    counterparties.value.map((item) => {
      const base = `${item.name || ''} ${item.description || ''} ${item.contact || ''}`
      const lower = base.toLowerCase()
      return {
        item,
        searchBlob: normalizeText(base),
        searchBlobRu: normalizeText(swapLayout(lower, EN_TO_RU)),
        searchBlobEn: normalizeText(swapLayout(lower, RU_TO_EN)),
        searchBlobLatin: normalizeText(toLatinPhonetic(base)),
        nameNorm: normalizeText(item.name || ''),
        nameLatin: normalizeText(toLatinPhonetic(item.name || '')),
      }
    }),
  )

  const matchedCounterparties = computed(() => {
    const forms = makeSearchForms(query.value)
    if (!forms.length) return []

    const ranked = []
    for (const entry of indexedCounterparties.value) {
      let score = 0
      let matched = false
      for (const form of forms) {
        const tokens = form.split(/\s+/).filter(Boolean)
        const fits = tokens.every(
          (token) =>
            entry.searchBlob.includes(token) ||
            entry.searchBlobRu.includes(token) ||
            entry.searchBlobEn.includes(token) ||
            entry.searchBlobLatin.includes(token),
        )
        if (!fits) continue
        matched = true
        score += 1
        if (entry.nameNorm.startsWith(form) || entry.nameLatin.startsWith(form)) score += 6
        else if (entry.nameNorm.includes(form) || entry.nameLatin.includes(form)) score += 3
      }
      if (matched) ranked.push({ score, name: entry.item.name || '', item: entry.item })
    }

    ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'))
    return ranked.map((entry) => entry.item)
  })

  const visibleCounterparties = computed(() =>
    matchedCounterparties.value.slice(0, MAX_VISIBLE_COUNTERPARTIES),
  )

  const hasMoreCounterparties = computed(
    () => matchedCounterparties.value.length > visibleCounterparties.value.length,
  )

  function emitSelection(row) {
    const value = row
      ? {
          id: row.id,
          name: row.name,
          contact: row.contact || '',
        }
      : null
    options.onSelect?.(value)
    return value
  }

  function selectById(id) {
    selectedId.value = id
    const row = counterparties.value.find((item) => item.id === id)
    if (row?.name) query.value = row.name
    resultsOpen.value = false
    if (row && persist) saveCounterparty({ id: row.id, name: row.name })
    return emitSelection(row)
  }

  function onQueryInput() {
    selectedId.value = ''
    resultsOpen.value = Boolean(query.value.trim())
    emitSelection(null)
  }

  async function load(initial) {
    isLoading.value = true
    error.value = ''
    warning.value = ''
    try {
      const { rows, warning: loadWarning } = await fetchCounterpartiesFromMoySklad()
      counterparties.value = rows
      warning.value = loadWarning

      const preferred =
        initial ||
        (selectedId.value ? { id: selectedId.value } : null) ||
        getSavedCounterparty()
      if (preferred?.id && rows.some((row) => row.id === preferred.id)) {
        selectById(preferred.id)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Не удалось загрузить контрагентов.'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(() => {
    const saved = getSavedCounterparty()
    if (saved?.name) query.value = saved.name
    if (saved?.id) selectedId.value = saved.id
    load(saved)
  })

  return {
    counterparties,
    isLoading,
    error,
    warning,
    selectedId,
    selected,
    query,
    resultsOpen,
    matchedCounterparties,
    visibleCounterparties,
    hasMoreCounterparties,
    selectById,
    onQueryInput,
    load,
  }
}
