<template>
  <div class="reports-page">
    <page-header title="分析记录" subtitle="查看和管理所有分析报告" />

    <!-- Filters -->
    <data-table-toolbar>
      <n-select v-model:value="filters.status" :options="statusOptions" placeholder="状态" clearable style="width: 120px" @update:value="loadReports" />
      <n-select v-model:value="filters.severity" :options="severityOptions" placeholder="严重程度" clearable style="width: 120px" @update:value="loadReports" />
      <n-select v-model:value="filters.reportType" :options="reportTypeOptions" placeholder="报告类型" clearable style="width: 120px" @update:value="loadReports" />
      <n-input v-model:value="filters.sparkCode" placeholder="搜索 sparkCode" clearable style="width: 180px" @keyup.enter="loadReports" />
      <n-button @click="loadReports">搜索</n-button>
      <n-button @click="showCleanup = true">清理</n-button>
    </data-table-toolbar>

    <!-- Table -->
    <div class="table-responsive">
      <n-data-table
        :columns="columns"
        :data="reports"
        :loading="loading"
        :bordered="true"
        :row-key="(r: AdminReport) => r.id"
        :pagination="pagination"
        @update:page="handlePageChange"
      />
    </div>

    <!-- Cleanup Modal -->
    <n-modal v-model:show="showCleanup" preset="card" title="清理过期报告" style="max-width: 480px">
      <n-form label-placement="top">
        <n-form-item label="清理多少天前的报告">
          <n-input-number v-model:value="cleanupForm.olderThanDays" :min="1" :max="365" style="width: 140px" />
        </n-form-item>
        <n-form-item label="Dry Run（仅预览数量）">
          <n-switch v-model:value="cleanupForm.dryRun" />
        </n-form-item>
      </n-form>
      <n-alert v-if="cleanupResult" :type="cleanupForm.dryRun ? 'info' : 'success'" :bordered="false">
        {{ cleanupForm.dryRun ? '预计匹配' : '已删除' }} {{ cleanupResult.deleted }} 条记录
        （共匹配 {{ cleanupResult.matched }} 条）
      </n-alert>
      <template #footer>
        <n-space>
          <n-button @click="showCleanup = false">关闭</n-button>
          <n-button type="primary" :loading="cleaning" @click="handleCleanup">
            执行{{ cleanupForm.dryRun ? '预览' : '清理' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, useDialog, NButton, NSpace, NTag } from 'naive-ui'
import { getAdminReports, deleteAdminReport, cleanupReports } from '@/api/admin-api'
import type { AdminReport, CleanupResponse } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage, statusLabel, severityLabel, formatDate } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTableToolbar from '@/components/admin/DataTableToolbar.vue'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const reports = ref<AdminReport[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filters = ref({
  status: null as string | null,
  severity: null as string | null,
  reportType: null as string | null,
  sparkCode: '',
})

const statusOptions = [
  { label: '等待中', value: 'pending' },
  { label: '分析中', value: 'processing' },
  { label: '已完成', value: 'completed' },
  { label: '失败', value: 'failed' },
]

const severityOptions = [
  { label: '正常', value: 'normal' },
  { label: '轻微', value: 'low' },
  { label: '中等', value: 'medium' },
  { label: '较高', value: 'high' },
  { label: '严重', value: 'critical' },
]

const reportTypeOptions = [
  { label: '采样器', value: 'sampler' },
  { label: '堆内存', value: 'heap' },
  { label: '健康', value: 'health' },
  { label: '未知', value: 'unknown' },
]

const pagination = ref({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (p: number) => { page.value = p; loadReports() },
  onUpdatePageSize: (ps: number) => { pageSize.value = ps; loadReports() },
})

const columns = [
  { title: 'sparkCode', key: 'sparkCode', width: 140, ellipsis: { tooltip: true } },
  { title: '状态', key: 'status', width: 80, render: (r: AdminReport) => h(NTag, { size: 'small', bordered: false }, () => statusLabel(r.status)) },
  { title: '严重程度', key: 'severity', width: 90, render: (r: AdminReport) => r.severity ? h(NTag, { size: 'small', bordered: false }, () => severityLabel(r.severity)) : '—' },
  { title: '类型', key: 'reportType', width: 80 },
  { title: '摘要', key: 'summary', ellipsis: { tooltip: true }, minWidth: 160 },
  { title: '创建时间', key: 'createdAt', width: 150, render: (r: AdminReport) => formatDate(r.createdAt) },
  {
    title: '操作', key: 'actions', width: 160,
    render: (r: AdminReport) => h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', onClick: () => router.push(`/admin/reports/${r.id}`) }, () => '详情'),
      h(NButton, { size: 'small', type: 'error', onClick: () => handleDelete(r) }, () => '删除'),
    ]),
  },
]

async function loadReports() {
  loading.value = true
  try {
    const data = await getAdminReports({
      status: filters.value.status || undefined,
      severity: filters.value.severity || undefined,
      reportType: filters.value.reportType || undefined,
      sparkCode: filters.value.sparkCode || undefined,
      page: page.value,
      pageSize: pageSize.value,
    })
    reports.value = data.items || []
    total.value = data.total
    pagination.value.itemCount = data.total
  } catch (e) {
    if (e instanceof ApiError) message.error(getErrorMessage(e.code))
  } finally {
    loading.value = false
  }
}

function handlePageChange(p: number) {
  page.value = p
  loadReports()
}

async function handleDelete(report: AdminReport) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除报告「${report.sparkCode}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteAdminReport(report.id)
        message.success('报告已删除')
        await loadReports()
      } catch (e) {
        if (e instanceof ApiError) message.error(getErrorMessage(e.code))
      }
    },
  })
}

// Cleanup
const showCleanup = ref(false)
const cleaning = ref(false)
const cleanupForm = ref({ olderThanDays: 30, dryRun: true })
const cleanupResult = ref<CleanupResponse | null>(null)

async function handleCleanup() {
  cleaning.value = true
  try {
    cleanupResult.value = await cleanupReports({ ...cleanupForm.value })
  } catch (e) {
    if (e instanceof ApiError) message.error(getErrorMessage(e.code))
  } finally {
    cleaning.value = false
  }
}

onMounted(loadReports)
</script>
