<template>
  <div class="admin-sidebar" :class="{ collapsed }">
    <div class="sidebar-header" v-if="!collapsed">
      <app-logo size="small" />
    </div>
    <n-menu
      :value="activeKey"
      :collapsed="collapsed"
      :collapsed-width="64"
      :options="menuOptions"
      @update:value="handleMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import AppLogo from '@/components/common/AppLogo.vue'

defineProps<{
  collapsed: boolean
}>()

const route = useRoute()
const router = useRouter()

const activeKey = computed(() => route.path)

function renderIcon(icon: string) {
  const icons: Record<string, () => any> = {
    dashboard: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: 3, y: 3, width: 7, height: 7 }),
      h('rect', { x: 14, y: 3, width: 7, height: 7 }),
      h('rect', { x: 14, y: 14, width: 7, height: 7 }),
      h('rect', { x: 3, y: 14, width: 7, height: 7 }),
    ]),
    settings: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('circle', { cx: 12, cy: 12, r: 3 }),
      h('path', { d: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z' }),
    ]),
    prompt: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('polyline', { points: '4 7 4 4 20 4 20 7' }),
      h('line', { x1: '9', y1: '20', x2: '15', y2: '20' }),
      h('line', { x1: '12', y1: '4', x2: '12', y2: '20' }),
    ]),
    reports: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
      h('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
    ]),
    logs: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
    ]),
    ai: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('polyline', { points: '16 18 22 12 16 6' }),
      h('polyline', { points: '8 6 2 12 8 18' }),
    ]),
  }
  return () => h(NIcon, null, { default: icons[icon] })
}

const menuOptions: MenuOption[] = [
  {
    label: '仪表盘',
    key: '/admin',
    icon: renderIcon('dashboard'),
  },
  {
    label: 'AI 设置',
    key: '/admin/settings/ai',
    icon: renderIcon('ai'),
  },
  {
    label: '系统设置',
    key: '/admin/settings/system',
    icon: renderIcon('settings'),
  },
  {
    label: 'Prompt 模板',
    key: '/admin/prompts',
    icon: renderIcon('prompt'),
  },
  {
    label: '分析记录',
    key: '/admin/reports',
    icon: renderIcon('reports'),
  },
  {
    label: '系统日志',
    key: '/admin/logs',
    icon: renderIcon('logs'),
  },
]

function handleMenu(key: string) {
  router.push(key)
}
</script>

<style scoped>
.admin-sidebar {
  background: rgba(255, 255, 255, 0.95);
  border-right: 1px solid var(--border-color);
  height: 100%;
  transition: width 0.2s;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}
</style>
