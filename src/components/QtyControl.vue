<script setup>
defineProps({
  modelValue: { type: Number, required: true },
  max: { type: Number, required: true },
})

const emit = defineEmits(['update:modelValue'])

function change(delta, current, max) {
  emit('update:modelValue', Math.max(0, Math.min(max, current + delta)))
}

function onInput(event, max) {
  const value = Number(event.target.value)
  emit('update:modelValue', Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0)))
}
</script>

<template>
  <div class="qty">
    <button
      type="button"
      aria-label="Уменьшить"
      :disabled="modelValue <= 0"
      @click="change(-1, modelValue, max)"
    >
      −
    </button>
    <input
      :value="modelValue"
      type="number"
      min="0"
      :max="max"
      inputmode="numeric"
      @input="onInput($event, max)"
    />
    <button
      type="button"
      aria-label="Увеличить"
      :disabled="modelValue >= max"
      @click="change(1, modelValue, max)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.qty {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--inset);
}

.qty button {
  width: 2.2rem;
  height: 2.2rem;
  border: 0;
  background: transparent;
  color: var(--green-soft);
  cursor: pointer;
  font-size: 1.1rem;
}

.qty button:hover:not(:disabled) {
  background: var(--nav-hover);
}

.qty button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.qty input {
  width: 3rem;
  height: 2.2rem;
  border: 0;
  border-inline: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: center;
  appearance: textfield;
}

.qty input::-webkit-outer-spin-button,
.qty input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
