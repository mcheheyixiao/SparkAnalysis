# Spark AI Analyzer Backend — API 契约文档

> 本文档面向**前端开发者**，描述所有与后端交互的 API 接口。  
> 后端不提供 JSON 上传、不暴露 raw spark data、不返回 API Key 明文。

---

## 1. Base URL

```
开发: http://localhost:3001
生产: https://<你的域名>
```

所有接口路径均以 `/api/` 开头。

---

## 2. 统一响应格式

### 成功响应

```json
{
  "success": true,
  "data": { ... },
  "requestId": "uuid-v4"   // 仅部分接口包含
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的中文错误信息",
    "requestId": "uuid-v4"  // 如有
  }
}
```

---

## 3. 错误码一览

| 错误码 | HTTP 状态 | 说明 |
|---|---|---|
| `INVALID_SPARK_URL` | 400 | spark 链接格式无效 |
| `SPARK_CODE_NOT_FOUND` | 400 | 链接中无法提取 spark 报告 ID |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体过大 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率过高（业务限流或全局限流） |
| `REPORT_NOT_FOUND` | 404 | 分析报告不存在 |
| `INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `ACCOUNT_DISABLED` | 403 | 账号已被禁用 |
| `UNAUTHORIZED` | 401 | 未登录或 token 已过期 |
| `FORBIDDEN` | 403 | 无权限 |
| `INVALID_SETTINGS_KEY` | 400 | 系统设置中包含不支持的 key |
| `VALIDATION_ERROR` | 400 | 通用请求参数验证失败 |
| `INVALID_ADMIN_INPUT` | 400 | 管理员后台参数校验失败 |
| `INVALID_SETTINGS_INPUT` | 400 | 系统设置参数类型或范围无效 |
| `INVALID_PROMPT_INPUT` | 400 | Prompt 模板参数无效 |
| `INVALID_REPORT_QUERY` | 400 | 报告查询/清理参数无效 |
| `AI_NOT_CONFIGURED` | 500 | AI 服务未配置或未启用 |
| `SPARK_FETCH_TIMEOUT` | 502 | 抓取 spark 数据超时 |
| `SPARK_REPORT_NOT_FOUND` | 502 | spark 报告不存在（远端 404） |
| `SPARK_RESPONSE_TOO_LARGE` | 502 | spark 返回数据超过大小限制 |
| `SPARK_RESPONSE_INVALID` | 502 | spark 返回数据无法解析 |
| `SPARK_REMOTE_ERROR` | 502 | spark 服务不可用 |
| `AI_TIMEOUT` | 502 | AI 分析超时 |
| `AI_ERROR` | 502 | AI 服务错误 |
| `SERVER_RESTARTED` | 500 | 服务器重启导致分析中断 |
| `SERVER_SHUTDOWN` | 500 | 服务器关闭导致分析中断 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

> **注意：** `INVALID_SPARK_URL` 仅用于 spark 链接格式错误（public analyze 接口和 SparkUrlParser 内部），不用于管理员后台表单校验。管理员接口校验失败应返回 `VALIDATION_ERROR`、`INVALID_ADMIN_INPUT`、`INVALID_SETTINGS_INPUT`、`INVALID_PROMPT_INPUT` 或 `INVALID_REPORT_QUERY`。

### saveAiResult 行为说明

当管理员在系统设置中关闭 `saveAiResult`（设为 `false`）时：

- **不保存** 完整的 AI 结构化 JSON（`aiResultJson` 为 `null`）
- **仍保存** `markdownReport`、`severity`、`summary`、`isFallback`、`model` 等基础字段
- 前端可通过 `markdownReport` 和 `summary` 展示报告，应优雅降级处理 `aiResult` 为 `null` 的情况

### AI 输出报告生成策略（重要）

- **AI 输出以结构化 JSON 为主**：AI 只需输出简洁的 JSON 字段，`markdown_report` 字段不超过 1200 个中文字符
- **最终 Markdown 报告由后端生成**：后端 `markdown-report.builder` 根据 AI 结构化字段构建完整可读的 Markdown 报告
- **JSON 解析失败时**：后端使用规则预分析生成干净的兜底报告，**绝不**将原始 AI 输出拼接或暴露给普通用户
- **前端展示优先级**：优先使用 `markdownReport` 字段（后端已生成）；其次使用 `aiResult.markdown_report`（仅当不像是 JSON 时）
- **普通用户页面永不展示原始 AI JSON**：所有返回内容均经过后端 `normalizeMarkdownReport()` 处理和清理

### fallback 报告说明

当 `isFallback: true` 时：
- AI 结构化输出解析失败，系统已使用规则预分析生成可读报告
- `markdownReport` 包含完整的中文兜底诊断内容
- 前端应显示友好提示："本报告使用规则兜底分析生成"
- 建议用户重新分析或联系管理员检查 AI 配置

---

## 4. 普通用户接口

### 4.1 POST /api/public/analyze

提交 spark 链接进行分析。

- **Auth:** 不需要
- **Body Limit:** 1KB
- **限流:** 5次/分钟 + 30次/天（可通过后台调整）

**Request Body:**

```json
{
  "url": "https://spark.lucko.me/abc123XYZ"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "data": {
    "reportId": "uuid",
    "status": "pending",
    "sparkCode": "abc123XYZ",
    "reused": false,
    "reuseReason": null
  }
}
```

`reused` 为 `true` 时表示返回了已有的分析结果，不会重新分析。

**Error Response (429) — 超过频率限制:**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后再试"
  }
}
```

**Error Response (429) — 超过每日限制:**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "今日分析次数已达上限，请明天再试"
  }
}
```

**Notes:**
- URL 必须是 `https://spark.lucko.me/{code}` 格式
- 不支持 HTTP、自定义端口、用户名密码、子路径
- 成功后应立即跳转到进度页，轮询 `/api/public/reports/:id/status`

---

### 4.2 GET /api/public/reports/:id/status

轮询分析进度。

- **Auth:** 不需要

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "reportId": "uuid",
    "status": "processing",
    "progress": 45,
    "stage": "rule_analyzing",
    "message": "正在进行规则预分析"
  }
}
```

**status 可能的值:** `pending` | `processing` | `completed` | `failed`

**stage → message 映射** (前端可直接展示 `message`):

| stage | message |
|---|---|
| `queued` | 等待分析任务开始 |
| `fetching_spark` | 正在读取 spark 报告 |
| `normalizing` | 正在整理性能数据 |
| `rule_analyzing` | 正在进行规则预分析 |
| `building_prompt` | 正在构建 AI 分析上下文 |
| `calling_ai` | 正在调用 AI 生成诊断报告 |
| `saving_result` | 正在保存分析结果 |
| `completed` | 分析完成 |
| `failed` | 分析失败 |

**Error Response (404):**

```json
{
  "success": false,
  "error": {
    "code": "REPORT_NOT_FOUND",
    "message": "报告不存在"
  }
}
```

**Notes:**
- 前端应每 1-3 秒轮询一次
- `status` 变为 `completed` 后跳转到详情页
- `status` 变为 `failed` 后展示错误信息

---

### 4.3 GET /api/public/reports/:id

获取分析报告详情。

- **Auth:** 不需要

**Response (200) — 进行中 (pending/processing):**

```json
{
  "success": true,
  "data": {
    "reportId": "uuid",
    "status": "processing",
    "progress": 80,
    "stage": "calling_ai",
    "message": "正在调用 AI 生成诊断报告"
  }
}
```

**Response (200) — 失败:**

```json
{
  "success": true,
  "data": {
    "reportId": "uuid",
    "status": "failed",
    "errorCode": "SPARK_FETCH_TIMEOUT",
    "errorMessage": "spark 数据抓取超时，请稍后重试",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Response (200) — 完成:**

```json
{
  "success": true,
  "data": {
    "reportId": "uuid",
    "sparkCode": "abc123XYZ",
    "sparkUrl": "https://spark.lucko.me/abc123XYZ",
    "reportType": "sampler",
    "status": "completed",
    "severity": "high",
    "summary": "TPS 偏低；MSPT 过高",
    "markdownReport": "# 总结\n...",
    "isFallback": false,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "completedAt": "2025-01-01T00:01:00.000Z",
    "normalizedSummary": { ... },
    "ruleAnalysis": { ... },
    "aiResult": {
      "one_sentence_summary": "...",
      "severity": "high",
      "beginner_explanation": "...",
      "key_evidence": [...],
      "suspected_causes": [...],
      "fix_plan": [...],
      "retest_commands": [...],
      "missing_information": [...],
      "markdown_report": "..."
    }
  }
}
```

**Notes:**
- `GET /reports/:id` 在 `pending`/`processing` 时也返回 200，不会 404
- 前端可根据 `status` 字段判断展示进度页还是结果页
- 普通用户接口**不返回** `rawMetadataJson`、`errorDetailJson`、`clientIpHash`

---

## 5. 管理员认证接口

### 5.1 POST /api/admin/auth/login

管理员登录。

- **Auth:** 不需要
- **限流:** 同一 IP 15分钟内最多 10 次尝试

**Request Body:**

```json
{
  "username": "admin",
  "password": "your_password"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "username": "admin",
      "role": "superadmin"
    }
  }
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误"
  }
}
```

**Notes:**
- 前端将 `token` 存入 localStorage
- 后续请求在 `Authorization: Bearer <token>` header 中携带
- Token 过期时间默认 7 天

---

### 5.2 POST /api/admin/auth/logout

管理员登出。

- **Auth:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": { "success": true }
}
```

---

### 5.3 GET /api/admin/auth/me

获取当前登录管理员信息。

- **Auth:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "role": "superadmin",
      "lastLoginAt": "2025-01-01T00:00:00.000Z"
    }
  }
}
```

---

## 6. 管理员 AI 设置接口

### 6.1 GET /api/admin/settings/ai

获取 AI 服务配置。

- **Auth:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "provider": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "apiKeyMasked": "sk-****abcd",
    "temperature": 0.3,
    "maxTokens": 4096,
    "timeoutMs": 60000,
    "enabled": true,
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Notes:**
- `apiKeyMasked` 显示脱敏后的 API Key，例如 `sk-****abcd`
- 后端**永不会返回**完整的 API Key 明文

---

### 6.2 PUT /api/admin/settings/ai

更新 AI 服务配置（支持局部更新）。

- **Auth:** `Authorization: Bearer <token>`
- **Body Limit:** 64KB

**Request Body (完整):**

```json
{
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-your-api-key",
  "model": "deepseek-chat",
  "temperature": 0.3,
  "maxTokens": 4096,
  "timeoutMs": 60000,
  "enabled": true
}
```

**Request Body (局部更新):**

```json
{
  "apiKey": "sk-new-api-key"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "provider": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "model": "deepseek-chat",
    "apiKeyMasked": "sk-****wxyz",
    "temperature": 0.3,
    "maxTokens": 4096,
    "timeoutMs": 60000,
    "enabled": true,
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Validation:**
- `provider`: 最多 32 字符
- `baseUrl`: 最多 512 字符
- `apiKey`: 最多 512 字符
- `model`: 最多 128 字符
- `temperature`: 0–2
- `maxTokens`: 1–131072
- `timeoutMs`: 1000–300000
- `enabled`: boolean

**Notes:**
- 提交的是 `apiKey`（明文），后端加密后存入数据库
- 返回的永远是 `apiKeyMasked`（脱敏）

---

### 6.3 POST /api/admin/settings/ai/test

测试 AI 连接。

- **Auth:** `Authorization: Bearer <token>`

**Request Body (使用已保存配置 — 不需要传任何参数):**

```json
{}
```

**Request Body (使用临时配置测试):**

```json
{
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-temp-test-key",
  "model": "deepseek-chat"
}
```

**Response (200) — 成功:**

```json
{
  "success": true,
  "data": {
    "ok": true,
    "latencyMs": 1234,
    "model": "deepseek-chat",
    "responsePreview": "Hi there! How can I..."
  }
}
```

**Response (200) — 失败 (仍返回 200，通过 ok 字段区分):**

```json
{
  "success": true,
  "data": {
    "ok": false,
    "latencyMs": 5000,
    "error": "AI API Key 无效"
  }
}
```

**Notes:**
- 无论成功或失败都返回 200，通过 `data.ok` 判断
- 错误消息已脱敏，不会泄露 API Key

---

## 7. 管理员系统设置接口

### 7.1 GET /api/admin/settings/system

获取所有系统设置。

- **Auth:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "settings": {
      "saveRawSparkData": false,
      "saveNormalizedSummary": true,
      "saveAiResult": true,
      "autoCleanupDays": 30,
      "sparkFetchTimeoutMs": 10000,
      "sparkRawMaxBytes": 5242880,
      "sparkFullMaxBytes": 31457280,
      "aiTimeoutMs": 60000,
      "publicRateLimitPerMinute": 5,
      "publicRateLimitPerDay": 30,
      "maxConcurrency": 2,
      "reuseCompletedReport": true,
      "reuseReportTtlSeconds": 3600
    }
  }
}
```

---

### 7.2 PUT /api/admin/settings/system

更新系统设置（支持局部更新）。

- **Auth:** `Authorization: Bearer <token>`
- **Body Limit:** 64KB

**⚠️ 重要：请求体必须是 `{ "settings": { ... } }` 格式，直接传 key-value 会返回 400。**

**Request Body (完整):**

```json
{
  "settings": {
    "saveRawSparkData": false,
    "saveNormalizedSummary": true,
    "saveAiResult": true,
    "autoCleanupDays": 30,
    "sparkFetchTimeoutMs": 10000,
    "sparkRawMaxBytes": 5242880,
    "sparkFullMaxBytes": 31457280,
    "aiTimeoutMs": 60000,
    "publicRateLimitPerMinute": 5,
    "publicRateLimitPerDay": 30,
    "maxConcurrency": 2,
    "reuseCompletedReport": true,
    "reuseReportTtlSeconds": 3600
  }
}
```

**Request Body (局部更新):**

```json
{
  "settings": {
    "autoCleanupDays": 90
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "settings": {
      "saveRawSparkData": false,
      "autoCleanupDays": 90,
      "...": "..."
    }
  }
}
```

**Validation Rules:**

| 字段 | 类型 | 范围 |
|---|---|---|
| `saveRawSparkData` | boolean | — |
| `saveNormalizedSummary` | boolean | — |
| `saveAiResult` | boolean | — |
| `autoCleanupDays` | integer | 0–365 |
| `sparkFetchTimeoutMs` | integer | 1000–60000 |
| `sparkRawMaxBytes` | integer | 1024–10485760 |
| `sparkFullMaxBytes` | integer | 1048576–52428800 |
| `aiTimeoutMs` | integer | 5000–180000 |
| `publicRateLimitPerMinute` | integer | 1–100 |
| `publicRateLimitPerDay` | integer | 1–1000 |
| `maxConcurrency` | integer | 1–5 |
| `reuseCompletedReport` | boolean | — |
| `reuseReportTtlSeconds` | integer | 0–86400 |

**Error Response (400) — 未知 key:**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SETTINGS_KEY",
    "message": "未知的配置项: unknownSettingKey"
  }
}
```

---

## 8. Prompt 模板接口

### 8.1 GET /api/admin/prompts

获取 Prompt 模板列表。

- **Auth:** `Authorization: Bearer <token>`
- **Query:** `?type=system|user|json_schema|beginner|advanced` (可选)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "prompts": [
      {
        "id": "uuid",
        "name": "Default System Prompt",
        "type": "system",
        "content": "...",
        "isDefault": true,
        "version": 1,
        "createdAt": "...",
        "updatedAt": "..."
      }
    ]
  }
}
```

---

### 8.2 POST /api/admin/prompts

创建 Prompt 模板。

- **Auth:** `Authorization: Bearer <token>`
- **Body Limit:** 256KB

**Request Body:**

```json
{
  "name": "我的自定义提示词",
  "type": "system",
  "content": "你是 Minecraft 服务器性能分析专家..."
}
```

**type 可选值:** `system` | `user` | `json_schema` | `beginner` | `advanced`

**Response (201):**

```json
{
  "success": true,
  "data": {
    "prompt": {
      "id": "uuid",
      "name": "我的自定义提示词",
      "type": "system",
      "content": "...",
      "isDefault": false,
      "version": 1,
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}
```

---

### 8.3 GET /api/admin/prompts/:id

获取单个 Prompt 模板详情。

- **Auth:** `Authorization: Bearer <token>`

---

### 8.4 PUT /api/admin/prompts/:id

更新 Prompt 模板。

- **Auth:** `Authorization: Bearer <token>`
- **Body Limit:** 256KB

**Request Body (局部更新):**

```json
{
  "name": "新名称",
  "content": "新的提示词内容..."
}
```

版本号自动 +1。

---

### 8.5 DELETE /api/admin/prompts/:id

删除 Prompt 模板。

- **Auth:** `Authorization: Bearer <token>`

**注意:** 不允许删除唯一的默认系统提示词模板。

---

### 8.6 POST /api/admin/prompts/:id/set-default

设为默认模板（同类型的其他默认模板会被取消）。

- **Auth:** `Authorization: Bearer <token>`

---

## 9. 分析记录接口 (管理员)

### 9.1 GET /api/admin/reports

获取分析记录列表。

- **Auth:** `Authorization: Bearer <token>`
- **Query Params:**

| 参数 | 类型 | 说明 |
|---|---|---|
| `status` | string | 筛选状态: `pending`/`processing`/`completed`/`failed` |
| `sparkCode` | string | 按 sparkCode 搜索 |
| `severity` | string | 严重程度: `normal`/`low`/`medium`/`high`/`critical` |
| `reportType` | string | 报告类型: `sampler`/`heap`/`health`/`unknown` |
| `createdFrom` | string | 创建时间起始 (ISO 8601) |
| `createdTo` | string | 创建时间截止 (ISO 8601) |
| `page` | number | 页码 (默认 1) |
| `pageSize` | number | 每页条数 (默认 20) |
| `sortBy` | string | 排序字段 (默认 `createdAt`) |
| `sortOrder` | string | `asc` 或 `desc` (默认 `desc`) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "reports": [
      {
        "id": "uuid",
        "sparkCode": "abc123",
        "sparkUrl": "https://spark.lucko.me/abc123",
        "reportType": "sampler",
        "status": "completed",
        "progress": 100,
        "stage": "completed",
        "...": "...",
        "analysisResult": {
          "severity": "high",
          "summary": "...",
          "...": "..."
        }
      }
    ]
  }
}
```

---

### 9.2 GET /api/admin/reports/:id

获取单个分析报告详情（管理员视图，包含更多字段）。

- **Auth:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "report": {
      "id": "uuid",
      "sparkCode": "abc123",
      "sparkUrl": "https://spark.lucko.me/abc123",
      "reportType": "sampler",
      "status": "completed",
      "progress": 100,
      "stage": "completed",
      "platform": "Paper",
      "minecraftVersion": "1.21",
      "sparkVersion": "1.10.0",
      "serverBrand": "Purpur",
      "durationSeconds": 120,
      "errorCode": null,
      "errorMessage": null,
      "clientIpHash": "sha256hash...",
      "startedAt": "...",
      "completedAt": "...",
      "createdAt": "...",
      "expiresAt": "...",
      "rawMetadataJson": { ... },
      "normalizedJson": { ... },
      "ruleAnalysisJson": { ... },
      "analysisResult": {
        "severity": "high",
        "summary": "...",
        "aiResultJson": { ... },
        "markdownReport": "...",
        "isFallback": false,
        "model": "deepseek-chat",
        "inputTokens": 1500,
        "outputTokens": 800
      }
    }
  }
}
```

---

### 9.3 DELETE /api/admin/reports/:id

删除分析报告。

- **Auth:** `Authorization: Bearer <token>`

---

### 9.4 POST /api/admin/reports/cleanup

批量清理过期报告。

- **Auth:** `Authorization: Bearer <token>`

**Request Body (预检查):**

```json
{
  "olderThanDays": 30,
  "dryRun": true
}
```

**Response (dryRun=true — 只统计，不删除):**

```json
{
  "success": true,
  "data": {
    "matched": 12,
    "deleted": 0,
    "matchedAnalysisResults": 12,
    "deletedAnalysisResults": 0,
    "dryRun": true
  }
}
```

**Request Body (真实清理):**

```json
{
  "olderThanDays": 30,
  "dryRun": false
}
```

**Response (dryRun=false — 实际删除):**

```json
{
  "success": true,
  "data": {
    "matched": 12,
    "deleted": 12,
    "matchedAnalysisResults": 12,
    "deletedAnalysisResults": 12,
    "dryRun": false
  }
}
```

**说明：**
- `dryRun=true` 只统计，不删除。
- `dryRun=false` 才会执行删除。
- `pending` / `processing` 状态的报告不会被清理。
- `olderThanDays` 默认为 30 天。
- 删除 SparkReport 时会级联删除关联的 AnalysisResult。

---

## 10. 队列状态接口 (管理员)

### 10.1 GET /api/admin/queue/status

- **Auth:** `Authorization: Bearer <token>`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "pending": 3,
    "processing": 2,
    "maxConcurrency": 2,
    "uptime": 3600,
    "lastJobStartedAt": "2025-01-01T00:00:00.000Z",
    "lastJobCompletedAt": "2025-01-01T00:01:00.000Z"
  }
}
```

---

## 11. 日志接口 (管理员)

### 11.1 GET /api/admin/logs

- **Auth:** `Authorization: Bearer <token>`
- **Query Params:**

| 参数 | 类型 | 说明 |
|---|---|---|
| `level` | string | `debug`/`info`/`warn`/`error` |
| `module` | string | 模块名称 |
| `page` | number | 页码 (默认 1) |
| `pageSize` | number | 每页条数 (默认 50) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "total": 200,
    "page": 1,
    "pageSize": 50,
    "logs": [
      {
        "id": "uuid",
        "level": "info",
        "module": "pipeline",
        "message": "Analysis completed",
        "contextJson": "{...}",
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

## 12. 健康检查

### GET /api/health

无需认证。

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 3600
  }
}
```

---

## 13. 前端注意事项

### 安全

1. **不要直接请求 spark.lucko.me** — 所有 spark 数据由后端抓取，前端只需提交 spark URL
2. **不要在前端保存 DeepSeek API Key** — API Key 由管理员在后台设置，前端永不接触明文
3. **不要提供 JSON 上传入口** — 用户只输入 spark URL
4. **API Key 只显示 apiKeyMasked** — 后端返回脱敏后的 Key（如 `sk-****abcd`）
5. **错误信息不包含 stack trace** — 后端已做脱敏处理

### 业务流程

6. **POST /api/public/analyze 成功后立即跳转进度页** — 使用返回的 `reportId` 轮询状态
7. **轮询 /api/public/reports/:id/status** — 推荐间隔 1-3 秒
8. **completed 后请求 /api/public/reports/:id** — 获取完整分析结果
9. **failed 时展示 errorMessage** — 提示用户重新提交
10. **GET /reports/:id 在 pending/processing 时也返回 200** — 根据 `status` 字段判断显示进度或结果

### 接口格式

11. **PUT /api/admin/settings/system 请求体必须是 `{ "settings": { ... } }`** — 直接传 key-value 对象会被拒绝
12. **系统设置中 boolean 字段传 `true`/`false`，不要传字符串** — 如 `"saveRawSparkData": false`
13. **AI 设置提交使用 `apiKey` 字段（明文），返回使用 `apiKeyMasked` 字段（脱敏）**
14. **所有管理员接口（除 login）需要 `Authorization: Bearer <token>` header**
15. **用户接口不需要认证**

### 数据展示

16. **普通用户接口不返回 `rawMetadataJson`** — 仅管理员可见
17. **普通用户接口不返回 `clientIpHash`** — 仅管理员可见
18. **`severity` 可选值:** `normal` | `low` | `medium` | `high` | `critical`
19. **`reportType` 可选值:** `sampler` | `heap` | `health` | `unknown`
20. **`markdownReport` 字段（顶层）包含后端生成/修正的完整可读 Markdown 报告** — 前端优先展示此字段
20b. **`aiResult.markdown_report` 是 AI 原始输出** — 仅当 `markdownReport` 不存在且内容不像 JSON 时作为备选展示
20c. **`isFallback` 为 `true` 时表示使用规则兜底分析** — 前端应显示友好提示信息

### 限流

21. **公共 analyze 接口限流 5次/分钟 + 30次/天** — 可在后台调整
22. **超过限流返回 429 和 `RATE_LIMIT_EXCEEDED`** — 前端应展示友好提示

### 超时

23. **AI 分析可能需要 30-120 秒** — 进度页应显示当前 stage 和 message
24. **轮询超时建议 5 分钟后停止** — 展示"分析超时，请重新提交"

---

## 14. 变更记录

| 日期 | 变更 |
|---|---|
| 2025-06 | 初始版本 |
| 2025-06 | PUT /api/admin/settings/system 改为 `{ settings: {...} }` 格式 |
| 2025-06 | POST /api/public/analyze 增加业务限流 |
| 2025-06 | AI 运行时配置字段从 `apiKeyEncrypted` 改为 `apiKey`（仅内部） |
