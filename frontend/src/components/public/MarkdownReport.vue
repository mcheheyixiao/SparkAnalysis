<template>
  <div class="markdown-report">
    <div class="markdown-body" v-html="renderedHtml" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'

const props = defineProps<{
  content: string
}>()

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: true,
})

const renderedHtml = computed(() => {
  if (!props.content) return '<p>暂无报告内容</p>'
  return md.render(props.content)
})
</script>

<style scoped>
.markdown-report {
  padding: 16px 0;
}
</style>
