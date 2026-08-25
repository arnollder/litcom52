<script setup>
import { usePwaInstall } from '../composables/usePwaInstall'

defineProps({
  variant: {
    type: String,
    default: 'ghost',
    validator: (value) => ['ghost', 'header', 'primary'].includes(value),
  },
  label: {
    type: String,
    default: 'Установить приложение',
  },
})

const { visible, isIos, tipOpen, install, closeTip } = usePwaInstall()
</script>

<template>
  <div v-if="visible" class="install" :class="`install--${variant}`">
    <button
      class="install__btn"
      :class="{
        btn: variant !== 'header',
        'btn-ghost': variant === 'ghost',
        'btn-primary': variant === 'primary',
        'install__btn--header': variant === 'header',
      }"
      type="button"
      @click="install"
    >
      <svg class="install__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 12.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"
        />
      </svg>
      <span>{{ label }}</span>
    </button>

    <div
      v-if="tipOpen"
      class="install__tip"
      role="dialog"
      aria-label="Как установить приложение"
    >
      <p v-if="isIos">
        Нажмите
        <strong>Поделиться</strong>
        в Safari, затем
        <strong>«На экран „Домой“»</strong>.
      </p>
      <p v-else>
        Откройте меню браузера и выберите
        <strong>«Установить приложение»</strong>
        или
        <strong>«Добавить на главный экран»</strong>.
      </p>
      <button class="install__tip-close" type="button" @click="closeTip">Понятно</button>
    </div>
  </div>
</template>

<style scoped>
.install {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.55rem;
}

.install__btn {
  gap: 0.5rem;
}

.install__btn--header {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 2.6rem;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: transparent;
  color: var(--green);
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.install__btn--header:hover {
  background: var(--nav-hover);
  border-color: var(--btn-ghost-hover);
}

.install__icon {
  width: 1.05rem;
  height: 1.05rem;
  flex-shrink: 0;
}

.install__tip {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  z-index: 60;
  width: min(18rem, 78vw);
  padding: 0.95rem 1rem;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-strong);
  box-shadow: var(--shadow);
  animation: rise 0.22s ease both;
}

/* On the hero CTA the tip opens upward so the next section cannot clip it. */
.install--ghost .install__tip,
.install--primary .install__tip {
  top: auto;
  bottom: calc(100% + 0.55rem);
  left: 0;
  right: auto;
  animation-name: tip-drop;
}

@keyframes tip-drop {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.install__tip p {
  margin: 0 0 0.75rem;
  color: var(--ink-muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.install__tip strong {
  color: var(--ink);
  font-weight: 700;
}

.install__tip-close {
  border: 0;
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  background: var(--nav-hover);
  color: var(--green);
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 820px) {
  .install__btn--header span {
    display: none;
  }

  .install__btn--header {
    width: 2.6rem;
    padding: 0;
  }
}
</style>
