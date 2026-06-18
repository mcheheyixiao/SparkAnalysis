<template>
  <div class="evidence-list">
    <div v-for="(item, index) in evidence" :key="index" class="evidence-item">
      <div class="evidence-header">
        <n-tag :type="confidenceType(item.confidence)" :bordered="false" size="tiny">
          {{ confidenceLabel(item.confidence) }}
        </n-tag>
        <span class="evidence-title">{{ item.title }}</span>
      </div>
      <p class="evidence-desc">{{ item.explanation }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { KeyEvidence } from '@/api/types'

defineProps<{
  evidence: KeyEvidence[]
}>()

function confidenceType(c: string): 'success' | 'warning' | 'error' {
  if (c === 'high') return 'success'
  if (c === 'medium') return 'warning'
  return 'error'
}

function confidenceLabel(c: string): string {
  if (c === 'high') return '高置信'
  if (c === 'medium') return '中置信'
  return '低置信'
}
</script>

<style scoped>
.evidence-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.evidence-item {
  padding: 16px;
  background: #F8FAFD;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
}

.evidence-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.evidence-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
}

.evidence-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
