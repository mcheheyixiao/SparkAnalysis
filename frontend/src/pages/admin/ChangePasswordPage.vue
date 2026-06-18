<template>
  <div class="change-password-page">
    <n-card class="password-card">
      <template #header>
        <div class="card-header">
          <n-icon size="24" color="var(--primary-color)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </n-icon>
          <span class="card-title">修改后台密码</span>
        </div>
      </template>

      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="left"
        label-width="100"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="当前密码" path="currentPassword">
          <n-input
            v-model:value="formData.currentPassword"
            type="password"
            show-password-on="click"
            placeholder="请输入当前密码"
            :disabled="loading"
          />
        </n-form-item>

        <n-form-item label="新密码" path="newPassword">
          <n-input
            v-model:value="formData.newPassword"
            type="password"
            show-password-on="click"
            placeholder="至少 8 位，包含字母和数字"
            :disabled="loading"
          />
        </n-form-item>

        <n-form-item label="确认新密码" path="confirmPassword">
          <n-input
            v-model:value="formData.confirmPassword"
            type="password"
            show-password-on="click"
            placeholder="请再次输入新密码"
            :disabled="loading"
          />
        </n-form-item>

        <div class="form-actions">
          <n-button
            type="primary"
            :loading="loading"
            :disabled="loading"
            @click="handleSubmit"
          >
            保存修改
          </n-button>
          <n-button @click="handleCancel" :disabled="loading">
            取消
          </n-button>
        </div>
      </n-form>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  NForm,
  NFormItem,
  NInput,
  NButton,
  NCard,
  NIcon,
  useMessage,
  type FormInst,
  type FormRules,
} from 'naive-ui'
import { changePassword } from '@/api/admin-api'
import { useAuthStore } from '@/stores/auth.store'
import { ApiError } from '@/api/http'

const router = useRouter()
const message = useMessage()
const auth = useAuthStore()
const formRef = ref<FormInst | null>(null)
const loading = ref(false)

const formData = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

function validateConfirmSame(_rule: any, value: string): boolean {
  return value === formData.newPassword
}

const rules: FormRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' },
    { pattern: /[A-Za-z]/, message: '新密码至少包含一个字母', trigger: 'blur' },
    { pattern: /[0-9]/, message: '新密码至少包含一个数字', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirmSame, message: '两次输入的新密码不一致', trigger: 'blur' },
  ],
}

async function handleSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    await changePassword({
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword,
      confirmPassword: formData.confirmPassword,
    })

    message.success('密码修改成功，请重新登录')

    // Logout and redirect to login
    try {
      await auth.logout()
    } catch {
      // ignore
    }
    router.push('/admin/login')
  } catch (e) {
    if (e instanceof ApiError) {
      message.error(e.message)
    } else {
      message.error('修改失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  router.push('/admin')
}
</script>

<style scoped>
.change-password-page {
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 0;
}

.password-card {
  border-radius: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title {
  font-size: 1.1rem;
  font-weight: 600;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}
</style>
