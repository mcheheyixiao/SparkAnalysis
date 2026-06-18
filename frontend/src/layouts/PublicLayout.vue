<template>
  <div class="public-layout">
    <header class="public-header">
      <div class="container header-inner">
        <router-link to="/" class="header-logo">
          <app-logo />
        </router-link>
        <nav class="header-nav">
          <n-button text tag="a" href="https://spark.lucko.me" target="_blank" rel="noopener">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4m0-4h.01" />
                </svg>
              </n-icon>
            </template>
            如何使用 spark
          </n-button>
          <n-button text tag="router-link" to="/admin">
            <template #icon>
              <n-icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </n-icon>
            </template>
            管理后台
          </n-button>
        </nav>
      </div>
    </header>
    <main class="public-main">
      <slot />
    </main>
    <footer class="public-footer">
      <div class="container footer-inner">
        <span>Spark AI Analyzer — Minecraft 性能分析工具</span>
        <span class="footer-muted">基于 spark.lucko.me 数据 & DeepSeek AI</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import AppLogo from '@/components/common/AppLogo.vue'
</script>

<style scoped>
.public-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.public-header {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
}

.header-nav {
  display: flex;
  gap: 8px;
  align-items: center;
}

.public-main {
  flex: 1;
  padding-bottom: 40px;
}

.public-footer {
  border-top: 1px solid var(--border-color);
  padding: 20px 0;
}

.footer-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.footer-muted {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .header-inner {
    height: 56px;
  }

  .footer-inner {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
