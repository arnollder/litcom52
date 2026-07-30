<script setup>
import { useThemeStore } from '../stores/theme'

const theme = useThemeStore()
</script>

<template>
  <button
    class="theme-btn"
    type="button"
    :aria-label="theme.label"
    :title="theme.label"
    @click="theme.toggle()"
  >
    <svg
      v-if="theme.isLight"
      class="theme-btn__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.1 22a1 1 0 0 1-.95-.68A9.5 9.5 0 0 1 12.5 2.1a1 1 0 0 1 1.22 1.3A7.5 7.5 0 0 0 14.4 19.9a1 1 0 0 1-.9 1.3 9 9 0 0 1-1.4.8Z"
      />
    </svg>
    <svg v-else class="theme-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-14a1 1 0 0 0 1-1V2a1 1 0 1 0-2 0v1a1 1 0 0 0 1 1Zm0 16a1 1 0 0 0-1 1v1a1 1 0 1 0 2 0v-1a1 1 0 0 0-1-1Zm10-7h-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2ZM3 12H2a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2Zm14.95 5.54-.7-.7a1 1 0 0 0-1.42 1.42l.7.7a1 1 0 0 0 1.42-1.42ZM7.46 5.05l-.7-.7A1 1 0 0 0 5.34 5.77l.7.7a1 1 0 0 0 1.42-1.42Zm10.09-1.28-.7.7a1 1 0 1 0 1.42 1.42l.7-.7a1 1 0 0 0-1.42-1.42ZM5.76 16.84l-.7.7a1 1 0 1 0 1.42 1.42l.7-.7a1 1 0 0 0-1.42-1.42Z"
      />
    </svg>
  </button>
</template>

<style scoped>
.theme-btn {
  width: 2.6rem;
  height: 2.6rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.theme-btn:hover {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.theme-btn__icon {
  width: 1.15rem;
  height: 1.15rem;
}
</style>
