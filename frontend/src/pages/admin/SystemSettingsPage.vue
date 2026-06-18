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
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { getSystemSettings, updateSystemSettings } from '@/api/admin-api'
import type { SystemSettings } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'
import SettingCard from '@/components/admin/SettingCard.vue'

const message = useMessage()

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

onMounted(loadSettings)
</script>

<style scoped>
.form-unit {
  margin-left: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}
</style>
