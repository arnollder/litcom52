<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  acceptAdminPurchase,
  addAdminMailCounterparty,
  checkAdminPurchaseMail,
  createAdminPurchase,
  createAdminPurchaseOrder,
  deleteAdminMailCounterparty,
  deleteAdminPurchase,
  fetchAdminMailCounterparties,
  fetchAdminPurchase,
  fetchAdminPurchaseHistory,
  fetchAdminPurchaseHistoryOrder,
  fetchAdminPurchaseMailInbox,
  fetchAdminPurchases,
  parseAdminPurchasePdf,
  updateAdminMailCounterparty,
  updateAdminPurchaseChecklist,
} from '../services/moysklad'

const STATUS_LABEL = {
  draft: 'Черновик',
  ordered: 'Заказ создан',
  partial: 'Частично принято',
  accepted: 'Принято',
}

const RECEIPT_LABEL = {
  open: 'Не принято',
  partial: 'Частично',
  received: 'Принято',
}

const VIEW_TABS = [
  { key: 'workspace', label: 'Текущие' },
  { key: 'history', label: 'История МС' },
]

const view = ref('workspace')
const purchases = ref([])
const historyOrders = ref([])
const historyOrder = ref(null)
const selectedId = ref('')
const isLoading = ref(false)
const isRefreshing = ref(false)
const isBusy = ref('')
const error = ref('')
const parsePreview = ref(null)
const mailHits = ref([])
/** Soft status after mail sync (not an error). */
const mailNote = ref('')
const showCounterparties = ref(false)
const counterparties = ref([])
const mailMailbox = ref('')
const counterpartyName = ref('')
const counterpartyEmail = ref('')
const savedCounterpartyNames = ref({})
const fileInput = ref(null)
const pickedFileName = ref('')
let refreshSpinTimer = null

const selected = computed(() =>
  purchases.value.find((item) => item.id === selectedId.value) || null,
)

const checkedCount = computed(() => {
  if (!selected.value) return 0
  return selected.value.lines.filter((line) => line.checked).length
})

const allChecked = computed(() => {
  const lines = selected.value?.lines || []
  return lines.length > 0 && lines.every((line) => line.checked)
})

const someChecked = computed(() => {
  const lines = selected.value?.lines || []
  return lines.some((line) => line.checked) && !allChecked.value
})

const selectAllRef = ref(null)

watch([allChecked, someChecked, selectedId], async () => {
  await nextTick()
  if (selectAllRef.value) {
    selectAllRef.value.indeterminate = someChecked.value
  }
})

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Number(value).toLocaleString('ru-RU')}\u00a0₽`
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

/** «От кого»: имя из Контрагенты, не сырой RFC From. */
function mailFromLabel(item) {
  const name = String(item?.mail?.counterpartyName || item?.supplierName || '').trim()
  if (name) return name
  const email = String(item?.mail?.counterpartyEmail || '').trim()
  if (email) return email
  return '—'
}

function resolvePurchaseStatus(item) {
  if (!item) return 'draft'
  if (item.moysklad?.supplyId) {
    const lines = Array.isArray(item.lines) ? item.lines : []
    const allChecked =
      lines.length > 0 &&
      lines.every((line) => line.checked && (line.qtyReceived ?? line.qtyOrdered) > 0)
    return allChecked ? 'accepted' : 'partial'
  }
  if (item.moysklad?.purchaseOrderId) return 'ordered'
  return item.status || 'draft'
}

function statusLabel(statusOrItem) {
  const status =
    statusOrItem && typeof statusOrItem === 'object'
      ? resolvePurchaseStatus(statusOrItem)
      : statusOrItem
  return STATUS_LABEL[status] || status || '—'
}

function receiptLabel(receipt) {
  return RECEIPT_LABEL[receipt] || receipt || '—'
}

async function loadMailInbox({ silent = true } = {}) {
  try {
    const result = await fetchAdminPurchaseMailInbox()
    mailHits.value = result.messages
  } catch (err) {
    if (!silent) {
      error.value = err instanceof Error ? err.message : 'Не удалось загрузить почтовый кэш'
    }
  }
}

async function loadList() {
  isLoading.value = true
  error.value = ''
  try {
    const result = await fetchAdminPurchases()
    purchases.value = result.purchases
    if (selectedId.value && !purchases.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = ''
    }
    await loadMailInbox({ silent: true })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить закупки'
  } finally {
    isLoading.value = false
  }
}

async function loadHistory() {
  isLoading.value = true
  error.value = ''
  try {
    const result = await fetchAdminPurchaseHistory()
    historyOrders.value = result.orders
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить историю МС'
  } finally {
    isLoading.value = false
  }
}

async function refresh() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  if (refreshSpinTimer) window.clearTimeout(refreshSpinTimer)
  try {
    if (view.value === 'history') {
      if (historyOrder.value?.id) await openHistoryOrder(historyOrder.value.id)
      else await loadHistory()
    } else {
      await loadList()
    }
  } finally {
    // Держим оборот минимум ~0.75s, чтобы кручение было видно.
    refreshSpinTimer = window.setTimeout(() => {
      isRefreshing.value = false
      refreshSpinTimer = null
    }, 750)
  }
}

async function openHistoryOrder(id) {
  if (!id) return
  isBusy.value = `history-${id}`
  error.value = ''
  try {
    historyOrder.value = await fetchAdminPurchaseHistoryOrder(id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось открыть накладную'
  } finally {
    isBusy.value = ''
  }
}

function closeHistoryOrder() {
  historyOrder.value = null
}

watch(view, (next) => {
  if (next === 'history') {
    historyOrder.value = null
    if (!historyOrders.value.length) loadHistory()
  }
})

function replacePurchase(purchase) {
  if (!purchase?.id) return false
  const idx = purchases.value.findIndex((item) => item.id === purchase.id)
  if (idx >= 0) {
    const next = purchases.value.slice()
    next[idx] = purchase
    purchases.value = next
  } else {
    purchases.value = [purchase, ...purchases.value]
  }
  selectedId.value = purchase.id
  return true
}

async function onFileChange(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  pickedFileName.value = file.name || 'invoice.pdf'
  isBusy.value = 'parse'
  error.value = ''
  parsePreview.value = null
  try {
    const parsed = await parseAdminPurchasePdf(file)
    parsePreview.value = parsed
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось разобрать PDF'
  } finally {
    isBusy.value = ''
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function checkMail() {
  isBusy.value = 'mail'
  error.value = ''
  mailNote.value = ''
  parsePreview.value = null
  try {
    const result = await checkAdminPurchaseMail()
    mailHits.value = result.messages
    // 200 + пустой active = sync ок: уже разобрали / ничего нового.
    // Не орём «не найден PDF» — это не ошибка.
    if (!result.messages.length) {
      mailNote.value =
        result.added > 0
          ? 'Новые письма обработаны, активных PDF не осталось'
          : result.skippedKnown > 0 || result.scanned > 0
            ? 'Новых PDF нет — почта уже просмотрена'
            : 'На почте нет PDF для разбора'
    }
  } catch (err) {
    await loadMailInbox({ silent: true })
    if (mailHits.value.length) {
      // Кэш есть — показываем его, 404/сеть не стращаем поверх списка
      mailNote.value = 'Показаны сохранённые письма; новых не добавилось'
    } else {
      error.value = err instanceof Error ? err.message : 'Не удалось проверить почту'
    }
  } finally {
    isBusy.value = ''
  }
}

async function loadCounterparties() {
  isBusy.value = 'counterparties'
  error.value = ''
  try {
    const result = await fetchAdminMailCounterparties()
    counterparties.value = result.emails
    mailMailbox.value = String(result.mailbox || '').trim()
    savedCounterpartyNames.value = Object.fromEntries(
      result.emails.map((item) => [item.id, String(item.name || '').trim()]),
    )
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось загрузить контрагентов'
  } finally {
    isBusy.value = ''
  }
}

async function openCounterparties() {
  showCounterparties.value = true
  await loadCounterparties()
}

function closeCounterparties() {
  showCounterparties.value = false
}

function onCounterpartiesKeydown(event) {
  if (event.key === 'Escape' && showCounterparties.value) {
    closeCounterparties()
  }
}

watch(showCounterparties, (open) => {
  if (open) window.addEventListener('keydown', onCounterpartiesKeydown)
  else window.removeEventListener('keydown', onCounterpartiesKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onCounterpartiesKeydown)
})

async function addCounterparty() {
  const name = counterpartyName.value.trim()
  const email = counterpartyEmail.value.trim()
  if (!name || !email || isBusy.value) return
  isBusy.value = 'counterparty-add'
  error.value = ''
  try {
    await addAdminMailCounterparty({ name, email })
    counterpartyName.value = ''
    counterpartyEmail.value = ''
    await loadCounterparties()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось добавить контрагента'
    isBusy.value = ''
  }
}

async function saveCounterpartyName(item) {
  if (!item?.id || isBusy.value) return
  const name = String(item.name || '').trim()
  const prev = savedCounterpartyNames.value[item.id] || ''
  if (name === prev) return
  if (!name) {
    error.value = 'Укажи имя контрагента'
    item.name = prev
    return
  }
  isBusy.value = `counterparty-save-${item.id}`
  error.value = ''
  try {
    const updated = await updateAdminMailCounterparty(item.id, { name })
    counterparties.value = counterparties.value.map((row) =>
      row.id === item.id ? updated : row,
    )
    savedCounterpartyNames.value = {
      ...savedCounterpartyNames.value,
      [item.id]: String(updated.name || '').trim(),
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось сохранить имя'
    item.name = prev
  } finally {
    isBusy.value = ''
  }
}

async function removeCounterparty(id) {
  if (!id || isBusy.value) return
  isBusy.value = `counterparty-del-${id}`
  error.value = ''
  try {
    await deleteAdminMailCounterparty(id)
    counterparties.value = counterparties.value.filter((item) => item.id !== id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось удалить контрагента'
  } finally {
    isBusy.value = ''
  }
}

async function saveDraftFromMail(item) {
  if (!item || isBusy.value) return
  isBusy.value = `mail-draft-${item.id}`
  error.value = ''
  try {
    const purchase = await createAdminPurchase({
      ...item,
      mailInboxId: item.id,
    })
    mailHits.value = mailHits.value.filter((row) => row.id !== item.id)
    replacePurchase(purchase)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось сохранить черновик'
  } finally {
    isBusy.value = ''
  }
}

async function saveDraft() {
  if (!parsePreview.value) return
  isBusy.value = 'save'
  error.value = ''
  try {
    const purchase = await createAdminPurchase(parsePreview.value)
    parsePreview.value = null
    replacePurchase(purchase)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось сохранить черновик'
  } finally {
    isBusy.value = ''
  }
}

async function syncSelectedPurchase(id) {
  if (!id) return false
  try {
    const purchase = await fetchAdminPurchase(id)
    return replacePurchase(purchase)
  } catch {
    return false
  }
}

async function createOrder() {
  if (!selected.value || isBusy.value) return
  const id = selected.value.id
  isBusy.value = 'order'
  error.value = ''
  try {
    const result = await createAdminPurchaseOrder(id)
    const purchase = result?.purchase
    // Apply server purchase immediately — drives «Заказ создан» / «Принять товар».
    if (!replacePurchase(purchase) || !purchase?.moysklad?.purchaseOrderId) {
      if (!(await syncSelectedPurchase(id))) {
        await loadList()
        selectedId.value = id
      }
    }
    if (result?.warning) error.value = result.warning
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось создать заказ в МС'
    // Order may already exist in МС / store even when the request errored.
    if (!(await syncSelectedPurchase(id))) {
      await loadList()
      selectedId.value = id
    }
  } finally {
    isBusy.value = ''
  }
}

async function removePurchase(item, event) {
  event?.stopPropagation?.()
  if (!item?.id) return
  const label = item.invoiceNumber ? `№${item.invoiceNumber}` : 'эту закупку'
  if (!window.confirm(`Удалить ${label} из списка? Документы в МойСклад не трогаем.`)) return
  isBusy.value = `delete-${item.id}`
  error.value = ''
  try {
    await deleteAdminPurchase(item.id)
    purchases.value = purchases.value.filter((row) => row.id !== item.id)
    if (selectedId.value === item.id) selectedId.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось удалить закупку'
  } finally {
    isBusy.value = ''
  }
}

async function toggleLine(line, checked) {
  if (!selected.value || selected.value.moysklad?.supplyId) return
  const lines = selected.value.lines.map((item) =>
    item.id === line.id
      ? {
          id: item.id,
          checked,
          qtyReceived: item.qtyReceived ?? item.qtyOrdered,
        }
      : {
          id: item.id,
          checked: item.checked,
          qtyReceived: item.qtyReceived,
        },
  )
  isBusy.value = `check-${line.id}`
  error.value = ''
  try {
    const purchase = await updateAdminPurchaseChecklist(selected.value.id, lines)
    replacePurchase(purchase)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось обновить чек-лист'
  } finally {
    isBusy.value = ''
  }
}

async function onQtyReceived(line, value) {
  if (!selected.value || selected.value.moysklad?.supplyId) return
  const qty = Number(value)
  const lines = selected.value.lines.map((item) => ({
    id: item.id,
    checked: item.id === line.id ? true : item.checked,
    qtyReceived: item.id === line.id ? qty : item.qtyReceived,
  }))
  isBusy.value = `qty-${line.id}`
  error.value = ''
  try {
    const purchase = await updateAdminPurchaseChecklist(selected.value.id, lines)
    replacePurchase(purchase)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось обновить количество'
  } finally {
    isBusy.value = ''
  }
}

function setAllChecked(checked) {
  if (!selected.value || selected.value.moysklad?.supplyId) return
  const lines = selected.value.lines.map((item) => ({
    id: item.id,
    checked: Boolean(checked),
    qtyReceived: item.qtyReceived ?? item.qtyOrdered,
  }))
  isBusy.value = 'check-all'
  error.value = ''
  updateAdminPurchaseChecklist(selected.value.id, lines)
    .then((purchase) => replacePurchase(purchase))
    .catch((err) => {
      error.value = err instanceof Error ? err.message : 'Не удалось отметить позиции'
    })
    .finally(() => {
      isBusy.value = ''
    })
}

async function acceptGoods() {
  if (!selected.value) return
  isBusy.value = 'accept'
  error.value = ''
  try {
    const result = await acceptAdminPurchase(selected.value.id)
    replacePurchase(result.purchase)
    if (result.warning) error.value = result.warning
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Не удалось создать приёмку'
  } finally {
    isBusy.value = ''
  }
}

onMounted(loadList)
</script>

<template>
  <section class="panel purchases">
    <div class="purchases__head">
      <h2>Закупки</h2>
      <div class="purchases__actions">
        <button
          class="icon-refresh"
          type="button"
          :disabled="Boolean(isBusy) && isBusy !== 'counterparties'"
          :aria-expanded="showCounterparties"
          aria-haspopup="dialog"
          aria-label="Настройки контрагентов"
          title="Контрагенты"
          @click="openCounterparties"
        >
          <svg class="icon-refresh__svg" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            />
            <path
              d="M19.4 13a7.6 7.6 0 0 0 .05-1l2.05-1.6-2-3.46-2.45.9a7.7 7.7 0 0 0-1.73-1L15 4h-4l-.32 2.84a7.7 7.7 0 0 0-1.73 1l-2.45-.9-2 3.46L6.55 12a7.6 7.6 0 0 0 0 2l-2.05 1.6 2 3.46 2.45-.9a7.7 7.7 0 0 0 1.73 1L11 22h4l.32-2.84a7.7 7.7 0 0 0 1.73-1l2.45.9 2-3.46L19.4 13Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          class="icon-refresh"
          type="button"
          :disabled="isLoading || isRefreshing"
          aria-label="Обновить"
          title="Обновить"
          @click="refresh"
        >
          <svg
            class="icon-refresh__svg"
            :class="{ 'icon-refresh__svg--spin': isRefreshing || isLoading }"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M4.05 11a8 8 0 0 1 14.32-4.36M20 4v5h-5M19.95 13a8 8 0 0 1-14.32 4.36M4 20v-5h5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="sub-tabs" role="tablist" aria-label="Разделы закупок">
      <button
        v-for="tab in VIEW_TABS"
        :key="tab.key"
        type="button"
        role="tab"
        class="sub-tabs__tab"
        :class="{ 'sub-tabs__tab--active': view === tab.key }"
        :aria-selected="view === tab.key"
        @click="view = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <Teleport to="body">
      <div
        v-if="showCounterparties"
        class="cp-modal"
        role="presentation"
        @click.self="closeCounterparties"
      >
        <div
          class="cp-modal__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cp-modal-title"
          tabindex="-1"
        >
          <div class="cp-modal__head">
            <h3 id="cp-modal-title">Контрагенты</h3>
            <button
              class="counterparties__del cp-modal__close"
              type="button"
              aria-label="Закрыть"
              title="Закрыть"
              @click="closeCounterparties"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>
          <p v-if="mailMailbox" class="muted cp-modal__mailbox">
            Мониторим {{ mailMailbox }}
          </p>
          <p v-else class="muted cp-modal__mailbox">
            Ящик не задан — MAIL_IMAP_USER в .env
          </p>
          <form class="counterparties__form" @submit.prevent="addCounterparty">
            <label class="counterparties__field">
              <span class="counterparties__label">Имя в МойСклад</span>
              <input
                v-model="counterpartyName"
                class="counterparties__input"
                type="text"
                autocomplete="off"
                placeholder="Например, Литература АН"
                :disabled="Boolean(isBusy)"
              />
            </label>
            <label class="counterparties__field">
              <span class="counterparties__label">Email</span>
              <input
                v-model="counterpartyEmail"
                class="counterparties__input"
                type="email"
                inputmode="email"
                autocomplete="off"
                placeholder="supplier@example.com"
                :disabled="Boolean(isBusy)"
              />
            </label>
            <button
              class="upload__btn counterparties__add"
              type="submit"
              :disabled="Boolean(isBusy) || !counterpartyName.trim() || !counterpartyEmail.trim()"
            >
              <svg class="upload__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 5v14M5 12h14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                />
              </svg>
              <span>{{ isBusy === 'counterparty-add' ? 'Добавляю…' : 'Добавить' }}</span>
            </button>
          </form>
          <div v-if="isBusy === 'counterparties'" class="muted">Загружаю список…</div>
          <ul v-else-if="counterparties.length" class="counterparties__list">
            <li v-for="item in counterparties" :key="item.id" class="counterparties__item">
              <div class="counterparties__avatar" aria-hidden="true">
                {{ (item.name || item.email || '?').slice(0, 1).toUpperCase() }}
              </div>
              <div class="counterparties__fields">
                <input
                  v-model="item.name"
                  class="counterparties__name"
                  type="text"
                  placeholder="Имя в МойСклад"
                  :disabled="Boolean(isBusy)"
                  :aria-label="`Имя контрагента ${item.email}`"
                  @keydown.enter.prevent="saveCounterpartyName(item)"
                  @blur="saveCounterpartyName(item)"
                />
                <span class="counterparties__email">{{ item.email }}</span>
              </div>
              <button
                class="counterparties__del"
                type="button"
                :disabled="Boolean(isBusy)"
                :aria-label="`Удалить ${item.email}`"
                title="Удалить"
                @click="removeCounterparty(item.id)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </li>
          </ul>
          <p v-else class="muted">Список пуст — добавь имя и email.</p>
        </div>
      </div>
    </Teleport>

    <template v-if="view === 'workspace'">
      <div class="upload">
        <input
          id="purchase-pdf-input"
          ref="fileInput"
          class="upload__input"
          type="file"
          accept="application/pdf,.pdf"
          :disabled="Boolean(isBusy)"
          @change="onFileChange"
        />
        <button
          class="upload__mail"
          :class="{ 'upload__mail--scanning': isBusy === 'mail' }"
          type="button"
          :disabled="Boolean(isBusy)"
          @click="checkMail"
        >
          {{ isBusy === 'mail' ? 'Сканирую…' : 'Проверить почту' }}
        </button>
        <label
          class="upload__btn"
          :class="{ 'upload__btn--busy': isBusy === 'parse' || isBusy === 'mail' }"
          for="purchase-pdf-input"
        >
          <svg class="upload__icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 16V4m0 0 4 4m-4-4-4 4M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ isBusy === 'parse' ? 'Разбираю PDF…' : 'Загрузить PDF' }}</span>
        </label>
        <p v-if="pickedFileName && isBusy !== 'parse' && isBusy !== 'mail'" class="muted upload__name">
          {{ pickedFileName }}
        </p>
      </div>

      <div
        v-if="isBusy === 'mail'"
        class="mail-loader"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="mail-loader__stage" aria-hidden="true">
          <span class="mail-loader__ring mail-loader__ring--a" />
          <span class="mail-loader__ring mail-loader__ring--b" />
          <span class="mail-loader__ring mail-loader__ring--c" />
          <span class="mail-loader__orbit">
            <span class="mail-loader__sat mail-loader__sat--1">PDF</span>
            <span class="mail-loader__sat mail-loader__sat--2">@</span>
            <span class="mail-loader__sat mail-loader__sat--3">IN</span>
          </span>
          <div class="mail-loader__envelope">
            <span class="mail-loader__flap" />
            <span class="mail-loader__body">
              <span class="mail-loader__scan" />
              <span class="mail-loader__lines">
                <i /><i /><i />
              </span>
            </span>
          </div>
          <span class="mail-loader__glow" />
        </div>
        <div class="mail-loader__copy">
          <strong class="mail-loader__title">Сканирую почту</strong>
          <span class="mail-loader__dots" aria-hidden="true">
            <i /><i /><i />
          </span>
          <p class="mail-loader__sub">
            Ищу счета у контрагентов · разбираю PDF · собираю черновики
          </p>
        </div>
      </div>

      <p v-else-if="mailNote && !mailHits.length" class="muted">{{ mailNote }}</p>

      <div v-else-if="mailHits.length" class="mail-hits">
        <h3>Найдено на почте ({{ mailHits.length }})</h3>
        <p v-if="mailNote" class="muted">{{ mailNote }}</p>
        <p class="muted">Нажми строку — создастся черновик закупки.</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>От кого</th>
                <th>Тема / файл</th>
                <th>Счёт</th>
                <th>Поз.</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in mailHits"
                :key="item.id"
                class="mail-hits__row"
                :class="{ 'mail-hits__row--busy': isBusy === `mail-draft-${item.id}` }"
                tabindex="0"
                role="button"
                @click="saveDraftFromMail(item)"
                @keydown.enter.prevent="saveDraftFromMail(item)"
                @keydown.space.prevent="saveDraftFromMail(item)"
              >
                <td>{{ formatDate(item.mail?.date) }}</td>
                <td>{{ mailFromLabel(item) }}</td>
                <td>
                  <strong>{{ item.sourcePdfName || item.mail?.subject || 'PDF' }}</strong>
                  <span v-if="item.mail?.subject && item.sourcePdfName" class="muted">
                    · {{ item.mail.subject }}
                  </span>
                </td>
                <td>№{{ item.invoiceNumber || '—' }}</td>
                <td>{{ item.lines?.length || 0 }}</td>
                <td class="mail-hits__sum">{{ formatMoney(item.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="parsePreview" class="preview">
        <h3>Результат парсинга</h3>
        <p class="muted">
          Счёт №{{ parsePreview.invoiceNumber || '—' }}
          от {{ parsePreview.invoiceDate || '—' }}
          · {{ parsePreview.supplierName }}
          · {{ parsePreview.lines.length }} поз.
          · {{ formatMoney(parsePreview.total) }}
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Артикул</th>
                <th>Кол-во</th>
                <th>Цена/шт</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, idx) in parsePreview.lines" :key="`${line.article}-${idx}`">
                <td>{{ line.name }}</td>
                <td><code>{{ line.article }}</code></td>
                <td>{{ line.qtyOrdered }}</td>
                <td>{{ formatMoney(line.price) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="button" :disabled="isBusy === 'save'" @click="saveDraft">
            Сохранить черновик
          </button>
          <button class="btn" type="button" @click="parsePreview = null">Отмена</button>
        </div>
      </div>

      <div class="layout" :class="{ 'layout--detail': Boolean(selected) }">
        <div v-if="!selected" class="list">
          <p v-if="isLoading" class="muted">Загрузка…</p>
          <div
            v-for="item in purchases"
            :key="item.id"
            class="list-item"
          >
            <button type="button" class="list-item__main" @click="selectedId = item.id">
              <strong>№{{ item.invoiceNumber || '—' }}</strong>
              <span class="list-item__status">
                {{ item.invoiceDate || '—' }} · {{ statusLabel(item) }}
              </span>
              <span>{{ formatMoney(item.total) }}</span>
            </button>
            <button
              type="button"
              class="list-item__delete"
              title="Удалить из списка"
              :disabled="isBusy === `delete-${item.id}`"
              @click="removePurchase(item, $event)"
            >
              ×
            </button>
          </div>
        </div>

        <div v-else class="detail">
          <button
            type="button"
            class="detail__back"
            @click="selectedId = ''"
          >
            ← К списку
          </button>
          <h3>Закупка №{{ selected.invoiceNumber || '—' }}</h3>
          <p class="muted">
            {{ selected.supplierName }} · {{ statusLabel(selected) }}
            <template v-if="selected.sourcePdfName"> · {{ selected.sourcePdfName }}</template>
          </p>

          <div class="ms-links muted">
            <span v-if="selected.moysklad?.purchaseOrderName">
              Заказ МС: {{ selected.moysklad.purchaseOrderName }}
            </span>
            <a
              v-if="selected.moysklad?.purchaseOrderHref"
              :href="selected.moysklad.purchaseOrderHref"
              target="_blank"
              rel="noreferrer"
            >открыть</a>
            <span v-if="selected.moysklad?.supplyName">
              · Приёмка: {{ selected.moysklad.supplyName }}
            </span>
            <a
              v-if="selected.moysklad?.supplyHref"
              :href="selected.moysklad.supplyHref"
              target="_blank"
              rel="noreferrer"
            >открыть</a>
          </div>

          <div class="actions">
            <button
              v-if="!selected.moysklad?.purchaseOrderId"
              class="btn btn-primary"
              type="button"
              :disabled="isBusy === 'order'"
              @click="createOrder"
            >
              {{ isBusy === 'order' ? 'Создаю заказ…' : 'Создать заказ' }}
            </button>
            <template v-else-if="!selected.moysklad?.supplyId">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="!checkedCount || isBusy === 'accept'"
                @click="acceptGoods"
              >
                Принять товар ({{ checkedCount }})
              </button>
            </template>
            <span v-else class="ok">Приёмка уже создана</span>
            <div class="detail__total" aria-label="Итого по накладной">
              <strong class="detail__total-sum">{{ formatMoney(selected.total) }}</strong>
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th v-if="selected.moysklad?.purchaseOrderId && !selected.moysklad?.supplyId">
                    <input
                      ref="selectAllRef"
                      type="checkbox"
                      title="Отметить все"
                      aria-label="Отметить все строки"
                      :checked="allChecked"
                      :disabled="Boolean(isBusy) || !selected.lines.length"
                      @change="setAllChecked($event.target.checked)"
                    />
                  </th>
                  <th>Название</th>
                  <th>Артикул</th>
                  <th>Заказано</th>
                  <th v-if="selected.moysklad?.purchaseOrderId">Факт</th>
                  <th>Цена/шт</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in selected.lines" :key="line.id">
                  <td v-if="selected.moysklad?.purchaseOrderId && !selected.moysklad?.supplyId">
                    <input
                      type="checkbox"
                      :checked="line.checked"
                      :disabled="Boolean(isBusy)"
                      @change="toggleLine(line, $event.target.checked)"
                    />
                  </td>
                  <td>{{ line.name }}</td>
                  <td><code>{{ line.article }}</code></td>
                  <td>{{ line.qtyOrdered }}</td>
                  <td v-if="selected.moysklad?.purchaseOrderId">
                    <input
                      v-if="!selected.moysklad?.supplyId"
                      class="qty"
                      type="number"
                      min="0"
                      step="1"
                      :value="line.qtyReceived ?? line.qtyOrdered"
                      :disabled="Boolean(isBusy)"
                      @change="onQtyReceived(line, $event.target.value)"
                    />
                    <span v-else>{{ line.qtyReceived ?? line.qtyOrdered }}</span>
                  </td>
                  <td>{{ formatMoney(line.price) }}</td>
                </tr>
              </tbody>
            </table>
            <div class="detail__table-total">
              <span>Итого</span>
              <strong>{{ formatMoney(selected.total) }}</strong>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="history">
      <template v-if="historyOrder">
        <div class="history-doc">
          <div class="history-doc__head">
            <button
              class="history-back"
              type="button"
              aria-label="К списку"
              title="К списку"
              @click="closeHistoryOrder"
            >
              &lt;
            </button>
            <a class="history-ms" :href="historyOrder.href" target="_blank" rel="noreferrer">
              Открыть в МС
            </a>
          </div>
          <h3>Заказ поставщику №{{ historyOrder.name }}</h3>
          <p class="muted">
            {{ formatDate(historyOrder.moment) }}
            · {{ historyOrder.agent?.name || '—' }}
            · {{ receiptLabel(historyOrder.receipt) }}
            <template v-if="historyOrder.stateName"> · {{ historyOrder.stateName }}</template>
            · {{ formatMoney(historyOrder.sum) }}
          </p>
          <p v-if="historyOrder.description" class="muted">{{ historyOrder.description }}</p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Артикул</th>
                  <th>Кол-во</th>
                  <th>Принято</th>
                  <th>Цена/шт</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in historyOrder.positions" :key="line.id || `${line.name}-${line.article}`">
                  <td>{{ line.name }}</td>
                  <td><code>{{ line.article || '—' }}</code></td>
                  <td>{{ line.qty }}</td>
                  <td>{{ line.shipped }}</td>
                  <td>{{ formatMoney(line.price) }}</td>
                  <td>{{ formatMoney(line.sum) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!historyOrder.positions?.length" class="muted">В заказе нет позиций.</p>
        </div>
      </template>

      <template v-else>
        <p v-if="isLoading" class="muted">Загрузка…</p>
        <p v-else-if="!historyOrders.length" class="muted">В МойСклад пока нет заказов поставщикам.</p>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Номер</th>
                <th>Дата</th>
                <th>Поставщик</th>
                <th>Сумма</th>
                <th>Приёмка</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="order in historyOrders"
                :key="order.id"
                class="history-row"
                :class="{ 'history-row--busy': isBusy === `history-${order.id}` }"
                tabindex="0"
                role="button"
                @click="openHistoryOrder(order.id)"
                @keydown.enter.prevent="openHistoryOrder(order.id)"
                @keydown.space.prevent="openHistoryOrder(order.id)"
              >
                <td><strong class="history-link">{{ order.name }}</strong></td>
                <td>{{ formatDate(order.moment) }}</td>
                <td>{{ order.agent?.name || '—' }}</td>
                <td>{{ formatMoney(order.sum) }}</td>
                <td>
                  <span
                    class="receipt"
                    :class="{
                      'receipt--ok': order.receipt === 'received',
                      'receipt--partial': order.receipt === 'partial',
                    }"
                  >
                    {{ receiptLabel(order.receipt) }}
                  </span>
                </td>
                <td>{{ order.stateName || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.purchases__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}

.purchases__actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-shrink: 0;
}

.icon-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.icon-refresh:hover:not(:disabled) {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.icon-refresh:disabled {
  opacity: 0.65;
  cursor: wait;
}

.icon-refresh__svg {
  width: 1.2rem;
  height: 1.2rem;
  transform-origin: center;
}

.icon-refresh__svg--spin {
  animation: refresh-spin 0.75s linear infinite;
  animation-direction: normal;
}

@keyframes refresh-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.purchases h2,
.purchases h3 {
  margin: 0 0 0.35rem;
}

.sub-tabs {
  display: flex;
  width: 100%;
  margin: 0 0 1.1rem;
  box-shadow: inset 0 -1px 0 var(--line);
}

.sub-tabs__tab {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  padding: 0.75rem 0.5rem;
  border: 0;
  background: transparent;
  color: var(--ink-muted);
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  transition: color 0.15s ease;
}

.sub-tabs__tab::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: transparent;
  transition: background 0.15s ease;
}

.sub-tabs__tab:hover {
  color: var(--ink);
}

.sub-tabs__tab--active {
  color: var(--ink);
}

.sub-tabs__tab--active::after {
  background: var(--green);
}

.history-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.history-row:hover,
.history-row:focus-visible {
  background: var(--accent-fill-soft);
  outline: none;
}

.history-row--busy {
  opacity: 0.6;
  cursor: wait;
}

.history-link {
  color: var(--green);
  font-weight: 700;
}

.history-doc__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  margin-bottom: 0.85rem;
}

.history-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.history-back:hover {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.history-ms {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.6rem;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  font: inherit;
  font-weight: 700;
  font-size: 0.82rem;
  text-decoration: none;
  white-space: nowrap;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.history-ms:hover {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.receipt {
  color: var(--ink-muted);
  font-weight: 600;
}

.receipt--partial {
  color: var(--ink);
}

.receipt--ok {
  color: var(--green);
}

.upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.1rem;
}

.upload .upload__btn,
.upload .upload__mail {
  min-width: 14rem;
}

.upload__input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.upload__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 2.6rem;
  padding: 0.55rem 1rem;
  border: 1px solid transparent;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--green) 0%, var(--green-deep) 100%);
  color: var(--on-green);
  font: inherit;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  white-space: nowrap;
  transition:
    filter 0.2s ease,
    transform 0.2s ease;
}

.upload__btn:hover {
  filter: brightness(1.05);
}

.upload__btn:active {
  transform: translateY(1px);
}

.upload__btn--busy {
  opacity: 0.75;
  pointer-events: none;
}

.upload__mail {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.6rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  font: inherit;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.2s ease,
    border-color 0.2s ease;
}

.upload__mail:hover:not(:disabled) {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.upload__mail:disabled {
  opacity: 0.55;
  cursor: wait;
}

.upload__mail--scanning {
  position: relative;
  overflow: hidden;
  opacity: 1;
  border-color: var(--green);
  color: var(--green-soft);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--green) 25%, transparent);
}

.upload__mail--scanning::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    105deg,
    transparent 35%,
    color-mix(in srgb, var(--green) 22%, transparent) 50%,
    transparent 65%
  );
  background-size: 220% 100%;
  animation: mail-shimmer 1.6s ease-in-out infinite;
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .upload__mail--scanning::after {
    animation: none;
  }
}

.cp-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1.25rem;
  background: rgba(4, 18, 11, 0.62);
  backdrop-filter: blur(8px);
}

.cp-modal__card {
  width: min(36rem, 100%);
  max-height: min(85vh, 40rem);
  overflow: auto;
  padding: 1.2rem 1.3rem 1.25rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-strong);
  box-shadow: var(--shadow);
}

.cp-modal__head {
  position: relative;
  display: grid;
  place-items: center;
  margin-bottom: 1rem;
  min-height: 2.2rem;
}

.cp-modal__head h3 {
  margin: 0;
  font-size: 1.15rem;
  text-align: center;
}

.cp-modal__close {
  position: absolute;
  top: 50%;
  right: 0;
  translate: 0 -50%;
}

.cp-modal__mailbox {
  margin: 0 0 1rem;
  text-align: center;
  word-break: break-all;
  line-height: 1.35;
}

.counterparties__form {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: end;
  margin: 0 0 1.1rem;
}

.counterparties__field {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
}

.counterparties__label {
  font-size: 0.78rem;
  letter-spacing: 0.02em;
  color: var(--ink-muted);
}

.counterparties__input {
  width: 100%;
  min-height: 2.6rem;
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--accent-fill-soft);
  color: var(--ink);
  font: inherit;
}

.counterparties__input:focus {
  outline: none;
  border-color: var(--green);
  background: transparent;
}

.counterparties__add {
  align-self: end;
}

.counterparties__add:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  filter: none;
}

.counterparties__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}

.counterparties__item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line-faint);
  border-radius: 14px;
  background: var(--accent-fill-soft);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.counterparties__item:hover {
  border-color: var(--line);
  background: var(--accent-fill);
}

.counterparties__avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 10px;
  background: linear-gradient(145deg, var(--green-soft), var(--green));
  color: var(--on-green);
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
}

.counterparties__fields {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  flex: 1 1 auto;
}

.counterparties__name {
  width: 100%;
  min-width: 0;
  padding: 0.1rem 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
  font-weight: 650;
  line-height: 1.25;
}

.counterparties__name::placeholder {
  color: var(--ink-muted);
  font-weight: 500;
}

.counterparties__name:focus {
  outline: none;
  box-shadow: inset 0 -1px 0 var(--green);
}

.counterparties__email {
  font-size: 0.86rem;
  color: var(--ink-muted);
  word-break: break-all;
  line-height: 1.3;
}

.counterparties__del {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--ink-muted);
  cursor: pointer;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;
}

.counterparties__del svg {
  width: 1.05rem;
  height: 1.05rem;
}

.counterparties__del:hover:not(:disabled) {
  color: var(--ink);
  background: var(--nav-hover);
  border-color: var(--line);
}

.counterparties__del:disabled {
  opacity: 0.55;
  cursor: wait;
}

@media (max-width: 720px) {
  .counterparties__form {
    grid-template-columns: 1fr;
  }

  .counterparties__add {
    width: 100%;
  }
}

.mail-loader {
  --mail-glow: color-mix(in srgb, var(--green) 55%, transparent);
  position: relative;
  display: grid;
  justify-items: center;
  gap: 1.15rem;
  margin: 0 0 1.4rem;
  padding: 1.6rem 1rem 1.4rem;
  overflow: hidden;
  border: 1px solid var(--line-faint);
  border-radius: 18px;
  background:
    radial-gradient(ellipse 70% 55% at 50% 35%, var(--accent-fill) 0%, transparent 70%),
    linear-gradient(180deg, var(--accent-fill-soft), transparent 80%);
}

.mail-loader::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      105deg,
      transparent 40%,
      color-mix(in srgb, var(--green) 8%, transparent) 50%,
      transparent 60%
    );
  background-size: 220% 100%;
  animation: mail-shimmer 2.8s ease-in-out infinite;
  pointer-events: none;
}

.mail-loader__stage {
  position: relative;
  width: 9.5rem;
  height: 9.5rem;
  display: grid;
  place-items: center;
}

.mail-loader__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--green) 28%, transparent);
  opacity: 0.55;
}

.mail-loader__ring--a {
  animation: mail-ring 2.4s ease-out infinite;
}

.mail-loader__ring--b {
  inset: 12%;
  animation: mail-ring 2.4s ease-out 0.55s infinite;
}

.mail-loader__ring--c {
  inset: 24%;
  border-style: dashed;
  animation: mail-spin 12s linear infinite;
}

.mail-loader__orbit {
  position: absolute;
  inset: 8%;
  animation: mail-spin 6.5s linear infinite;
}

.mail-loader__sat {
  position: absolute;
  display: grid;
  place-items: center;
  min-width: 1.7rem;
  height: 1.7rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--green) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--green) 45%, transparent);
  color: var(--green-soft);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  box-shadow: 0 0 12px var(--mail-glow);
}

.mail-loader__sat--1 {
  top: 0;
  left: 50%;
  translate: -50% 0;
}

.mail-loader__sat--2 {
  right: 0;
  bottom: 28%;
  font-size: 0.85rem;
}

.mail-loader__sat--3 {
  left: 0;
  bottom: 22%;
  font-size: 0.85rem;
}

.mail-loader__envelope {
  position: relative;
  z-index: 2;
  width: 4.6rem;
  height: 3.35rem;
  perspective: 420px;
  filter: drop-shadow(0 8px 18px var(--mail-glow));
  animation: mail-float 2.2s ease-in-out infinite;
}

.mail-loader__flap {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1.55rem;
  background: linear-gradient(160deg, var(--green-soft), var(--green));
  clip-path: polygon(0 0, 50% 100%, 100% 0);
  transform-origin: top center;
  transform-style: preserve-3d;
  animation: mail-flap 2.2s ease-in-out infinite;
}

.mail-loader__body {
  position: absolute;
  inset: 0.7rem 0 0;
  overflow: hidden;
  border-radius: 0 0 0.55rem 0.55rem;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--green) 28%, var(--surface-solid)),
    color-mix(in srgb, var(--green) 12%, var(--surface-solid))
  );
  border: 1px solid color-mix(in srgb, var(--green) 50%, transparent);
  border-top: 0;
}

.mail-loader__scan {
  position: absolute;
  left: -10%;
  right: -10%;
  height: 38%;
  background: linear-gradient(
    180deg,
    transparent,
    color-mix(in srgb, var(--green-soft) 55%, transparent),
    transparent
  );
  animation: mail-scan 1.35s ease-in-out infinite;
  mix-blend-mode: screen;
}

.mail-loader__lines {
  position: absolute;
  inset: 0.55rem 0.65rem auto;
  display: grid;
  gap: 0.28rem;
}

.mail-loader__lines i {
  display: block;
  height: 2px;
  border-radius: 99px;
  background: color-mix(in srgb, var(--green-soft) 55%, transparent);
  animation: mail-line 1.35s ease-in-out infinite;
}

.mail-loader__lines i:nth-child(1) {
  width: 88%;
}

.mail-loader__lines i:nth-child(2) {
  width: 64%;
  animation-delay: 0.12s;
}

.mail-loader__lines i:nth-child(3) {
  width: 76%;
  animation-delay: 0.24s;
}

.mail-loader__glow {
  position: absolute;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background: radial-gradient(circle, var(--mail-glow), transparent 70%);
  filter: blur(6px);
  animation: mail-glow 2.2s ease-in-out infinite;
  pointer-events: none;
}

.mail-loader__copy {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  text-align: center;
}

.mail-loader__title {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 1.12rem;
  font-weight: 750;
  letter-spacing: 0.01em;
  background: linear-gradient(90deg, var(--ink), var(--green-soft), var(--ink));
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: mail-title 2.4s linear infinite;
}

.mail-loader__dots {
  display: inline-flex;
  gap: 0.28rem;
  height: 0.55rem;
  align-items: center;
}

.mail-loader__dots i {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: var(--green);
  animation: mail-dot 1.1s ease-in-out infinite;
}

.mail-loader__dots i:nth-child(2) {
  animation-delay: 0.15s;
}

.mail-loader__dots i:nth-child(3) {
  animation-delay: 0.3s;
}

.mail-loader__sub {
  margin: 0.15rem 0 0;
  max-width: 26rem;
  font-size: 0.88rem;
  line-height: 1.4;
  color: var(--ink-muted);
}

@keyframes mail-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes mail-ring {
  0% {
    transform: scale(0.72);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.12);
    opacity: 0;
  }
}

@keyframes mail-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes mail-flap {
  0%,
  100% {
    transform: rotateX(0deg);
  }
  45%,
  55% {
    transform: rotateX(-28deg);
  }
}

@keyframes mail-scan {
  0% {
    top: -20%;
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
  100% {
    top: 90%;
    opacity: 0.2;
  }
}

@keyframes mail-line {
  0%,
  100% {
    opacity: 0.35;
    transform: scaleX(0.92);
  }
  50% {
    opacity: 1;
    transform: scaleX(1);
  }
}

@keyframes mail-glow {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.15);
  }
}

@keyframes mail-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@keyframes mail-title {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@keyframes mail-dot {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  50% {
    transform: translateY(-3px);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mail-loader::before,
  .mail-loader__ring,
  .mail-loader__orbit,
  .mail-loader__envelope,
  .mail-loader__flap,
  .mail-loader__scan,
  .mail-loader__lines i,
  .mail-loader__glow,
  .mail-loader__title,
  .mail-loader__dots i {
    animation: none !important;
  }

  .mail-loader__title {
    color: var(--ink);
    background: none;
    -webkit-background-clip: unset;
    background-clip: unset;
  }
}

.mail-hits {
  margin-bottom: 1.2rem;
}

.mail-hits h3 {
  margin: 0 0 0.35rem;
}

.mail-hits__row {
  cursor: pointer;
  transition: background 0.15s ease;
}

.mail-hits__row:hover,
.mail-hits__row:focus-visible {
  background: var(--accent-fill-soft);
  outline: none;
}

.mail-hits__row--busy {
  opacity: 0.55;
  cursor: wait;
}

.mail-hits__sum {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.upload__icon {
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
}

.upload__name {
  margin: 0;
  font-size: 0.9rem;
}

.upload__input:disabled ~ .upload__btn {
  opacity: 0.55;
  pointer-events: none;
  cursor: not-allowed;
}

.preview,
.detail,
.list {
  margin-top: 0.5rem;
}

.layout {
  display: grid;
  grid-template-columns: minmax(180px, 240px) 1fr;
  gap: 1rem;
  margin-top: 1rem;
}

.layout--detail {
  grid-template-columns: 1fr;
}

.detail__back {
  display: inline-flex;
  align-items: center;
  margin: 0 0 0.65rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--green);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
}

.detail__back:hover {
  color: var(--green-soft);
}

.detail__total {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  max-width: 100%;
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--green) 35%, var(--line));
  background: var(--accent-fill-soft);
  flex-shrink: 0;
}

.detail__total-sum {
  font-size: 1.15rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  color: var(--green-soft);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.detail__table-total {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0.85rem;
  margin-top: 0.15rem;
  padding: 0.75rem 0.4rem 0.25rem;
  border-top: 1px solid var(--line);
  font-size: 0.95rem;
  color: var(--ink-muted);
}

.detail__table-total strong {
  font-size: 1.15rem;
  font-weight: 750;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.list-item {
  position: relative;
  margin-bottom: 0.45rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  color: var(--ink);
}

.list-item__main {
  display: grid;
  gap: 0.1rem;
  width: 100%;
  text-align: left;
  padding: 0.65rem 2.1rem 0.65rem 0.75rem;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.list-item__status {
  display: block;
  width: 100%;
  color: inherit;
  font-size: 0.9rem;
  line-height: 1.3;
  opacity: 0.85;
}

.list-item__delete {
  position: absolute;
  top: 0;
  right: 0;
  margin: 0;
  width: 1.85rem;
  height: 1.85rem;
  border: 0;
  border-radius: 0 11px 0 8px;
  background: transparent;
  color: var(--ink-muted);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.list-item__delete:hover:not(:disabled) {
  color: var(--danger-text);
  background: var(--accent-fill-soft);
}

.list-item__delete:disabled {
  opacity: 0.5;
  cursor: wait;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 0.75rem;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 0.45rem 0.4rem;
  text-align: left;
  vertical-align: top;
}

code {
  font-size: 0.82rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.85rem;
  align-items: center;
}

.actions .detail__total {
  margin-left: auto;
}

.qty {
  width: 4.5rem;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--ink);
}

.ok {
  color: var(--green);
  font-weight: 600;
}

.warn {
  color: var(--danger-text);
  font-size: 0.82rem;
}

.ms-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.error {
  color: var(--danger-text);
}

@media (max-width: 720px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
