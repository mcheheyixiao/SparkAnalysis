<template>
  <div class="app-logo" :class="{ small: size === 'small' }">
    <img src="/logo.png" alt="Spark AI Analyzer Logo" />
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

.app-logo.small img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.app-logo img {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  object-fit: contain;
}

.logo-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}
</style>
