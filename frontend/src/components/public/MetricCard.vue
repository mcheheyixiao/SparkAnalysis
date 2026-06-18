<template>
  <div class="metric-card" :class="{ clickable: !!clickable }" @click="$emit('click')">
    <div class="metric-label">{{ label }}</div>
    <div class="metric-value">{{ value }}</div>
    <div class="metric-unit" v-if="unit">{{ unit }}</div>
    <div class="metric-trend" v-if="trend" :class="trend">
      <n-icon size="12">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5H7z" /></svg>
      </n-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  clickable?: boolean
}>()

defineEmits<{
  click: []
}>()
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
