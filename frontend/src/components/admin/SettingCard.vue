<template>
  <n-card :title="title" :bordered="true" size="small" class="setting-card">
    <template #header-extra v-if="$slots.extra">
      <slot name="extra" />
    </template>
    <slot />
  </n-card>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.setting-card {
  margin-bottom: var(--section-gap);
}
</style>
