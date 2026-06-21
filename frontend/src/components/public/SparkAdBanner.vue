<template>
  <section
    v-if="visible"
    class="spark-ad-banner"
    aria-label="星遥游戏推广"
  >
    <!-- Icon -->
    <div class="spark-ad-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="6" y1="11" x2="10" y2="11" />
        <line x1="8" y1="9" x2="8" y2="13" />
        <line x1="15" y1="12" x2="15.01" y2="12" />
        <line x1="18" y1="10" x2="18.01" y2="10" />
        <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59C2.46 10.47 2 13.06 2 16c0 2.94.46 5.53.702 7.41A4 4 0 0 0 6.68 27h10.64a4 4 0 0 0 3.978-3.59C21.54 21.53 22 18.94 22 16c0-2.94-.46-5.53-.702-7.41A4 4 0 0 0 17.32 5z" />
        <path d="M6.68 5a4 4 0 0 1 3.978 3.59c.22 1.68.342 3.19.342 4.41" />
        <path d="M17.32 5a4 4 0 0 0-3.978 3.59c-.22 1.68-.342 3.19-.342 4.41" />
        <path d="M13 13v3" />
      </svg>
    </div>

    <!-- Content -->
    <div class="spark-ad-content">
      <div class="spark-ad-brand">
        <span>星遥游戏</span>
        <span class="spark-ad-badge">大促进行中</span>
      </div>
      <p class="spark-ad-text">
        稳定不超开的联机服务器，支持数百整合包自动部署，纯小白也能顷刻间完成开服！全员开发者售后，全天在线保障优质游戏体验！
      </p>
    </div>

    <!-- Actions -->
    <div class="spark-ad-actions">
      <!-- TODO: 替换为真实广告落地页链接 -->
      <a
        href="#"
        target="_blank"
        rel="noopener noreferrer"
        class="spark-ad-button"
      >
        了解更多
      </a>
      <button
        class="spark-ad-close"
        aria-label="关闭广告"
        @click="dismiss"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          width="16"
          height="16"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const STORAGE_KEY = 'spark-analysis-ad-hidden'

const visible = ref(!localStorage.getItem(STORAGE_KEY))

function dismiss() {
  visible.value = false
  localStorage.setItem(STORAGE_KEY, '1')
}
</script>

<style scoped>
.spark-ad-banner {
  width: 100%;
  max-width: 680px;
  margin: 20px auto 0;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid rgba(126, 211, 171, 0.35);
  border-radius: var(--border-radius-md);
  background:
    radial-gradient(circle at 12% 20%, rgba(45, 190, 141, 0.14), transparent 28%),
    linear-gradient(135deg, #eafbf3 0%, #eef7ff 100%);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

/* Icon */
.spark-ad-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: rgba(45, 190, 141, 0.14);
  color: #2DBE8D;
  flex: 0 0 auto;
}

.spark-ad-icon svg {
  width: 20px;
  height: 20px;
}

/* Content */
.spark-ad-content {
  min-width: 0;
  flex: 1;
}

.spark-ad-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.spark-ad-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  background: var(--color-primary-light);
  white-space: nowrap;
}

.spark-ad-text {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* Actions */
.spark-ad-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.spark-ad-button {
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  background: linear-gradient(135deg, #2DBE8D 0%, #2F80ED 100%);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(45, 190, 141, 0.22);
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.spark-ad-button:hover {
  box-shadow: 0 6px 20px rgba(45, 190, 141, 0.32);
  transform: translateY(-1px);
  text-decoration: none;
}

.spark-ad-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.spark-ad-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  transition: background 0.15s ease, color 0.15s ease;
}

.spark-ad-close:hover {
  background: rgba(255, 255, 255, 0.95);
  color: var(--text-primary);
}

.spark-ad-close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Mobile */
@media (max-width: 640px) {
  .spark-ad-banner {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 12px 14px;
    gap: 10px;
  }

  .spark-ad-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
  }

  .spark-ad-icon svg {
    width: 17px;
    height: 17px;
  }

  .spark-ad-brand {
    font-size: 13px;
  }

  .spark-ad-badge {
    font-size: 11px;
    padding: 1px 6px;
  }

  .spark-ad-text {
    font-size: 12px;
  }

  .spark-ad-actions {
    width: 100%;
    justify-content: flex-end;
    margin-top: 2px;
  }

  .spark-ad-button {
    height: 30px;
    padding: 0 12px;
    font-size: 12px;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .spark-ad-button {
    transition: none;
  }

  .spark-ad-button:hover {
    transform: none;
  }
}
</style>
