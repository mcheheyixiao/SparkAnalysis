import axios, { type AxiosInstance, type AxiosError } from 'axios'
import { getToken, clearToken } from '@/utils/storage'
import type { ApiResponse } from './types'

export class ApiError extends Error {
  code: string
  requestId?: string

  constructor(code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.requestId = requestId
  }
}

const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor — attach token
http.interceptors.request.use(
  (config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor — unwrap unified format
http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse
    if (body.success === false) {
      const err = body.error!
      if (err.code === 'UNAUTHORIZED') {
        clearToken()
        if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
          window.location.href = '/admin/login'
        }
      }
      throw new ApiError(err.code, err.message, err.requestId)
    }
    return response
  },
  (error: AxiosError<ApiResponse>) => {
    if (error.response?.status === 401) {
      clearToken()
      if (window.location.pathname.startsWith('/admin') && window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login'
      }
    }
    if (error.response?.data?.error) {
      const err = error.response.data.error
      throw new ApiError(err.code, err.message, err.requestId)
    }
    if (error.response?.status === 429) {
      throw new ApiError('RATE_LIMIT_EXCEEDED', '请求过于频繁，请稍后再试')
    }
    throw new ApiError('NETWORK_ERROR', error.message || '网络连接失败')
  },
)

export default http
