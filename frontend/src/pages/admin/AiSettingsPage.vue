<template>
  <div class="ai-settings-page">
    <page-header title="AI 设置" subtitle="配置 AI 服务连接参数" />

    <n-card :bordered="true" class="settings-form">
      <n-form :model="form" label-placement="left" label-width="140px">
        <n-form-item label="Provider">
          <n-input v-model:value="form.provider" placeholder="deepseek" :maxlength="32" />
        </n-form-item>
        <n-form-item label="Base URL">
          <n-input v-model:value="form.baseUrl" placeholder="https://api.deepseek.com" :maxlength="512" />
        </n-form-item>
        <n-form-item label="Model">
          <n-input v-model:value="form.model" placeholder="deepseek-v4-pro" :maxlength="128" />
        </n-form-item>
        <n-form-item label="API Key">
          <n-input
            v-model:value="form.apiKey"
            type="password"
            show-password-on="click"
            placeholder="留空则不修改当前 API Key"
            :maxlength="512"
          />
          <div class="form-hint" v-if="apiKeyMasked">
            当前 Key：<n-tag :bordered="false" size="small" type="info">{{ apiKeyMasked }}</n-tag>
          </div>
        </n-form-item>
        <n-form-item label="Temperature">
          <n-input-number v-model:value="form.temperature" :min="0" :max="2" :step="0.1" :precision="2" style="width: 160px" />
        </n-form-item>
        <n-form-item label="Max Tokens">
          <n-input-number v-model:value="form.maxTokens" :min="1" :max="131072" :step="1" style="width: 160px" />
        </n-form-item>
        <n-form-item label="超时 (ms)">
          <n-input-number v-model:value="form.timeoutMs" :min="1000" :max="300000" :step="1000" style="width: 180px" />
        </n-form-item>
        <n-form-item label="启用">
          <n-switch v-model:value="form.enabled" />
        </n-form-item>

        <n-divider />

        <n-space>
          <n-button type="primary" :loading="saving" @click="handleSave">
            保存设置
          </n-button>
          <n-button :loading="testing" @click="handleTest">
            测试连接
          </n-button>
        </n-space>

        <n-alert
          v-if="testResult"
          :type="testResult.ok ? 'success' : 'error'"
          :bordered="false"
          class="test-result"
        >
          <template #header>
            {{ testResult.ok ? '连接测试成功' : '连接测试失败' }}
          </template>
          <div v-if="testResult.ok">
            模型: {{ testResult.model }}，延迟: {{ testResult.latencyMs }}ms
          </div>
          <div v-else>
            {{ testResult.error || '未知错误' }}
          </div>
        </n-alert>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { getAiSettings, updateAiSettings, testAiConnection } from '@/api/admin-api'
import type { AiSettingsUpdate, AiTestResult } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'

const message = useMessage()

const form = ref<AiSettingsUpdate & { enabled: boolean }>({
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  apiKey: '',
  temperature: 0.3,
  maxTokens: 4096,
  timeoutMs: 60000,
  enabled: true,
})

const apiKeyMasked = ref('')
const saving = ref(false)
const testing = ref(false)
const testResult = ref<AiTestResult | null>(null)

async function loadSettings() {
  try {
    const settings = await getAiSettings()
    apiKeyMasked.value = settings.apiKeyMasked || ''
    form.value.provider = settings.provider
    form.value.baseUrl = settings.baseUrl
    form.value.model = settings.model
    form.value.apiKey = ''
    form.value.temperature = settings.temperature
    form.value.maxTokens = settings.maxTokens
    form.value.timeoutMs = settings.timeoutMs
    form.value.enabled = settings.enabled
  } catch (e) {
    if (e instanceof ApiError) {
      message.error(getErrorMessage(e.code))
    }
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload: AiSettingsUpdate = { ...form.value }
    if (!payload.apiKey) delete payload.apiKey
    await updateAiSettings(payload)
    message.success('AI 设置已保存')
    await loadSettings()
  } catch (e) {
    if (e instanceof ApiError) {
      message.error(getErrorMessage(e.code))
    } else {
      message.error('AI 设置保存失败，请稍后重试')
      console.error('AiSettings handleSave error:', e)
    }
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  testing.value = true
  testResult.value = null
  try {
    const result = await testAiConnection()
    testResult.value = result
  } catch (e) {
    testResult.value = {
      ok: false,
      error: e instanceof ApiError ? e.message : '连接测试失败',
    }
  } finally {
    testing.value = false
  }
}

onMounted(loadSettings)
</script>

<style scoped>
.form-hint {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.test-result {
  margin-top: 16px;
}
</style>
