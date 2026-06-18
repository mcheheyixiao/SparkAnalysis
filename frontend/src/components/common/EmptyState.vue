<template>
  <div class="empty-state">
    <n-icon :size="48" color="#E6EDF5">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    </n-icon>
    <p class="empty-title">{{ title || '暂无数据' }}</p>
    <p class="empty-desc" v-if="description">{{ description }}</p>
    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-title {
  margin-top: 16px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-desc {
  margin-top: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
</style>
