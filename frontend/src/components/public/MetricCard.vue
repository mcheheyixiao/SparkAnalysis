<template>
  <div class="metric-card" :class="{ clickable: !!clickable }" @click="$emit('click')">
    <div class="metric-label">{{ label }}</div>
    <div class="metric-value">{{ displayValue }}</div>
    <div class="metric-unit" v-if="unit">{{ unit }}</div>
    <div class="metric-trend" v-if="trend" :class="trend">
      <n-icon size="12">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5H7z" /></svg>
      </n-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { gsap } from '@/plugins/gsap'

// ---- Pure utility functions ----

interface ParsedNumber {
  numeric: number
  unit: string
  rawNumber: string
  isAnimatable: boolean
  raw: string
}

function parseNumericValue(raw: string | number): ParsedNumber {
  const str = String(raw).trim()

  // Strict: only accept "42", "19.8", "-3.5", "42 ms", "19.8 TPS"
  // Reject: "12.3.4", ".5", "abc123"
  const match = str.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/)
  if (!match) {
    return { numeric: 0, unit: '', rawNumber: '', isAnimatable: false, raw: str }
  }

  const rawNumber = match[1]
  const numeric = parseFloat(rawNumber)
  const unit = match[2]

  if (isNaN(numeric)) {
    return { numeric: 0, unit: '', rawNumber: '', isAnimatable: false, raw: str }
  }

  return { numeric, unit, rawNumber, isAnimatable: true, raw: str }
}

function getDecimalPlaces(rawNumber: string): number {
  if (!rawNumber.includes('.')) return 0
  return Math.min(rawNumber.split('.')[1].length, 2)
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---- Props & Emits ----

const props = defineProps<{
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  clickable?: boolean
  animateValue?: boolean
}>()

defineEmits<{
  click: []
}>()

// ---- Number counting animation ----

const prefersReduced = getPrefersReducedMotion()
const displayValue = ref<string | number>(props.value)
let tween: gsap.core.Tween | null = null

function animate() {
  tween?.kill()

  const parsed = parseNumericValue(props.value)

  if (!parsed.isAnimatable || !props.animateValue || prefersReduced) {
    displayValue.value = props.value
    return
  }

  const decimalPlaces = getDecimalPlaces(parsed.rawNumber)

  tween = gsap.to(
    { val: 0 },
    {
      val: parsed.numeric,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate() {
        const v = (this.targets() as Array<{ val: number }>)[0].val
        const rounded = decimalPlaces > 0
          ? v.toFixed(decimalPlaces)
          : String(Math.round(v))
        displayValue.value = parsed.unit
          ? `${rounded} ${parsed.unit}`
          : rounded
      },
    }
  )
}

watch(() => props.value, animate, { immediate: true })

onBeforeUnmount(() => {
  tween?.kill()
})
</script>

<style scoped>
.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-md);
  padding: 16px;
  text-align: center;
  transition: box-shadow 0.2s;
}

.metric-card.clickable {
  cursor: pointer;
}

.metric-card.clickable:hover {
  box-shadow: var(--shadow-hover);
}

.metric-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-unit {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.metric-trend {
  margin-top: 4px;
}

.metric-trend.up svg {
  color: var(--color-danger);
  transform: rotate(180deg);
}

.metric-trend.down svg {
  color: var(--color-success);
}
</style>
