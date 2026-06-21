<template>
  <public-layout>
    <div ref="analyzeRef" class="analyze-page container">
      <n-card class="analyze-card" :bordered="true">
        <template #header>
          <div class="analyze-header">
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
                {{ report.sparkCode || reportId }}
              </n-tag>
              <n-tag v-if="report.status === 'failed'" type="error" :bordered="false" size="small">失败</n-tag>
              <n-tag v-else-if="report.status === 'completed'" type="success" :bordered="false" size="small">完成</n-tag>
              <n-tag v-else type="warning" :bordered="false" size="small">
                <template #icon><n-spin :size="12" /></template>
                分析中
              </n-tag>
            </n-space>
          </div>
        </template>

        <!-- Error state -->
        <template v-if="report.status === 'failed'">
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
        </template>

        <!-- Processing state -->
        <template v-else>
          <div class="progress-section reveal-item">
            <div class="progress-info">
              <h3 class="stage-label">{{ report.message || '准备中...' }}</h3>
              <span class="stage-progress">{{ report.progress || 0 }}%</span>
            </div>
            <n-progress
              type="line"
              :percentage="report.progress || 0"
              :indicator-placement="'inside'"
              :height="20"
              :border-radius="4"
              processing
            />
          </div>

          <div class="reveal-item">
            <status-timeline :current-stage="report.stage || 'queued'" />
          </div>

          <div class="analyze-tips reveal-item">
            <n-alert type="info" :bordered="false">
              <template #header>
                分析通常需要 30-120 秒，AI 正在仔细诊断您的服务器性能数据
              </template>
            </n-alert>
          </div>
        </template>
      </n-card>

      <SparkAdBanner />
    </div>
  </public-layout>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getReportStatus } from '@/api/public-api'
import { usePolling } from '@/utils/polling'
import type { ReportStatus } from '@/api/types'
import PublicLayout from '@/layouts/PublicLayout.vue'
import StatusTimeline from '@/components/public/StatusTimeline.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import SparkAdBanner from '@/components/public/SparkAdBanner.vue'
import { useRevealAnimation } from '@/composables/useRevealAnimation'
import { ScrollTrigger } from '@/plugins/gsap'

const route = useRoute()
const router = useRouter()
const reportId = route.params.reportId as string

const report = ref<ReportStatus>({
  reportId,
  status: 'pending',
  progress: 0,
  stage: 'queued',
  message: '等待分析任务开始',
})

const analyzeRef = ref<HTMLElement | null>(null)

const dataReady = computed(() =>
  report.value.status === 'completed' || report.value.status === 'failed'
)

const { play } = useRevealAnimation(analyzeRef, {
  selector: '.reveal-item',
  stagger: 0.1,
  autoPlay: false,
  disabled: computed(() => !dataReady.value),
})

let entrancePlayed = false

async function poll() {
  try {
    const status = await getReportStatus(reportId)
    report.value = status

    // Play entrance animation once data is no longer pending
    if (!entrancePlayed && status.status !== 'pending') {
      entrancePlayed = true
      await nextTick()
      play()
      await nextTick()
      ScrollTrigger.refresh()
    }

    if (status.status === 'completed') {
      polling.stop()
      router.replace({ name: 'report', params: { reportId } })
    } else if (status.status === 'failed') {
      polling.stop()
    }
  } catch {
    // Keep polling on error
  }
}

const polling = usePolling(poll, 2000)

onMounted(() => {
  polling.start()
})
</script>

<style scoped>
.analyze-page {
  max-width: 680px;
  padding-top: 40px;
}

.analyze-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-section {
  margin-bottom: 24px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.stage-label {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stage-progress {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
}

.analyze-tips {
  margin-top: 24px;
}
</style>
