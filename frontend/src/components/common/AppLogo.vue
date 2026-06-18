<template>
  <div class="app-logo" :class="{ small: size === 'small' }">
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#2DBE8D" />
      <path
        d="M12 28V14l8 4v4l8-4v14"
        stroke="white"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="20" cy="16" r="2" fill="white" />
      <circle cx="14" cy="20" r="1.5" fill="white" opacity="0.7" />
      <circle cx="26" cy="20" r="1.5" fill="white" opacity="0.7" />
    </svg>
    <span class="logo-text" v-if="!iconOnly">Spark AI Analyzer</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  size?: 'default' | 'small'
  iconOnly?: boolean
}>()
</script>

<style scoped>
.app-logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-logo.small svg {
  width: 32px;
  height: 32px;
}

.app-logo svg {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.logo-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}
</style>
