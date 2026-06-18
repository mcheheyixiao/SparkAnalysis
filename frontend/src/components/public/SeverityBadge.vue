<template>
  <n-tag :color="colorMap" :bordered="false" size="small">
    {{ label }}
  </n-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  severity: string
}>()

const colorMap = computed(() => {
  const map: Record<string, any> = {
    normal: { color: '#10B981', textColor: '#FFFFFF' },
    low: { color: '#38BDF8', textColor: '#FFFFFF' },
    medium: { color: '#F59E0B', textColor: '#FFFFFF' },
    high: { color: '#F97316', textColor: '#FFFFFF' },
    critical: { color: '#EF4444', textColor: '#FFFFFF' },
  }
  return map[props.severity] || { color: '#9CA3AF', textColor: '#FFFFFF' }
})

const label = computed(() => {
  const map: Record<string, string> = {
    normal: '正常',
    low: '轻微',
    medium: '中等',
    high: '较高',
    critical: '严重',
  }
  return map[props.severity] || props.severity
})
</script>
