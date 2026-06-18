<template>
  <div class="admin-layout">
    <admin-sidebar :collapsed="sidebarCollapsed" />
    <div class="admin-body">
      <admin-topbar @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed" />
      <div class="admin-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AdminSidebar from '@/components/admin/AdminSidebar.vue'
import AdminTopbar from '@/components/admin/AdminTopbar.vue'

const sidebarCollapsed = ref(false)
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-page);
}

.admin-sidebar {
  width: 240px;
  flex-shrink: 0;
}

.admin-sidebar.collapsed {
  width: 64px;
}

.admin-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-content {
  flex: 1;
  padding: 24px;
  overflow-x: hidden;
}

@media (max-width: 768px) {
  .admin-sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 200;
    transform: translateX(-100%);
    transition: transform 0.2s;
  }

  .admin-sidebar:not(.collapsed) {
    transform: translateX(0);
  }

  .admin-content {
    padding: 16px;
  }
}
</style>
