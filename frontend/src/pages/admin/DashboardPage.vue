<template>
  <div class="dashboard-page">
    <page-header title="仪表盘" subtitle="系统概览" />

    <!-- Queue Status -->
    <div class="stats-row">
      <n-card :bordered="true" size="small" class="stat-card">
        <n-statistic label="排队中" :value="queue.pending" />
      </n-card>
      <n-card :bordered="true" size="small" class="stat-card">
        <n-statistic label="处理中" :value="queue.processing" />
      </n-card>
      <n-card :bordered="true" size="small" class="stat-card">
        <n-statistic label="最大并发" :value="queue.maxConcurrency" />
      </n-card>
      <n-card :bordered="true" size="small" class="stat-card">
        <n-statistic label="运行时长" :value="uptimeFormatted" />
      </n-card>
    </div>

    <!-- Quick links -->
    <n-card title="快捷入口" :bordered="true" class="quick-links-card">
      <n-grid :cols="3" :x-gap="12" :y-gap="12" responsive="screen">
        <n-grid-item>
          <n-button block @click="$router.push('/admin/settings/ai')">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                </svg>
              </n-icon>
            </template>
            AI 设置
          </n-button>
        </n-grid-item>
        <n-grid-item>
          <n-button block @click="$router.push('/admin/settings/system')">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </n-icon>
            </template>
            系统设置
          </n-button>
        </n-grid-item>
        <n-grid-item>
          <n-button block @click="$router.push('/admin/prompts')">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              </n-icon>
            </template>
            Prompt 模板
          </n-button>
        </n-grid-item>
        <n-grid-item>
          <n-button block @click="$router.push('/admin/reports')">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </n-icon>
            </template>
            分析记录
          </n-button>
        </n-grid-item>
        <n-grid-item>
          <n-button block @click="$router.push('/admin/logs')">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
              </n-icon>
            </template>
            系统日志
          </n-button>
        </n-grid-item>
      </n-grid>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getQueueStatus } from '@/api/admin-api'
import type { QueueStatus } from '@/api/types'
import PageHeader from '@/components/common/PageHeader.vue'

const queue = ref<QueueStatus>({
  pending: 0,
  processing: 0,
  maxConcurrency: 2,
  uptime: 0,
})

const uptimeFormatted = computed(() => {
  const s = queue.value.uptime
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
})

onMounted(async () => {
  try {
    queue.value = await getQueueStatus()
  } catch {
    // Show defaults
  }
})
</script>

<style scoped>
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: var(--section-gap);
}

.quick-links-card {
  margin-top: var(--section-gap);
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
