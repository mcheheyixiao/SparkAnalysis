<template>
  <div class="logs-page">
    <page-header title="系统日志" subtitle="查看系统运行日志" />

    <data-table-toolbar>
      <n-select
        v-model:value="filters.level"
        :options="levelOptions"
        placeholder="日志级别"
        clearable
        style="width: 120px"
        @update:value="loadLogs"
      />
      <n-input
        v-model:value="filters.module"
        placeholder="模块名称"
        clearable
        style="width: 160px"
        @keyup.enter="loadLogs"
      />
      <n-button @click="loadLogs">搜索</n-button>
    </data-table-toolbar>

    <div class="table-responsive">
      <n-data-table
        :columns="columns"
        :data="logs"
        :loading="loading"
        :bordered="true"
        :row-key="(r: LogEntry) => r.id"
        :pagination="pagination"
      />
    </div>

    <!-- Context JSON drawer -->
    <n-drawer v-model:show="drawerVisible" :width="600">
      <n-drawer-content title="Context JSON">
        <pre class="ctx-json">{{ selectedContext }}</pre>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { NButton, NTag } from 'naive-ui'
import { getLogs } from '@/api/admin-api'
import type { LogEntry } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage, formatDate } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTableToolbar from '@/components/admin/DataTableToolbar.vue'

const loading = ref(false)
const logs = ref<LogEntry[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)

const filters = ref({
  level: null as string | null,
  module: '',
})

const levelOptions = [
  { label: 'DEBUG', value: 'debug' },
  { label: 'INFO', value: 'info' },
  { label: 'WARN', value: 'warn' },
  { label: 'ERROR', value: 'error' },
]

const levelColor = (level: string) => {
  const map: Record<string, string> = {
    debug: '#9CA3AF',
    info: '#38BDF8',
    warn: '#F59E0B',
    error: '#EF4444',
  }
  return map[level.toLowerCase()] || '#9CA3AF'
}

const pagination = ref({
  page: 1,
  pageSize: 50,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
  onChange: (p: number) => { page.value = p; loadLogs() },
  onUpdatePageSize: (ps: number) => { pageSize.value = ps; loadLogs() },
})

const drawerVisible = ref(false)
const selectedContext = ref('')

function truncateMessage(msg: string, maxLen: number = 120): string {
  if (msg.length <= maxLen) return msg
  return msg.slice(0, maxLen) + '...'
}

const columns = [
  {
    title: '级别', key: 'level', width: 80,
    render: (r: LogEntry) => h(NTag, {
      size: 'small', bordered: false,
      style: { backgroundColor: levelColor(r.level), color: '#fff' },
    }, () => r.level.toUpperCase()),
  },
  { title: '模块', key: 'module', width: 120 },
  {
    title: '消息', key: 'message', ellipsis: { tooltip: true },
    render: (r: LogEntry) => {
      const truncated = truncateMessage(r.message)
      return h('span', { title: r.message.length > 120 ? r.message : undefined }, truncated)
    },
  },
  { title: '时间', key: 'createdAt', width: 160, render: (r: LogEntry) => formatDate(r.createdAt) },
  {
    title: '上下文', key: 'contextJson', width: 80,
    render: (r: LogEntry) => {
      if (!r.contextJson) return '—'
      return h(NButton, {
        size: 'tiny',
        onClick: () => {
          try {
            selectedContext.value = JSON.stringify(JSON.parse(r.contextJson!), null, 2)
          } catch {
            selectedContext.value = r.contextJson!
          }
          drawerVisible.value = true
        },
      }, () => '查看')
    },
  },
]

async function loadLogs() {
  loading.value = true
  try {
    const data = await getLogs({
      level: filters.value.level || undefined,
      module: filters.value.module || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    logs.value = data.items || []
    total.value = data.total
    pagination.value.itemCount = data.total
  } catch (e) {
    if (e instanceof ApiError) {
      // Silently fail for logs
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadLogs)
</script>

<style scoped>
.ctx-json {
  background: #F4F7FB;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  padding: 16px;
  font-size: 0.8rem;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 80vh;
  overflow-y: auto;
}
</style>
