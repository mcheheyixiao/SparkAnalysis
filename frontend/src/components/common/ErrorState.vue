<template>
  <div class="error-state">
    <n-icon :size="48" color="#F59E0B">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4m0 4h.01" stroke-linecap="round" />
      </svg>
    </n-icon>
    <p class="error-title">{{ title || '加载失败' }}</p>
    <p class="error-desc" v-if="description">{{ description }}</p>
    <div class="error-actions">
      <n-button v-if="retryable" @click="$emit('retry')" type="primary" size="small">
        重试
      </n-button>
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  retryable?: boolean
}>()

defineEmits<{
  retry: []
}>()
</script>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.error-title {
  margin-top: 16px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.error-desc {
  margin-top: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.error-actions {
  margin-top: 16px;
}
</style>
