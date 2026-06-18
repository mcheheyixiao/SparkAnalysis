<template>
  <div class="system-settings-page">
    <page-header title="系统设置" subtitle="管理全局系统配置" />

    <n-alert
      v-if="!settingsFromSeed"
      type="warning"
      title="当前未读取到后端系统设置，已展示前端默认值。请确认首次部署已执行 npm run prisma:seed。"
      style="margin-bottom: 16px"
    />

    <n-card :bordered="true">
      <n-form :model="form" label-placement="left" label-width="200px">
        <setting-card title="数据存储">
          <n-form-item label="保存原始 Spark 数据">
            <n-switch v-model:value="form.settings.saveRawSparkData" />
          </n-form-item>
          <n-form-item label="保存标准化摘要">
            <n-switch v-model:value="form.settings.saveNormalizedSummary" />
          </n-form-item>
          <n-form-item label="保存 AI 完整结果">
            <n-switch v-model:value="form.settings.saveAiResult" />
          </n-form-item>
          <n-form-item label="自动清理天数">
            <n-input-number v-model:value="form.settings.autoCleanupDays" :min="0" :max="365" style="width: 140px" />
            <span class="form-unit">天（0 = 不清理）</span>
          </n-form-item>
        </setting-card>

        <setting-card title="历史数据清理">
          <n-form-item label="清理操作">
            <div class="cleanup-section">
              <p class="cleanup-desc">清理已超过保留期限的分析报告和关联结果。该操作不会删除系统设置、Prompt 模板、AI 配置或管理员账号。</p>
              <p class="cleanup-hint">系统会先进行预检查，显示预计清理数量，确认后才会真正删除。</p>
              <n-button
                type="warning"
                :loading="cleaning"
                @click="handleCleanup"
              >
                清理过期分析数据
              </n-button>
            </div>
          </n-form-item>
        </setting-card>

        <setting-card title="Spark 抓取">
          <n-form-item label="抓取超时">
            <n-input-number v-model:value="form.settings.sparkFetchTimeoutMs" :min="1000" :max="60000" :step="1000" style="width: 160px" />
            <span class="form-unit">ms</span>
          </n-form-item>
          <n-form-item label="Raw 数据最大字节">
            <n-input-number v-model:value="form.settings.sparkRawMaxBytes" :min="1024" :max="10485760" :step="1024" style="width: 180px" />
          </n-form-item>
          <n-form-item label="Full 数据最大字节">
            <n-input-number v-model:value="form.settings.sparkFullMaxBytes" :min="1048576" :max="52428800" :step="1048576" style="width: 180px" />
          </n-form-item>
        </setting-card>

        <setting-card title="AI 分析">
          <n-form-item label="AI 超时">
            <n-input-number v-model:value="form.settings.aiTimeoutMs" :min="5000" :max="180000" :step="1000" style="width: 160px" />
            <span class="form-unit">ms</span>
          </n-form-item>
        </setting-card>

        <setting-card title="限流控制">
          <n-form-item label="公开每分钟限流">
            <n-input-number v-model:value="form.settings.publicRateLimitPerMinute" :min="1" :max="100" style="width: 120px" />
          </n-form-item>
          <n-form-item label="公开每日限流">
            <n-input-number v-model:value="form.settings.publicRateLimitPerDay" :min="1" :max="1000" style="width: 120px" />
          </n-form-item>
        </setting-card>

        <setting-card title="队列与复用">
          <n-form-item label="最大并发数">
            <n-input-number v-model:value="form.settings.maxConcurrency" :min="1" :max="5" style="width: 100px" />
          </n-form-item>
          <n-form-item label="复用已完成报告">
            <n-switch v-model:value="form.settings.reuseCompletedReport" />
          </n-form-item>
          <n-form-item label="复用 TTL">
            <n-input-number v-model:value="form.settings.reuseReportTtlSeconds" :min="0" :max="86400" :step="60" style="width: 140px" />
            <span class="form-unit">秒（0 = 不复用）</span>
          </n-form-item>
        </setting-card>

        <n-divider />
        <n-button type="primary" :loading="saving" @click="handleSave">
          保存设置
        </n-button>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { getSystemSettings, updateSystemSettings, cleanupReports } from '@/api/admin-api'
import type { SystemSettings } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'
import SettingCard from '@/components/admin/SettingCard.vue'

const message = useMessage()
const dialog = useDialog()

const form = ref<SystemSettings>({
  settings: {
    saveRawSparkData: false,
    saveNormalizedSummary: true,
    saveAiResult: true,
    autoCleanupDays: 30,
    sparkFetchTimeoutMs: 10000,
    sparkRawMaxBytes: 5242880,
    sparkFullMaxBytes: 31457280,
    aiTimeoutMs: 60000,
    publicRateLimitPerMinute: 5,
    publicRateLimitPerDay: 30,
    maxConcurrency: 2,
    reuseCompletedReport: true,
    reuseReportTtlSeconds: 3600,
  },
})

const saving = ref(false)
const cleaning = ref(false)

const settingsFromSeed = ref(false)

async function loadSettings() {
  try {
    const data = await getSystemSettings()
    if (data.settings) {
      const hasKeys = Object.keys(data.settings).length > 0
      settingsFromSeed.value = hasKeys
      form.value.settings = { ...form.value.settings, ...data.settings }
    }
  } catch (e) {
    if (e instanceof ApiError) {
      message.error(getErrorMessage(e.code))
    }
  }
}

async function handleSave() {
  saving.value = true
  try {
    await updateSystemSettings({ settings: { ...form.value.settings } })
    message.success('系统设置已保存')
    await loadSettings()
  } catch (e) {
    if (e instanceof ApiError) {
      message.error(getErrorMessage(e.code))
    }
  } finally {
    saving.value = false
  }
}

async function handleCleanup() {
  cleaning.value = true
  const days = form.value.settings.autoCleanupDays

  // Step 1: dryRun — pre-check
  let dryResult
  try {
    dryResult = await cleanupReports({ olderThanDays: days, dryRun: true })
  } catch (e) {
    if (e instanceof ApiError) {
      message.error(getErrorMessage(e.code))
    } else {
      message.error('网络异常，请稍后重试。')
    }
    cleaning.value = false
    return
  }

  const matchedReports = dryResult.matched || 0
  const matchedAnalysis = dryResult.matchedAnalysisResults || 0
  const matchedLogs = dryResult.matchedLogs || 0

  // Step 2: if nothing to clean, show info and stop
  if (matchedReports === 0) {
    dialog.info({
      title: '清理过期分析数据',
      content: '当前没有需要清理的过期数据。',
      positiveText: '确定',
    })
    cleaning.value = false
    return
  }

  // Step 3: confirm dialog
  const d = dialog.warning({
    title: '确认清理过期分析数据？',
    content: () => {
      const items = [
        h('li', `分析报告：${matchedReports} 条`),
        h('li', `AI 分析结果：${matchedAnalysis} 条`),
      ]
      if (matchedLogs > 0) {
        items.push(h('li', `系统日志：${matchedLogs} 条`))
      }
      return h('div', [
        h('p', '本次预计清理：'),
        h('ul', { style: { paddingLeft: '20px' } }, items),
        h('p', { style: { marginTop: '12px', color: 'var(--n-text-color-3, #999)' } },
          '该操作不会删除系统设置、Prompt 模板、AI 配置或管理员账号。'),
        h('p', { style: { color: 'var(--n-text-color-3, #999)' } },
          '建议在低峰期执行。'),
      ])
    },
    positiveText: '确认清理',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const execResult = await cleanupReports({ olderThanDays: days, dryRun: false })
        message.success(`清理完成：已删除 ${execResult.deleted || 0} 条分析报告。`)
      } catch (e) {
        if (e instanceof ApiError) {
          message.error(getErrorMessage(e.code))
        } else {
          message.error('清理失败，请稍后重试。')
        }
      }
    },
  })

  cleaning.value = false
}

onMounted(loadSettings)
</script>

<style scoped>
.form-unit {
  margin-left: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.cleanup-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cleanup-desc,
.cleanup-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.cleanup-hint {
  font-size: 0.8rem;
}
</style>
