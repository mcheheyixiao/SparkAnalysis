<template>
  <div class="login-page">
    <n-card class="login-card" :bordered="true">
      <div class="login-header">
        <app-logo />
        <p class="login-title">管理员登录</p>
      </div>
      <n-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleLogin">
        <n-form-item path="username" label="用户名">
          <n-input
            v-model:value="form.username"
            placeholder="请输入管理员用户名"
            :disabled="auth.loginLoading"
            size="large"
          />
        </n-form-item>
        <n-form-item path="password" label="密码">
          <n-input
            v-model:value="form.password"
            type="password"
            placeholder="请输入密码"
            :disabled="auth.loginLoading"
            size="large"
            show-password-on="click"
            @keyup.enter="handleLogin"
          />
        </n-form-item>
        <n-form-item v-if="auth.loginError">
          <n-alert type="error" :bordered="false">
            {{ auth.loginError }}
          </n-alert>
        </n-form-item>
        <n-button
          type="primary"
          block
          size="large"
          :loading="auth.loginLoading"
          @click="handleLogin"
          attr-type="submit"
        >
          登录
        </n-button>
      </n-form>
      <div class="login-footer">
        <n-button text size="small" @click="$router.push('/')">
          返回首页
        </n-button>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInst, FormRules } from 'naive-ui'
import { useAuthStore } from '@/stores/auth.store'
import AppLogo from '@/components/common/AppLogo.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInst | null>(null)
const form = ref({ username: '', password: '' })

const rules: FormRules = {
  username: { required: true, message: '请输入用户名', trigger: 'blur' },
  password: { required: true, message: '请输入密码', trigger: 'blur' },
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const ok = await auth.login(form.value.username, form.value.password)
  if (ok) {
    const redirect = (route.query.redirect as string) || '/admin'
    router.push(redirect)
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-page);
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 400px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 12px;
}

.login-footer {
  text-align: center;
  margin-top: 20px;
}
</style>
