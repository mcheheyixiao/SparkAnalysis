export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  const now = Date.now()
  const diff = now - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 30) return `${days} 天前`
  return formatDate(date)
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB'
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB'
  if (bytes >= 1_024) return (bytes / 1_024).toFixed(1) + ' KB'
  return bytes + ' B'
}

export function formatDuration(ms: number): string {
  if (ms >= 60000) {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's'
  return ms + 'ms'
}

export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_SPARK_URL: '请输入有效的 spark.lucko.me 链接',
  SPARK_CODE_NOT_FOUND: '没有从链接中识别到 spark 报告编号',
  RATE_LIMIT_EXCEEDED: '请求过于频繁，请稍后再试',
  REPORT_NOT_FOUND: '没有找到这份分析报告',
  AI_NOT_CONFIGURED: '管理员尚未配置 AI 接口',
  SPARK_FETCH_TIMEOUT: '读取 spark 报告超时，请稍后重试',
  SPARK_REPORT_NOT_FOUND: 'spark 报告不存在或已过期',
  SPARK_RESPONSE_TOO_LARGE: 'spark 报告数据过大，暂时无法分析',
  SPARK_RESPONSE_INVALID: 'spark 报告数据格式异常',
  SPARK_REMOTE_ERROR: 'spark 服务暂时不可用',
  AI_TIMEOUT: 'AI 分析超时，请稍后重试',
  AI_ERROR: 'AI 服务暂时不可用',
  SERVER_RESTARTED: '服务器重启导致本次分析中断，请重新提交',
  SERVER_SHUTDOWN: '服务器关闭导致本次分析中断，请重新提交',
  INVALID_CREDENTIALS: '用户名或密码错误',
  ACCOUNT_DISABLED: '账号已禁用',
  UNAUTHORIZED: '登录状态已过期，请重新登录',
  FORBIDDEN: '权限不足',
  VALIDATION_ERROR: '提交内容格式不正确',
  INVALID_ADMIN_INPUT: '后台表单参数无效',
  INVALID_SETTINGS_INPUT: '系统设置参数无效',
  INVALID_SETTINGS_KEY: '系统设置参数无效',
  INVALID_PROMPT_INPUT: 'Prompt 模板参数无效',
  INVALID_REPORT_QUERY: '清理参数无效',
  INTERNAL_ERROR: '服务器内部错误，请稍后再试',
  NETWORK_ERROR: '网络异常，请稍后重试',
  PAYLOAD_TOO_LARGE: '请求体过大',
}

export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || `未知错误 (${code})`
}

export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    normal: '#10B981',
    low: '#38BDF8',
    medium: '#F59E0B',
    high: '#F97316',
    critical: '#EF4444',
  }
  return map[severity] || '#9CA3AF'
}

export function severityLabel(severity?: string | null): string {
  if (!severity) return '—'
  const map: Record<string, string> = {
    normal: '正常',
    low: '轻微',
    medium: '中等',
    high: '较高',
    critical: '严重',
  }
  return map[severity] || severity
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '分析中',
    completed: '已完成',
    failed: '失败',
  }
  return map[status] || status
}

export function reportTypeLabel(type: string): string {
  const map: Record<string, string> = {
    sampler: '采样器',
    heap: '堆内存',
    health: '健康报告',
    unknown: '未知类型',
  }
  return map[type] || type
}
