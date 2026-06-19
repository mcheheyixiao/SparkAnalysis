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
            <n-tag :bordered="false" size="small">{{ reportTypeLabel }}</n-tag>
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
