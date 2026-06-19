<template>
  <public-layout>
    <div ref="topRef" class="report-page container">
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
        <div class="report-topbar reveal-item">
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
            <n-tag :bordered="false" size="small">{{ reportTypeText }}</n-tag>
          </n-space>
        </div>

        <!-- Summary card -->
        <n-card class="report-summary-card reveal-item" :bordered="true">
          <div class="summary-header">
            <h2 class="summary-title">分析摘要</h2>
            <n-text depth="3" v-if="report.completedAt">
              完成于 {{ formatDate(report.completedAt) }}
            </n-text>
          </div>
          <div class="summary-text-list" v-if="summaryTexts.length">
            <p
              v-for="(text, index) in summaryTexts"
              :key="index"
              class="summary-text"
            >
              {{ text }}
            </p>
          </div>

          <!-- Metrics -->
          <div class="summary-metrics" v-if="summaryMetrics.length">
            <metric-card
              v-for="metric in summaryMetrics"
              :key="metric.key"
              :label="metric.label"
              :value="metric.value"
              :unit="metric.unit"
              :trend="metric.trend"
              :animate-value="true"
            />
          </div>

          <!-- Server environment info -->
          <div class="summary-meta" v-if="summaryMeta.length">
            <n-tag
              v-for="item in summaryMeta"
              :key="item.key"
              size="small"
              :bordered="false"
            >
              {{ item.label }}：{{ item.value }}
            </n-tag>
          </div>
        </n-card>

        <!-- AI Result Summary only — full report is markdownReport -->
        <div ref="sectionRef">
        <!-- Fallback warning -->
        <n-alert
          v-if="report.isFallback"
          type="warning"
          :bordered="false"
          class="no-ai-notice"
          title="使用规则兜底分析"
        >
          AI 结构化输出可能异常，系统已自动使用规则预分析生成可读报告。建议重新分析或联系管理员检查 AI 配置。
        </n-alert>

        <!-- No AI result notice -->
        <n-alert
          v-if="!aiResult && report.summary"
          type="info"
          :bordered="false"
          class="no-ai-notice"
          title="管理员已关闭完整 AI JSON 保存，当前展示的是可读报告摘要。"
        />

        <!-- Markdown report (the single source of truth for display) -->
        <n-card class="report-section-card reveal-section" :bordered="true" title="完整诊断报告">
          <markdown-report :content="displayMarkdown" />
        </n-card>
        </div>

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
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { getPublicReport } from '@/api/public-api'
import type { PublicReport } from '@/api/types'
import { formatDate, reportTypeLabel } from '@/utils/format'
import PublicLayout from '@/layouts/PublicLayout.vue'
import SeverityBadge from '@/components/public/SeverityBadge.vue'
import MetricCard from '@/components/public/MetricCard.vue'
import MarkdownReport from '@/components/public/MarkdownReport.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { gsap, ScrollTrigger } from '@/plugins/gsap'
import { useRevealAnimation } from '@/composables/useRevealAnimation'

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ── Defense: detect JSON-like strings ──

function looksLikeJsonText(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

// ── Client-side fallback markdown ──

function buildClientFallbackMarkdown(report: PublicReport | null): string {
  if (!report) return ''

  return [
    '# 总结',
    report.summary || '当前报告暂无完整 AI 诊断内容。',
    '',
    '## 小白解释',
    '当前系统没有拿到完整的可读报告，因此先展示摘要信息。请重新分析或联系管理员检查 AI 输出配置。',
    '',
    '## 建议下一步',
    '- 重新提交 spark 链接分析。',
    '- 如果多次出现，请管理员检查 AI Prompt、maxTokens 和后端日志。',
  ].join('\n')
}

const route = useRoute()
const router = useRouter()
const message = useMessage()

const topRef = ref<HTMLElement | null>(null)

const { play: playTopReveal } = useRevealAnimation(topRef, {
  selector: '.reveal-item',
  stagger: 0.06,
  autoPlay: false,
})

const topRevealPlayed = ref(false)
const reportId = route.params.reportId as string

const report = ref<PublicReport>({ reportId, status: 'processing' })

const aiResult = computed(() => report.value.aiResult || null)

// ── Summary types ──

type MetricTrend = 'up' | 'down' | 'stable'

interface SummaryMetric {
  key: string
  label: string
  value: string | number
  unit?: string
  trend?: MetricTrend
}

// ── Path helpers ──

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getPath(root: unknown, path: string[]): unknown {
  let current: unknown = root

  for (const key of path) {
    const record = getRecord(current)
    if (!record) return undefined
    current = record[key]
  }

  return current
}

function getNumberPath(root: unknown, path: string[]): number | undefined {
  const value = getPath(root, path)
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function getStringPath(root: unknown, path: string[]): string | undefined {
  const value = getPath(root, path)
  return typeof value === 'string' && value.trim() ? value : undefined
}

// ── Formatting helpers ──

function formatMetricNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—'
  return Number.isInteger(value) || digits === 0 ? String(Math.round(value)) : value.toFixed(digits)
}

function formatDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60)
    const rest = Math.round(seconds % 60)
    return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  }
  return `${Math.round(seconds)}s`
}

function formatMemoryMB(usedMB: number, maxMB?: number): string {
  const usedGB = usedMB / 1024
  if (maxMB && maxMB > 0) {
    const maxGB = maxMB / 1024
    return `${usedGB.toFixed(1)}/${maxGB.toFixed(1)} GB`
  }
  if (usedGB >= 1) return `${usedGB.toFixed(1)} GB`
  return `${Math.round(usedMB)} MB`
}

function normalizeSummaryText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[，。,.!！?？；;：:]/g, '')
    .trim()
    .toLowerCase()
}

// ── Report type label (computed) ──

const reportTypeText = computed(() => {
  const type = report.value.reportType
    || getStringPath(report.value.normalizedSummary, ['reportType'])
    || 'unknown'

  return reportTypeLabel(type)
})

// ── Summary texts (deduplicated) ──

const summaryTexts = computed(() => {
  const values = [
    report.value.summary,
    aiResult.value?.one_sentence_summary,
  ]

  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (!text) continue

    const normalized = normalizeSummaryText(text)
    if (seen.has(normalized)) continue

    seen.add(normalized)
    result.push(text)
  }

  return result
})

// ── Curated performance metrics ──

const summaryMetrics = computed<SummaryMetric[]>(() => {
  const s = report.value.normalizedSummary
  if (!s) return []

  const metrics: SummaryMetric[] = []

  const tps = getNumberPath(s, ['health', 'tps', 'mean'])
    ?? getNumberPath(s, ['health', 'tps', 'latest'])

  if (tps != null) {
    metrics.push({
      key: 'tps',
      label: 'TPS',
      value: formatMetricNumber(tps, 1),
      unit: 'TPS',
      trend: tps >= 19.5 ? 'stable' : 'up',
    })
  }

  const msptMean = getNumberPath(s, ['health', 'mspt', 'mean'])
    ?? getNumberPath(s, ['health', 'mspt', 'median'])

  if (msptMean != null) {
    metrics.push({
      key: 'msptMean',
      label: 'MSPT 平均',
      value: formatMetricNumber(msptMean, 1),
      unit: 'ms',
      trend: msptMean < 40 ? 'down' : msptMean < 50 ? 'stable' : 'up',
    })
  }

  const msptMax = getNumberPath(s, ['health', 'mspt', 'max'])
  if (msptMax != null) {
    metrics.push({
      key: 'msptMax',
      label: 'MSPT 最大',
      value: formatMetricNumber(msptMax, 1),
      unit: 'ms',
      trend: msptMax <= 100 ? 'stable' : 'up',
    })
  }

  const memoryUsage = getNumberPath(s, ['health', 'memory', 'usagePercent'])
  const memoryUsed = getNumberPath(s, ['health', 'memory', 'usedMB'])
  const memoryMax = getNumberPath(s, ['health', 'memory', 'maxMB'])

  if (memoryUsage != null) {
    metrics.push({
      key: 'memoryUsage',
      label: '内存使用',
      value: formatMetricNumber(memoryUsage, 0),
      unit: '%',
      trend: memoryUsage >= 85 ? 'up' : 'stable',
    })
  } else if (memoryUsed != null) {
    metrics.push({
      key: 'memoryUsed',
      label: '已用内存',
      value: formatMemoryMB(memoryUsed, memoryMax),
      unit: memoryMax ? undefined : 'MB',
      trend: 'stable',
    })
  }

  const cpuProcess = getNumberPath(s, ['health', 'cpu', 'process'])
  if (cpuProcess != null) {
    metrics.push({
      key: 'cpuProcess',
      label: '进程 CPU',
      value: formatMetricNumber(cpuProcess, 0),
      unit: '%',
      trend: cpuProcess >= 85 ? 'up' : 'stable',
    })
  }

  const playerCount = getNumberPath(s, ['health', 'playerCount'])
  if (playerCount != null) {
    metrics.push({
      key: 'playerCount',
      label: '在线玩家',
      value: formatMetricNumber(playerCount, 0),
      unit: '人',
      trend: 'stable',
    })
  }

  const worldEntities = getNumberPath(s, ['health', 'worldEntities'])
    ?? getNumberPath(s, ['health', 'entityDistribution', 'totalEntities'])

  if (worldEntities != null) {
    metrics.push({
      key: 'worldEntities',
      label: '世界实体',
      value: formatMetricNumber(worldEntities, 0),
      unit: '个',
      trend: worldEntities >= 5000 ? 'up' : 'stable',
    })
  }

  const durationSeconds = getNumberPath(s, ['timing', 'durationSeconds'])
  if (durationSeconds != null) {
    metrics.push({
      key: 'duration',
      label: '采样时长',
      value: formatDurationSeconds(durationSeconds),
      trend: 'stable',
    })
  }

  return metrics
})

// ── Server environment info ──

const summaryMeta = computed(() => {
  const s = report.value.normalizedSummary
  if (!s) return []

  const items: Array<{ key: string; label: string; value: string }> = []

  const platform = getStringPath(s, ['server', 'platform'])
  if (platform) items.push({ key: 'platform', label: '平台', value: platform })

  const mcVersion = getStringPath(s, ['server', 'minecraftVersion'])
  if (mcVersion) items.push({ key: 'minecraftVersion', label: 'MC', value: mcVersion })

  const sparkVersion = getStringPath(s, ['server', 'sparkVersion'])
  if (sparkVersion) items.push({ key: 'sparkVersion', label: 'spark', value: sparkVersion })

  return items
})

// ── Display markdown priority ──
// 1. report.markdownReport (backend-generated, clean)
// 2. report.aiResult.markdown_report (only if not JSON-like)
// 3. Client-side fallback from structured fields

const displayMarkdown = computed(() => {
  if (report.value?.markdownReport && !looksLikeJsonText(report.value.markdownReport)) {
    return report.value.markdownReport
  }

  const aiMarkdown = report.value?.aiResult?.markdown_report
  if (aiMarkdown && !looksLikeJsonText(aiMarkdown)) {
    return aiMarkdown
  }

  return buildClientFallbackMarkdown(report.value)
})

// ---- Scroll-triggered section reveals ----

const sectionRef = ref<HTMLElement | null>(null)
const prefersReduced = getPrefersReducedMotion()
let scrollCtx: gsap.Context | null = null
const dataReady = computed(() => report.value.status === 'completed')

function initScrollReveal() {
  if (!sectionRef.value) return

  const sections = gsap.utils.toArray<HTMLElement>(
    '.reveal-section',
    sectionRef.value
  )

  // CRITICAL: reduced-motion must make sections visible, not leave them hidden
  if (prefersReduced) {
    gsap.set(sections, { opacity: 1, y: 0 })
    return
  }

  scrollCtx?.revert()

  const targets = sections

  scrollCtx = gsap.context(() => {
    targets.forEach((section) => {
      gsap.to(section, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      })
    })
  }, sectionRef.value)
}

function refreshTriggers() {
  ScrollTrigger.refresh()
}

async function loadReport() {
  try {
    const data = await getPublicReport(reportId)
    report.value = data
    if (data.status === 'processing' || data.status === 'pending') {
      router.replace({ name: 'analyze', params: { reportId } })
    }

    // After data loads and DOM updates, play top reveals then init scroll reveals
    await nextTick()

    if (dataReady.value) {
      if (!topRevealPlayed.value) {
        topRevealPlayed.value = true
        playTopReveal()
      }

      if (!prefersReduced) {
        initScrollReveal()
        refreshTriggers()
      }
    }
  } catch {
    message.error('加载报告失败')
  }
}

function copyReport() {
  const md = displayMarkdown.value
  if (!md) return
  navigator.clipboard.writeText(md).then(() => {
    message.success('报告已复制到剪贴板')
  }).catch(() => {
    message.error('复制失败')
  })
}

onMounted(loadReport)

onBeforeUnmount(() => {
  scrollCtx?.revert()
})
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
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.summary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
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
