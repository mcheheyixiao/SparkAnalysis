import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { setToken, clearToken, getToken, getStoredUser, setStoredUser } from '@/utils/storage'
import * as adminApi from '@/api/admin-api'
import type { AdminUser } from '@/api/types'
import { ApiError } from '@/api/http'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AdminUser | null>(getStoredUser())
  const isLoggedIn = computed(() => !!getToken() && !!user.value)
  const loginError = ref('')
  const loginLoading = ref(false)

  async function login(username: string, password: string): Promise<boolean> {
    loginLoading.value = true
    loginError.value = ''
    try {
      const res = await adminApi.login({ username, password })
      setToken(res.token)
      setStoredUser(res.user)
      user.value = res.user
      return true
    } catch (e) {
      if (e instanceof ApiError) {
        loginError.value = e.message
      } else {
        loginError.value = '登录失败，请检查网络连接'
      }
      return false
    } finally {
      loginLoading.value = false
    }
  }

  async function logout() {
    try {
      await adminApi.logout()
    } catch {
      // Ignore logout errors
    }
    clearToken()
    user.value = null
  }

  async function fetchMe(): Promise<boolean> {
    try {
      const u = await adminApi.getMe()
      user.value = u
      setStoredUser(u)
      return true
    } catch {
      clearToken()
      user.value = null
      return false
    }
  }

  return { user, isLoggedIn, loginError, loginLoading, login, logout, fetchMe }
})
