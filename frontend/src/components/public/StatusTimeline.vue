<template>
  <div class="status-timeline">
    <div
      v-for="(item, index) in steps"
      :key="item.stage"
      class="timeline-item"
      :class="{
        active: index === currentIndex,
        completed: index < currentIndex,
        pending: index > currentIndex,
      }"
    >
      <div class="timeline-dot">
        <n-icon v-if="index < currentIndex" size="14">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
        </n-icon>
        <n-spin v-else-if="index === currentIndex" :size="14" />
      </div>
      <div class="timeline-content">
        <span class="timeline-label">{{ item.label }}</span>
        <span class="timeline-desc" v-if="item.description">{{ item.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  currentStage: string
}>()

const STAGES = [
  { stage: 'queued', label: '排队等待', description: '等待分析任务开始' },
  { stage: 'fetching_spark', label: '读取报告', description: '正在读取 spark 报告' },
  { stage: 'normalizing', label: '整理数据', description: '正在整理性能数据' },
  { stage: 'rule_analyzing', label: '规则分析', description: '正在进行规则预分析' },
  { stage: 'building_prompt', label: '构建上下文', description: '正在构建 AI 分析上下文' },
  { stage: 'calling_ai', label: 'AI 诊断', description: '正在调用 AI 生成诊断报告' },
  { stage: 'saving_result', label: '保存结果', description: '正在保存分析结果' },
  { stage: 'completed', label: '完成', description: '分析完成' },
]

const steps = STAGES

const currentIndex = computed(() => {
  const idx = STAGES.findIndex((s) => s.stage === props.currentStage)
  return idx >= 0 ? idx : 0
})
</script>

<style scoped>
.status-timeline {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  position: relative;
}

.timeline-item:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 11px;
  top: 30px;
  bottom: 0;
  width: 2px;
  background: var(--border-color);
}

.timeline-item.completed:not(:last-child)::after {
  background: var(--color-primary);
}

.timeline-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  background: var(--border-color);
  color: var(--text-muted);
}

.timeline-item.completed .timeline-dot {
  background: var(--color-primary);
  color: white;
}

.timeline-item.active .timeline-dot {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timeline-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-muted);
}

.timeline-item.completed .timeline-label,
.timeline-item.active .timeline-label {
  color: var(--text-primary);
  font-weight: 600;
}

.timeline-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
}
</style>
