<template>
  <div class="report-detail-page">
    <page-header title="报告详情">
      <template #actions>
        <n-button @click="$router.back()">返回列表</n-button>
      </template>
    </page-header>

    <n-spin :show="loading">
      <!-- Basic Info -->
      <n-card title="基本信息" :bordered="true" class="detail-card">
        <n-descriptions :column="2" label-placement="left" bordered>
          <n-descriptions-item label="Report ID">{{ report.id }}</n-descriptions-item>
          <n-descriptions-item label="sparkCode">{{ report.sparkCode }}</n-descriptions-item>
          <n-descriptions-item label="报告类型">{{ report.reportType }}</n-descriptions-item>
          <n-descriptions-item label="状态">
            <n-tag :bordered="false" size="small">{{ statusLabel(report.status) }}</n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="进度">{{ report.progress }}%</n-descriptions-item>
          <n-descriptions-item label="阶段">{{ report.stage || '—' }}</n-descriptions-item>
          <n-descriptions-item label="平台">{{ report.platform || '—' }}</n-descriptions-item>
          <n-descriptions-item label="MC 版本">{{ report.minecraftVersion || '—' }}</n-descriptions-item>
          <n-descriptions-item label="spark 版本">{{ report.sparkVersion || '—' }}</n-descriptions-item>
          <n-descriptions-item label="服务端">{{ report.serverBrand || '—' }}</n-descriptions-item>
          <n-descriptions-item label="采样时长">{{ report.durationSeconds ? report.durationSeconds + 's' : '—' }}</n-descriptions-item>
          <n-descriptions-item label="严重程度" v-if="report.analysisResult?.severity">
            <n-tag :bordered="false" size="small" :type="severityTagType(report.analysisResult.severity)">
              {{ severityLabel(report.analysisResult.severity) }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="创建时间">{{ formatDate(report.createdAt) }}</n-descriptions-item>
          <n-descriptions-item label="完成时间">{{ formatDate(report.completedAt) }}</n-descriptions-item>
          <n-descriptions-item v-if="report.errorCode" label="错误码">
            <n-tag type="error" :bordered="false" size="small">{{ report.errorCode }}</n-tag>
          </n-descriptions-item>
          <n-descriptions-item v-if="report.errorMessage" label="错误信息" :span="2">
            {{ report.errorMessage }}
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- Analysis Result -->
      <n-card title="分析结果" :bordered="true" class="detail-card" v-if="report.analysisResult">
        <n-descriptions :column="2" label-placement="left" bordered>
          <n-descriptions-item label="摘要" :span="2">
            {{ report.analysisResult.summary || '—' }}
          </n-descriptions-item>
          <n-descriptions-item label="模型">{{ report.analysisResult.model || '—' }}</n-descriptions-item>
          <n-descriptions-item label="降级">
            <n-tag v-if="report.analysisResult.isFallback" type="warning" :bordered="false" size="small">是</n-tag>
            <span v-else>否</span>
          </n-descriptions-item>
          <n-descriptions-item label="输入 Tokens">{{ report.analysisResult.inputTokens || '—' }}</n-descriptions-item>
          <n-descriptions-item label="输出 Tokens">{{ report.analysisResult.outputTokens || '—' }}</n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- AI Result JSON -->
      <n-card title="AI 结构化结果" :bordered="true" class="detail-card" v-if="report.analysisResult?.aiResultJson">
        <n-collapse>
          <n-collapse-item title="展开查看" name="ai-result">
            <pre class="json-preview">{{ JSON.stringify(report.analysisResult.aiResultJson, null, 2) }}</pre>
          </n-collapse-item>
        </n-collapse>
      </n-card>

      <!-- Normalized JSON -->
      <n-card title="标准化数据" :bordered="true" class="detail-card" v-if="report.normalizedJson">
        <n-collapse>
          <n-collapse-item title="展开查看" name="normalized">
            <pre class="json-preview">{{ JSON.stringify(report.normalizedJson, null, 2) }}</pre>
          </n-collapse-item>
        </n-collapse>
      </n-card>

      <!-- Rule Analysis JSON -->
      <n-card title="规则分析" :bordered="true" class="detail-card" v-if="report.ruleAnalysisJson">
        <n-collapse>
          <n-collapse-item title="展开查看" name="rule">
            <pre class="json-preview">{{ JSON.stringify(report.ruleAnalysisJson, null, 2) }}</pre>
          </n-collapse-item>
        </n-collapse>
      </n-card>

      <!-- Raw Metadata -->
      <n-card title="原始 Metadata" :bordered="true" class="detail-card" v-if="report.rawMetadataJson">
        <n-collapse>
          <n-collapse-item title="展开查看" name="raw">
            <pre class="json-preview">{{ JSON.stringify(report.rawMetadataJson, null, 2) }}</pre>
          </n-collapse-item>
        </n-collapse>
      </n-card>

      <!-- Markdown Report -->
      <n-card title="Markdown 报告" :bordered="true" class="detail-card" v-if="report.analysisResult?.markdownReport">
        <markdown-report :content="report.analysisResult.markdownReport" />
      </n-card>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { getAdminReport } from '@/api/admin-api'
import type { AdminReport } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage, formatDate, statusLabel, severityLabel } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'
import MarkdownReport from '@/components/public/MarkdownReport.vue'

const route = useRoute()
const message = useMessage()
const id = route.params.id as string

const loading = ref(false)
const report = ref<AdminReport>({} as AdminReport)

function severityTagType(s: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  const map: Record<string, any> = {
    normal: 'success',
    low: 'info',
    medium: 'warning',
    high: 'error',
    critical: 'error',
  }
  return map[s] || 'default'
}

onMounted(async () => {
  loading.value = true
  try {
    report.value = await getAdminReport(id)
  } catch (e) {
    if (e instanceof ApiError) message.error(getErrorMessage(e.code))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.detail-card {
  margin-bottom: var(--section-gap);
}

.json-preview {
  background: #F4F7FB;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-sm);
  padding: 16px;
  font-size: 0.8rem;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
