<script setup>
import { watch } from 'vue'
import { useCounterpartySearch } from '../composables/useCounterpartySearch.js'
import PushNotifyButton from './PushNotifyButton.vue'

const props = defineProps({
  label: { type: String, default: 'Контрагент' },
  placeholder: {
    type: String,
    default: '(начните вводить название группы)',
  },
  showPush: { type: Boolean, default: false },
  inputName: { type: String, default: 'counterparty' },
})

const model = defineModel({ type: Object, default: null })

const {
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
} = useCounterpartySearch({
  onSelect(value) {
    model.value = value
  },
})

watch(
  model,
  (value) => {
    if (value?.id && value.id !== selectedId.value) {
      selectById(value.id)
    }
  },
  { immediate: true },
)

function onSelect(id) {
  selectById(id)
}
</script>

<template>
  <div class="counterparty-group">
    <label class="counterparty-search">
      <span class="muted">{{ label }}</span>
      <input
        v-model="query"
        type="text"
        :placeholder="placeholder"
        autocomplete="off"
        @input="onQueryInput"
      />
    </label>
    <p v-if="isLoading" class="hint muted">Загружаем контрагентов…</p>
    <p v-else-if="error" class="hint error">{{ error }}</p>
    <p v-else-if="warning" class="hint muted">{{ warning }}</p>
    <div v-else-if="resultsOpen" class="counterparty-list">
      <p v-if="!matchedCounterparties.length" class="hint muted">
        Ничего не найдено. Попробуйте имя, телефон или email без точного совпадения.
      </p>
      <label
        v-for="counterparty in visibleCounterparties"
        :key="counterparty.id"
        class="counterparty-option"
      >
        <input
          type="radio"
          :name="inputName"
          :value="counterparty.id"
          :checked="counterparty.id === selectedId"
          @change="onSelect(counterparty.id)"
        />
        <span>
          <strong>{{ counterparty.name }}</strong>
          <small class="muted">{{ counterparty.description || 'Контакт не указан' }}</small>
        </span>
      </label>
      <p v-if="hasMoreCounterparties" class="hint muted">
        Показаны первые {{ visibleCounterparties.length }} из {{ matchedCounterparties.length }}.
        Уточните запрос, чтобы быстрее найти нужного.
      </p>
    </div>
    <p v-if="selected?.contact" class="hint muted">Контакт: {{ selected.contact }}</p>
    <p v-else-if="selected" class="hint muted">
      У выбранного контрагента не заполнен контакт (телефон/email).
    </p>
    <PushNotifyButton v-if="showPush && selected" variant="inline" />
  </div>
</template>

<style scoped>
.counterparty-group {
  display: grid;
  gap: 0.65rem;
}

.counterparty-search {
  display: grid;
  gap: 0.35rem;
}

.counterparty-search input {
  width: 100%;
  padding: 0.8rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--inset);
  color: var(--ink);
}

.hint {
  margin: 0;
  font-size: 0.88rem;
}

.error {
  color: var(--danger-text);
}

.counterparty-list {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--inset-soft);
  max-height: 260px;
  overflow: auto;
  padding: 0.5rem;
  display: grid;
  gap: 0.45rem;
}

.counterparty-option {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  border: 1px solid var(--accent-border-faint);
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  cursor: pointer;
}

.counterparty-option input {
  width: auto;
  margin-top: 0.18rem;
}

.counterparty-option strong {
  display: block;
}

.counterparty-option small {
  display: block;
}
</style>
