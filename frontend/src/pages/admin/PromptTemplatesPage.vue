<template>
  <div class="prompts-page">
    <page-header title="Prompt 模板" subtitle="管理 AI 提示词模板">
      <template #actions>
        <n-button type="primary" @click="showCreate = true">
          <template #icon>
            <n-icon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14m-7-7h14" />
              </svg>
            </n-icon>
          </template>
          新建模板
        </n-button>
      </template>
    </page-header>

    <!-- Filters -->
    <data-table-toolbar>
      <n-select
        v-model:value="filterType"
        :options="typeOptions"
        placeholder="按类型筛选"
        clearable
        style="width: 180px"
        @update:value="loadPrompts"
      />
    </data-table-toolbar>

    <!-- Table -->
    <n-data-table
      :columns="columns"
      :data="prompts"
      :loading="loading"
      :bordered="true"
      :row-key="(r: PromptTemplate) => r.id"
    />

    <!-- Create/Edit Modal -->
    <n-modal v-model:show="showCreate" preset="card" :title="editingId ? '编辑模板' : '新建模板'" style="max-width: 720px">
      <n-form :model="editForm" label-placement="top">
        <n-form-item label="名称" required>
          <n-input v-model:value="editForm.name" placeholder="模板名称" :maxlength="128" />
        </n-form-item>
        <n-form-item label="类型" required>
          <n-select
            v-model:value="editForm.type"
            :options="typeOptions"
            placeholder="选择类型"
          />
        </n-form-item>
        <n-form-item label="内容" required>
          <n-input
            v-model:value="editForm.content"
            type="textarea"
            placeholder="模板内容"
            :rows="12"
            :maxlength="50000"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space>
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="handleSave">
            {{ editingId ? '更新' : '创建' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
import { useMessage, useDialog, NButton, NSpace, NTag } from 'naive-ui'
import { getPrompts, createPrompt, updatePrompt, deletePrompt, setDefaultPrompt } from '@/api/admin-api'
import type { PromptTemplate, PromptCreateRequest } from '@/api/types'
import { ApiError } from '@/api/http'
import { getErrorMessage } from '@/utils/format'
import PageHeader from '@/components/common/PageHeader.vue'
import DataTableToolbar from '@/components/admin/DataTableToolbar.vue'

const message = useMessage()
const dialog = useDialog()

const loading = ref(false)
const saving = ref(false)
const prompts = ref<PromptTemplate[]>([])
const filterType = ref<string | null>(null)
const showCreate = ref(false)
const editingId = ref<string | null>(null)

const editForm = ref<PromptCreateRequest>({
  name: '',
  type: 'system',
  content: '',
})

const typeOptions = [
  { label: 'System', value: 'system' },
  { label: 'User', value: 'user' },
  { label: 'JSON Schema', value: 'json_schema' },
  { label: 'Beginner', value: 'beginner' },
  { label: 'Advanced', value: 'advanced' },
]

const typeLabel = (t: string) => {
  const m: Record<string, string> = {
    system: 'System',
    user: 'User',
    json_schema: 'JSON Schema',
    beginner: 'Beginner',
    advanced: 'Advanced',
  }
  return m[t] || t
}

const columns = [
  { title: '名称', key: 'name', ellipsis: { tooltip: true }, width: 200 },
  { title: '类型', key: 'type', width: 120, render: (r: PromptTemplate) => h(NTag, { size: 'small', bordered: false }, () => typeLabel(r.type)) },
  { title: '默认', key: 'isDefault', width: 70, render: (r: PromptTemplate) => r.isDefault ? h(NTag, { type: 'success', size: 'small', bordered: false }, () => '是') : '—' },
  { title: '版本', key: 'version', width: 60 },
  { title: '更新时间', key: 'updatedAt', width: 160, render: (r: PromptTemplate) => formatDate(r.updatedAt) },
  {
    title: '操作', key: 'actions', width: 240,
    render: (r: PromptTemplate) => h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', onClick: () => startEdit(r) }, () => '编辑'),
      !r.isDefault && h(NButton, { size: 'small', onClick: () => handleSetDefault(r.id) }, () => '设为默认'),
      h(NButton, { size: 'small', type: 'error', onClick: () => handleDelete(r) }, () => '删除'),
    ]),
  },
]

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('zh-CN')
}

async function loadPrompts() {
  loading.value = true
  try {
    const data = await getPrompts(filterType.value || undefined)
    prompts.value = data.prompts || data.items || []
  } catch (e) {
    if (e instanceof ApiError) message.error(getErrorMessage(e.code))
  } finally {
    loading.value = false
  }
}

function startEdit(prompt: PromptTemplate) {
  editingId.value = prompt.id
  editForm.value = { name: prompt.name, type: prompt.type, content: prompt.content }
  showCreate.value = true
}

function resetForm() {
  editingId.value = null
  editForm.value = { name: '', type: 'system', content: '' }
}

async function handleSave() {
  saving.value = true
  try {
    if (editingId.value) {
      await updatePrompt(editingId.value, editForm.value)
      message.success('模板已更新')
    } else {
      await createPrompt(editForm.value)
      message.success('模板已创建')
    }
    showCreate.value = false
    resetForm()
    await loadPrompts()
  } catch (e) {
    if (e instanceof ApiError) message.error(getErrorMessage(e.code))
  } finally {
    saving.value = false
  }
}

async function handleDelete(prompt: PromptTemplate) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除模板「${prompt.name}」吗？此操作不可撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deletePrompt(prompt.id)
        message.success('模板已删除')
        await loadPrompts()
      } catch (e) {
        if (e instanceof ApiError) message.error(getErrorMessage(e.code))
      }
    },
  })
}

async function handleSetDefault(id: string) {
  dialog.warning({
    title: '设为默认',
    content: '确定要将此模板设为默认吗？同类型的其他默认模板将被取消。',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await setDefaultPrompt(id)
        message.success('已设为默认模板')
        await loadPrompts()
      } catch (e) {
        if (e instanceof ApiError) message.error(getErrorMessage(e.code))
      }
    },
  })
}

onMounted(loadPrompts)
</script>
