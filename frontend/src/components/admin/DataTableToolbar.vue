<template>
  <div class="table-toolbar">
    <slot />
  </div>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
</style>
