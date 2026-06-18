<template>
  <div class="admin-topbar">
    <div class="topbar-left">
      <n-button text class="collapse-btn" @click="$emit('toggle-sidebar')">
        <n-icon size="20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </n-icon>
      </n-button>
      <app-logo size="small" />
    </div>
    <div class="topbar-right">
      <n-dropdown :options="userMenuOptions" @select="handleUserMenu">
        <n-button text>
          <n-icon size="20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </n-icon>
          <span class="topbar-user">{{ auth.user?.username || '管理员' }}</span>
        </n-button>
      </n-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h } from 'vue'
import { useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import { useAuthStore } from '@/stores/auth.store'
import AppLogo from '@/components/common/AppLogo.vue'

defineEmits<{
  'toggle-sidebar': []
}>()

const router = useRouter()
const auth = useAuthStore()

const userMenuOptions = [
  {
    label: '返回前台',
    key: 'home',
    icon: () => h(NIcon, null, {
      default: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
        h('path', { d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' }),
        h('polyline', { points: '9 22 9 12 15 12 15 22' }),
      ]),
    }),
  },
  {
    label: '修改密码',
    key: 'change-password',
    icon: () => h(NIcon, null, {
      default: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
        h('rect', { x: '3', y: '11', width: '18', height: '11', rx: '2', ry: '2' }),
        h('path', { d: 'M7 11V7a5 5 0 0110 0v4' }),
      ]),
    }),
  },
  {
    label: '退出登录',
    key: 'logout',
    icon: () => h(NIcon, null, {
      default: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
        h('path', { d: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4' }),
        h('polyline', { points: '16 17 21 12 16 7' }),
        h('line', { x1: '21', y1: '12', x2: '9', y2: '12' }),
      ]),
    }),
  },
]

async function handleUserMenu(key: string) {
  if (key === 'logout') {
    await auth.logout()
    router.push('/')
  } else if (key === 'home') {
    router.push('/')
  } else if (key === 'change-password') {
    router.push('/admin/account/password')
  }
}
</script>

<style scoped>
.admin-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
  padding: 0 24px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.collapse-btn {
  display: none;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-user {
  margin-left: 6px;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .collapse-btn {
    display: flex;
  }

  .admin-topbar {
    padding: 0 16px;
    height: 56px;
  }
}
</style>
