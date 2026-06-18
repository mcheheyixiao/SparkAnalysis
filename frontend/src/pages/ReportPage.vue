<template>
  <public-layout>
    <div class="report-page container">
      <!-- Error state -->
      <template v-if="report.status === 'failed'">
        <n-card class="report-error-card" :bordered="true">
          <error-state
            :title="report.errorMessage || '分析失败'"
            description="请重新提交 spark 链接进行重试"
          >
            <template #action>
              <n-button type="primary" @click="$router.push('/')">
                重新提交链接
              </n-button>
            </template>
          </error-state>
        </n-card>
      </template>

      <!-- Processing (should redirect but handle edge case) -->
      <template v-else-if="report.status !== 'completed'">
        <n-card :bordered="true">
          <n-result
            status="info"
            title="分析进行中"
            description="正在等待 AI 分析完成..."
          >
            <template #footer>
              <n-button @click="$router.replace({ name: 'analyze', params: { reportId } })">
                查看进度
              </n-button>
            </template>
          </n-result>
        </n-card>
      </template>

      <!-- Completed -->
      <template v-else>
        <!-- Top bar -->
        <div class="report-topbar">
          <n-button text @click="$router.push('/')">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 12H5m7-7l-7 7 7 7" />
                </svg>
              </n-icon>
            </template>
            返回首页
          </n-button>
          <n-space align="center">
            <n-tag type="info" :bordered="false" size="small">
              {{ report.sparkCode }}
            </n-tag>
            <severity-badge v-if="report.severity" :severity="report.severity" />
            <n-tag :bordered="false" size="small">{{ reportTypeLabel }}</n-tag>
          </n-space>
        </div>

        <!-- Summary card -->
        <n-card class="report-summary-card" :bordered="true">
          <div class="summary-header">
            <h2 class="summary-title">分析摘要</h2>
            <n-text depth="3" v-if="report.completedAt">
              完成于 {{ formatDate(report.completedAt) }}
            </n-text>
          </div>
          <p class="summary-text" v-if="report.summary">{{ report.summary }}</p>
          <p class="summary-text" v-if="aiResult?.one_sentence_summary">
            {{ aiResult.one_sentence_summary }}
          </p>

          <!-- Metrics -->
          <div class="summary-metrics" v-if="report.normalizedSummary">
            <metric-card
              v-for="(val, key) in flatMetrics"
              :key="key"
              :label="String(key)"
              :value="String(val)"
            />
          </div>
        </n-card>

        <!-- AI Result -->
        <template v-if="aiResult">
          <n-card class="report-section-card" :bordered="true" title="核心证据">
            <evidence-list :evidence="aiResult.key_evidence || []" />
          </n-card>

          <n-card
            class="report-section-card"
            :bordered="true"
            title="疑似原因"
            v-if="aiResult.suspected_causes?.length"
          >
            <div v-for="cause in aiResult.suspected_causes" :key="cause.rank" class="cause-item">
              <div class="cause-header">
                <n-tag type="info" :bordered="false" size="tiny">#{{ cause.rank }}</n-tag>
                <span class="cause-name">{{ cause.name }}</span>
                <n-tag
                  :type="cause.confidence === 'high' ? 'success' : cause.confidence === 'medium' ? 'warning' : 'default'"
                  :bordered="false"
                  size="tiny"
                >
                  {{ cause.confidence === 'high' ? '高置信' : cause.confidence === 'medium' ? '中置信' : '低置信' }}
                </n-tag>
              </div>
              <p class="cause-reason">{{ cause.reason }}</p>
              <p class="cause-verify" v-if="cause.how_to_verify">
                <strong>如何验证：</strong>{{ cause.how_to_verify }}
              </p>
            </div>
          </n-card>

          <n-card
            class="report-section-card"
            :bordered="true"
            title="修复建议"
            v-if="aiResult.fix_plan?.length"
          >
            <div v-for="fix in aiResult.fix_plan" :key="fix.priority" class="fix-item">
              <div class="fix-header">
                <n-tag type="success" :bordered="false" size="tiny">优先级 {{ fix.priority }}</n-tag>
                <span class="fix-action">{{ fix.action }}</span>
              </div>
              <n-space :size="8" class="fix-tags">
                <n-tag :bordered="false" size="tiny">
                  难度: {{ fix.difficulty === 'easy' ? '简单' : fix.difficulty === 'medium' ? '中等' : '困难' }}
                </n-tag>
                <n-tag :bordered="false" size="tiny">
                  风险: {{ fix.risk === 'low' ? '低' : fix.risk === 'medium' ? '中' : '高' }}
                </n-tag>
              </n-space>
              <p class="fix-effect" v-if="fix.expected_effect">{{ fix.expected_effect }}</p>
            </div>
          </n-card>

          <!-- Beginner explanation -->
          <n-card
            class="report-section-card"
            :bordered="true"
            title="小白解释"
            v-if="aiResult.beginner_explanation"
          >
            <n-alert type="info" :bordered="false">
              {{ aiResult.beginner_explanation }}
            </n-alert>
          </n-card>

          <!-- Retest commands -->
          <n-card
            class="report-section-card"
            :bordered="true"
            title="复测命令"
            v-if="aiResult.retest_commands?.length"
          >
            <n-code v-for="cmd in aiResult.retest_commands" :key="cmd" :code="cmd" language="bash" />
          </n-card>

          <!-- Missing information -->
          <n-card
            class="report-section-card"
            :bordered="true"
            title="缺少的信息"
            v-if="aiResult.missing_information?.length"
          >
            <ul class="missing-list">
              <li v-for="(info, idx) in aiResult.missing_information" :key="idx">{{ info }}</li>
            </ul>
          </n-card>
        </template>

        <!-- No AI result notice -->
        <n-alert
          v-if="!aiResult && report.summary"
          type="info"
          :bordered="false"
          class="no-ai-notice"
          title="管理员已关闭完整 AI JSON 保存，当前展示的是可读报告摘要。"
        />

        <!-- Markdown report -->
        <n-card class="report-section-card" :bordered="true" title="完整诊断报告" v-if="report.aiResult?.markdown_report">
          <markdown-report :content="report.aiResult.markdown_report" />
        </n-card>

        <!-- Actions -->
        <div class="report-actions" v-if="report.status === 'completed'">
          <n-button @click="copyReport">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </n-icon>
            </template>
            复制报告
          </n-button>
        </div>
      </template>
    </div>
  </public-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { getPublicReport } from '@/api/public-api'
import type { PublicReport } from '@/api/types'
import { formatDate, reportTypeLabel } from '@/utils/format'
import PublicLayout from '@/layouts/PublicLayout.vue'
import SeverityBadge from '@/components/public/SeverityBadge.vue'
import MetricCard from '@/components/public/MetricCard.vue'
import EvidenceList from '@/components/public/EvidenceList.vue'
import MarkdownReport from '@/components/public/MarkdownReport.vue'
import ErrorState from '@/components/common/ErrorState.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()
const reportId = route.params.reportId as string

const report = ref<PublicReport>({ reportId, status: 'processing' })

const aiResult = computed(() => report.value.aiResult || null)

const flatMetrics = computed(() => {
  const s = report.value.normalizedSummary
  if (!s) return {}
  const flat: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(s)) {
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      flat[key] = val
    }
  }
  return flat
})

async function loadReport() {
  try {
    const data = await getPublicReport(reportId)
    report.value = data
    if (data.status === 'processing' || data.status === 'pending') {
      router.replace({ name: 'analyze', params: { reportId } })
    }
  } catch {
    message.error('加载报告失败')
  }
}

function copyReport() {
  const md = report.value.aiResult?.markdown_report
  if (!md) return
  navigator.clipboard.writeText(md).then(() => {
    message.success('报告已复制到剪贴板')
  }).catch(() => {
    message.error('复制失败')
  })
}

onMounted(loadReport)
</script>

<style scoped>
.report-page {
  max-width: var(--content-max-width);
  padding-top: 24px;
}

.report-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.report-error-card {
  max-width: 600px;
  margin: 40px auto;
}

.report-summary-card {
  margin-bottom: var(--section-gap);
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.summary-text {
  font-size: 1rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 12px;
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.report-section-card {
  margin-bottom: var(--section-gap);
}

.cause-item {
  padding: 16px;
  background: #F8FAFD;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  margin-bottom: 12px;
}

.cause-item:last-child {
  margin-bottom: 0;
}

.cause-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.cause-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.cause-reason {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.cause-verify {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 8px;
}

.fix-item {
  padding: 16px;
  background: #F8FAFD;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  margin-bottom: 12px;
}

.fix-item:last-child {
  margin-bottom: 0;
}

.fix-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.fix-action {
  font-weight: 600;
  font-size: 0.9rem;
}

.fix-tags {
  margin-bottom: 8px;
}

.fix-effect {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.missing-list {
  padding-left: 20px;
}

.missing-list li {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.no-ai-notice {
  margin-bottom: var(--section-gap);
}

.report-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
  margin-bottom: 40px;
}
</style>
