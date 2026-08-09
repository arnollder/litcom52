<script setup>
import { computed } from 'vue'

const MEETING_HOUR = 15
const MEETING_MINUTE = 0
const ADDRESS = 'г. Нижний Новгород, ул. Канавинская 2а, офис №5 (группа «Антей»)'

function firstSundayOfMonth(year, month) {
  const first = new Date(year, month, 1)
  const weekday = first.getDay()
  const day = weekday === 0 ? 1 : 1 + (7 - weekday)
  return new Date(year, month, day, MEETING_HOUR, MEETING_MINUTE, 0, 0)
}

function nextCommitteeMeeting(from = new Date()) {
  let year = from.getFullYear()
  let month = from.getMonth()
  let next = firstSundayOfMonth(year, month)
  if (from.getTime() > next.getTime()) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    next = firstSundayOfMonth(year, month)
  }
  return next
}

const nextMeeting = computed(() => nextCommitteeMeeting())

const dateTimeLabel = computed(() => {
  const date = nextMeeting.value
  const dayMonth = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
  const time = `${String(MEETING_HOUR).padStart(2, '0')}:${String(MEETING_MINUTE).padStart(2, '0')}`
  return `${dayMonth}, ${time}`
})
</script>

<template>
  <aside class="next-meeting" aria-label="Ближайшее рабочее собрание комитета">
    <p class="next-meeting__line">
      Ближайшее рабочее собрание комитета:
      <time :datetime="nextMeeting.toISOString()">{{ dateTimeLabel }}</time>
    </p>
    <p class="next-meeting__address muted">{{ ADDRESS }}</p>
  </aside>
</template>

<style scoped>
.next-meeting {
  max-width: 28rem;
}

.next-meeting__line,
.next-meeting__address {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
}

.next-meeting__line {
  color: var(--ink);
}

.next-meeting__line time {
  color: var(--green-soft);
  font-weight: 600;
  white-space: nowrap;
}

.next-meeting__address {
  margin-top: 0.2rem;
}
</style>
