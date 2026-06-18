<template>
  <div ref="heroRef" class="hero-card glass-card">
    <div class="hero-inner">
      <div class="hero-left">
        <app-logo class="reveal-item" :size="'default'" />
        <h1 class="hero-title reveal-item">让 spark 性能报告变成小白也看得懂的中文诊断</h1>
        <p class="hero-subtitle reveal-item">
          粘贴 spark.lucko.me 链接，自动分析 TPS、MSPT、线程热点、内存与插件风险
        </p>

        <div class="hero-form reveal-item">
          <n-input
            v-model:value="url"
            placeholder="粘贴 https://spark.lucko.me/xxxx"
            :disabled="loading"
            size="large"
            clearable
            @keyup.enter="handleSubmit"
          >
            <template #prefix>
              <n-icon color="#2DBE8D">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </n-icon>
            </template>
          </n-input>
          <n-button
            type="primary"
            size="large"
            :loading="loading"
            :disabled="!url.trim()"
            @click="handleSubmit"
          >
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </n-icon>
            </template>
            开始 AI 分析
          </n-button>
        </div>

        <div class="hero-hints reveal-item">
          <n-space align="center" :size="4">
            <n-icon size="18" color="#667085">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4m0-4h.01" />
              </svg>
            </n-icon>
            <span class="hint-text">示例链接：https://spark.lucko.me/abc123XYZ</span>
          </n-space>
          <p v-if="errorMsg" class="hero-error">{{ errorMsg }}</p>
        </div>
      </div>

      <div class="hero-right">
        <div class="preview-card glass-card reveal-item">
          <div class="preview-header">
            <div class="preview-badge">AI 分析预览</div>
          </div>
          <div class="preview-body">
            <div class="preview-row">
              <metric-card label="TPS 健康度" value="18.2" unit="TPS" trend="stable" />
              <metric-card label="MSPT 平均" value="42" unit="ms" trend="down" />
              <metric-card label="内存使用" value="62" unit="%" trend="up" />
            </div>
            <div class="preview-status">
              <n-icon color="#2DBE8D" size="16">
                <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2" /></svg>
              </n-icon>
              <span>AI 正在生成建议...</span>
            </div>
            <div class="preview-features">
              <div class="feature-item">
                <n-icon color="#2DBE8D" size="18">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                </n-icon>
                <span>自动读取 spark 报告</span>
              </div>
              <div class="feature-item">
                <n-icon color="#2F80ED" size="18">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                </n-icon>
                <span>AI 生成中文解释</span>
              </div>
              <div class="feature-item">
                <n-icon color="#10B981" size="18">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                </n-icon>
                <span>给出可执行优化建议</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { submitAnalysis } from '@/api/public-api'
import { useReportStore } from '@/stores/report.store'
import { ApiError } from '@/api/http'
import { getErrorMessage } from '@/utils/format'
import AppLogo from '@/components/common/AppLogo.vue'
import MetricCard from './MetricCard.vue'
import { useRevealAnimation } from '@/composables/useRevealAnimation'

const router = useRouter()

const heroRef = ref<HTMLElement | null>(null)

useRevealAnimation(heroRef, {
  selector: '.reveal-item',
  stagger: 0.08,
  autoPlay: true,
})
const message = useMessage()
const reportStore = useReportStore()

const url = ref('')
const loading = ref(false)
const errorMsg = ref('')

function isValidSparkUrl(input: string): boolean {
  return input.startsWith('https://spark.lucko.me/')
}

async function handleSubmit() {
  const trimmed = url.value.trim()
  if (!trimmed) return

  errorMsg.value = ''

  if (!isValidSparkUrl(trimmed)) {
    message.warning('请输入以 https://spark.lucko.me/ 开头的链接')
    return
  }

  loading.value = true
  try {
    const result = await submitAnalysis({ url: trimmed })
    reportStore.setLastSubmission(trimmed, result.reportId)

    if (result.status === 'completed') {
      router.push({ name: 'report', params: { reportId: result.reportId } })
    } else {
      router.push({ name: 'analyze', params: { reportId: result.reportId } })
    }
  } catch (e) {
    if (e instanceof ApiError) {
      errorMsg.value = getErrorMessage(e.code)
    } else {
      errorMsg.value = '网络连接失败，请检查网络后重试'
    }
  } finally {
    loading.value = false
  }
}

defineExpose({ url, loading, errorMsg, handleSubmit })
</script>

<style scoped>
.hero-card {
  max-width: var(--content-max-width);
  margin: 40px auto;
  padding: 0;
  overflow: hidden;
}

.hero-inner {
  display: flex;
  gap: 48px;
  padding: 48px;
}

.hero-left {
  flex: 1;
  min-width: 0;
}

.hero-title {
  font-size: 2rem;
  font-weight: 800;
  color: var(--text-primary);
  margin-top: 24px;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.hero-subtitle {
  font-size: 1rem;
  color: var(--text-secondary);
  margin-top: 12px;
  line-height: 1.6;
}

.hero-form {
  display: flex;
  gap: 12px;
  margin-top: 28px;
}

.hero-form .n-input {
  flex: 1;
}

.hero-hints {
  margin-top: 16px;
}

.hint-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.hero-error {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--color-danger);
}

/* Preview card */
.hero-right {
  width: 360px;
  flex-shrink: 0;
}

.preview-card {
  padding: 24px;
}

.preview-header {
  margin-bottom: 16px;
}

.preview-badge {
  display: inline-block;
  padding: 4px 12px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
}

.preview-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.preview-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--color-primary-light);
  border-radius: var(--border-radius-sm);
  font-size: 0.85rem;
  color: var(--color-primary);
  margin-bottom: 16px;
}

.preview-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

@media (max-width: 900px) {
  .hero-inner {
    flex-direction: column;
    padding: 24px;
    gap: 24px;
  }

  .hero-right {
    width: 100%;
  }

  .hero-title {
    font-size: 1.5rem;
  }

  .hero-form {
    flex-direction: column;
  }
}
</style>
