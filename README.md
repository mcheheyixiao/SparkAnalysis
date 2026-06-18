# Spark AI Analyzer

为 Minecraft 服主提供 spark 性能报告 AI 分析平台。用户粘贴 `https://spark.lucko.me/{code}` 链接，后端自动抓取 spark 报告数据，前端展示中文诊断报告。

## 技术栈

### 后端

| 层 | 选型 | 版本 |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript (strict) | 5.8 |
| Framework | Fastify | 5.x |
| Database | MySQL + Prisma | MySQL 8, Prisma 6.x |
| Auth | JWT HS256 + bcrypt | — |
| AI | DeepSeek API (OpenAI-compatible) | — |
| HTTP Client | undici | 7.x |
| Logger | pino | 9.x |
| Validation | Zod | 3.x |
| Security | helmet, @fastify/cors, @fastify/rate-limit | — |
| Job Queue | 自实现 InMemoryJobQueue（可替换为 BullMQ） | — |

### 前端

| 层 | 选型 |
|---|---|
| Framework | Vue 3 |
| Build | Vite 6 |
| Language | TypeScript (strict) |
| Router | Vue Router 4 |
| State | Pinia |
| UI Library | Naive UI |
| HTTP | Axios |
| Markdown | markdown-it |

**明确不使用的技术（MVP 阶段）：** Spring Boot / Python / NestJS / Selenium / Playwright / BullMQ / Redis / RabbitMQ / React

## 功能特性

- **Spark 报告抓取** — 支持 `https://spark.lucko.me/{code}` 链接，自动识别 sampler / heap / health 报告类型
- **AI 智能诊断** — 调用 DeepSeek API 生成中文性能诊断报告，包含严重程度、证据链、疑似原因、修复方案、复测命令
- **规则预分析** — AI 分析前先进行 TPS/MSPT/线程/GC/关键词规则预分析，提升诊断质量
- **小白友好** — 输出包含通俗易懂的 "小白解释"，专业术语翻译为日常比喻
- **异步分析** — 提交后立即返回 reportId，后台任务异步执行，前端轮询获取结果
- **结果复用** — 同一 spark 链接在可配置 TTL 内返回已缓存结果，避免重复分析
- **JSON 修复降级** — AI 返回非法 JSON 时自动修复，修复失败则降级为基于规则分析的 markdown 报告
- **管理员后台** — JWT 认证、AI 配置管理、Prompt 模板管理、分析记录管理、系统日志查看
- **安全防护** — SSRF 防护、IP 哈希存储、API Key AES-256-GCM 加密、多层级限流、Helmet 安全头
- **优雅关闭** — SIGTERM/SIGINT 优雅关闭，等待进行中任务完成，超时标记失败

## 快速开始

### 环境要求

- Node.js 20 LTS
- MySQL 8.0+
- npm 10+

### 后端安装

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd spark-ai-analyzer-backend

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写数据库连接、JWT 密钥、加密密钥等

# 4. 生成 Prisma Client
npx prisma generate

# 5. 执行数据库迁移
npx prisma migrate deploy

# 6. 填充初始数据（默认管理员、系统设置、Prompt 模板）
npm run prisma:seed

> **⚠️ 重要：首次部署必须执行 `npm run prisma:seed`。**
> 该命令会初始化默认管理员账号、13 项系统设置和 Prompt 模板。
> 如果跳过此步骤，后台「系统设置」和「Prompt 模板」页面将为空，
> 前端会显示默认值但数据库中无对应记录，保存设置时可能出现异常。

# 7. 启动开发服务器
npm run dev
```

后端服务默认运行在 `http://localhost:3001`。

### 前端安装

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端开发服务器运行在 `http://localhost:5173`，自动代理 `/api` 到后端。

### 后端生产构建

```bash
npm run build
npm start
```

### 前端生产构建

```bash
cd frontend
npm run build
```

构建产物在 `frontend/dist/`。部署时将此目录作为 Nginx 的静态文件根目录。

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `NODE_ENV` | 是 | `production` | 运行环境：`development` / `production` |
| `PORT` | 是 | `3001` | 服务端口 |
| `DATABASE_URL` | 是 | — | MySQL 连接字符串 `mysql://user:password@host:3306/spark_ai_analyzer` |
| `JWT_SECRET` | 是 | — | JWT 签名密钥（HS256），生产环境请使用随机长字符串 |
| `JWT_EXPIRES_IN` | 否 | `7d` | JWT 过期时间 |
| `ENCRYPTION_KEY` | 是 | — | AES-256-GCM 加密密钥，32 字节的 base64 字符串 |
| `IP_HASH_SALT` | 是 | — | IP 哈希盐值，用于 SHA-256(clientIp + salt) |
| `CORS_ORIGIN` | 否 | — | CORS 允许的前端域名，如 `https://your-domain.com` |
| `DEFAULT_ADMIN_USERNAME` | 否 | `admin` | 默认管理员用户名（seed 时使用） |
| `DEFAULT_ADMIN_PASSWORD` | 否 | `change_me_now` | 默认管理员密码（seed 时使用），首次登录后请立即修改 |
| `LOG_LEVEL` | 否 | `info` | 日志级别：`debug` / `info` / `warn` / `error` |

> **注意：** `ENCRYPTION_KEY` 必须是 32 字节随机数据的 base64 编码。可使用以下命令生成：
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```
> **重要：** `JWT_SECRET` 和 `ENCRYPTION_KEY` 绝对不能使用 `.env.example` 中的默认值。`ENCRYPTION_KEY` 是 AES-256-GCM 使用的 32 bytes base64 key，不是普通字符串。

## API 文档

### 统一响应格式

**成功：**
```json
{ "success": true, "data": { ... }, "requestId": "uuid" }
```

**失败：**
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "人类可读描述", "requestId": "uuid" } }
```

### 公开接口

#### POST /api/public/analyze

提交 spark 报告进行分析。

```
Content-Type: application/json
Body: { "url": "https://spark.lucko.me/7twWCWSV0B" }
```

成功响应 (201):
```json
{
  "success": true,
  "data": {
    "reportId": "c8b2a1d3-1234-4567-8901-abcdef012345",
    "status": "pending",
    "sparkCode": "7twWCWSV0B",
    "reused": false
  }
}
```

复用已完成结果 (201):
```json
{
  "success": true,
  "data": {
    "reportId": "c8b2a1d3-1234-4567-8901-abcdef012345",
    "status": "completed",
    "sparkCode": "7twWCWSV0B",
    "reused": true,
    "reuseReason": "completed_recent"
  }
}
```

#### GET /api/public/reports/:id/status

轮询报告分析状态。

```json
{
  "success": true,
  "data": {
    "reportId": "c8b2a1d3-1234-4567-8901-abcdef012345",
    "status": "processing",
    "progress": 40,
    "stage": "normalizing",
    "message": "正在整理性能数据",
    "errorCode": null,
    "errorMessage": null
  }
}
```

**Stage 说明：**

| stage | progress | message |
|---|---|---|
| queued | 0 | 等待分析任务开始 |
| fetching_spark | 15 | 正在读取 spark 报告 |
| normalizing | 30 | 正在整理性能数据 |
| rule_analyzing | 45 | 正在进行规则预分析 |
| building_prompt | 60 | 正在构建 AI 分析上下文 |
| calling_ai | 80 | 正在调用 AI 生成诊断报告 |
| saving_result | 95 | 正在保存分析结果 |
| completed | 100 | 分析完成 |
| failed | — | 分析失败（见 errorCode） |

#### GET /api/public/reports/:id

获取完整分析报告。

**报告未完成时：**
```json
{
  "success": true,
  "data": {
    "reportId": "c8b2a1d3-...",
    "status": "processing",
    "progress": 60,
    "stage": "calling_ai",
    "message": "正在调用 AI 生成诊断报告"
  }
}
```

**报告完成时：**
```json
{
  "success": true,
  "data": {
    "reportId": "c8b2a1d3-...",
    "sparkCode": "7twWCWSV0B",
    "sparkUrl": "https://spark.lucko.me/7twWCWSV0B",
    "reportType": "sampler",
    "status": "completed",
    "severity": "medium",
    "summary": "服务器主线程 CPU 占用偏高，疑似区块加载和实体 AI 导致",
    "normalizedSummary": { /* 结构化摘要 */ },
    "ruleAnalysis": { /* 规则预分析结果 */ },
    "aiResult": {
      "one_sentence_summary": "主线程被区块加载和实体 AI 拖累...",
      "severity": "medium",
      "beginner_explanation": "你的服务器像一个人同时做太多事情...",
      "key_evidence": [
        { "title": "主线程 CPU 占比 78%", "explanation": "...", "confidence": "high" }
      ],
      "suspected_causes": [
        { "rank": 1, "name": "区块加载频繁", "category": "world", "reason": "...", "confidence": "high", "how_to_verify": "查看 /debug chunks" }
      ],
      "fix_plan": [
        { "priority": 1, "action": "降低 view-distance 到 6", "difficulty": "easy", "risk": "low", "expected_effect": "减少 30% 区块加载" }
      ],
      "retest_commands": ["/spark profiler start --timeout 300"],
      "missing_information": ["缺少完整调用树数据，建议使用 --full 参数重新采样"],
      "markdown_report": "# 性能诊断报告\n..."
    },
    "createdAt": "2026-06-17T12:00:00.000Z",
    "completedAt": "2026-06-17T12:00:30.000Z"
  }
}
```

**分析失败时：**
```json
{
  "success": true,
  "data": {
    "reportId": "c8b2a1d3-...",
    "status": "failed",
    "errorCode": "SPARK_FETCH_TIMEOUT",
    "errorMessage": "spark 数据抓取超时，请稍后重试",
    "createdAt": "2026-06-17T12:00:00.000Z"
  }
}
```

### 管理员认证接口

#### POST /api/admin/auth/login

```json
// Request
{ "username": "admin", "password": "your-password" }

// Response 200
{ "success": true, "data": { "token": "eyJhbG...", "user": { "id": "...", "username": "admin", "role": "superadmin" } } }
```

#### POST /api/admin/auth/logout

```json
// Response 200
{ "success": true, "data": { "message": "已退出登录" } }
```

#### GET /api/admin/auth/me

```json
// Header: Authorization: Bearer <token>
// Response 200
{ "success": true, "data": { "id": "...", "username": "admin", "role": "superadmin" } }
```

### 管理员 AI 配置接口

#### GET /api/admin/settings/ai

```json
// Response 200
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
    "enabled": true
  }
}
```

#### PUT /api/admin/settings/ai

更新 AI 配置。`apiKey` 使用 AES-256-GCM 加密存储，前端只返回 masked 版本。

```json
// Request
{
  "baseUrl": "https://api.deepseek.com/v1",
  "apiKey": "sk-your-api-key",
  "model": "deepseek-chat",
  "temperature": 0.3,
  "maxTokens": 4096,
  "timeoutMs": 60000,
  "enabled": true
}

// Response 200
{ "success": true, "data": { "message": "AI 配置已更新" } }
```

#### POST /api/admin/settings/ai/test

测试 AI 连接。

```json
// Response 200 (成功)
{ "success": true, "data": { "message": "AI 连接测试成功", "model": "deepseek-chat", "latencyMs": 1200 } }
```

### 管理员 Prompt 模板接口

#### GET /api/admin/prompts

查询参数: `?type=system&page=1&pageSize=20`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "...",
        "name": "Default System Prompt",
        "type": "system",
        "isDefault": true,
        "version": 1,
        "updatedAt": "2026-06-17T12:00:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 20
  }
}
```

#### POST /api/admin/prompts

```json
// Request
{
  "name": "My Custom Prompt",
  "type": "system",
  "content": "你是一个 Minecraft 性能分析专家...",
  "isDefault": false
}

// Response 201
{ "success": true, "data": { "id": "...", "name": "My Custom Prompt", ... } }
```

#### PUT /api/admin/prompts/:id

编辑指定模板（version 自动 +1）。

#### DELETE /api/admin/prompts/:id

删除模板（不允许删除唯一默认 system 模板）。

#### POST /api/admin/prompts/:id/set-default

设为默认（事务保证同 type 只有一个默认）。

### 管理员分析记录接口

#### GET /api/admin/reports

查询参数: `?status=completed&sparkCode=&severity=medium&reportType=sampler&createdFrom=&createdTo=&page=1&pageSize=20&sortBy=createdAt&sortOrder=desc`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "...",
        "sparkCode": "7twWCWSV0B",
        "sparkUrl": "https://spark.lucko.me/7twWCWSV0B",
        "reportType": "sampler",
        "status": "completed",
        "severity": "medium",
        "summary": "主线程 CPU 占用偏高...",
        "createdAt": "2026-06-17T12:00:00.000Z",
        "completedAt": "2026-06-17T12:00:30.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20
  }
}
```

#### GET /api/admin/reports/:id

获取报告详情（含 rawMetadataJson，如果 `saveRawSparkData` 开关已开启）。

#### DELETE /api/admin/reports/:id

删除报告（级联删除关联的 AnalysisResult）。

#### POST /api/admin/reports/cleanup

```json
// Request
{ "olderThanDays": 30, "dryRun": true }

// Response (dryRun=true 只返回预计数量)
{ "success": true, "data": { "matched": 12, "deleted": 0, "dryRun": true } }

// Response (dryRun=false 实际删除)
{ "success": true, "data": { "matched": 12, "deleted": 12, "dryRun": false } }
```

### 管理员系统设置接口

#### GET /api/admin/settings/system

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

#### PUT /api/admin/settings/system

合并更新（只更新传入的 key，不影响未传入的 key）。

### 队列状态 / 系统日志

#### GET /api/admin/queue/status

```json
{
  "success": true,
  "data": {
    "pending": 2,
    "processing": 1,
    "maxConcurrency": 2,
    "uptime": 3600,
    "lastJobStartedAt": "2026-06-17T12:00:00.000Z",
    "lastJobCompletedAt": "2026-06-17T12:00:30.000Z"
  }
}
```

#### GET /api/admin/logs

查询参数: `?level=error&module=spark-fetcher&page=1&pageSize=50`

### 错误码参考

| 错误码 | HTTP 状态码 | 说明 |
|---|---|---|
| `INVALID_SPARK_URL` | 400 | 非 spark.lucko.me 链接 |
| `SPARK_CODE_NOT_FOUND` | 400 | URL 中无法提取 code |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体超过限制 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超过限制 |
| `REPORT_NOT_FOUND` | 404 | reportId 不存在 |
| `INVALID_CREDENTIALS` | 401 | 管理员登录失败 |
| `ACCOUNT_DISABLED` | 403 | 管理员账号被禁用 |
| `UNAUTHORIZED` | 401 | 缺少或无效 JWT |
| `FORBIDDEN` | 403 | 权限不足 |
| `AI_NOT_CONFIGURED` | — (任务失败) | 未配置 API Key / 模型为空 |
| `SPARK_FETCH_TIMEOUT` | — (任务失败) | spark 抓取超时 |
| `SPARK_REPORT_NOT_FOUND` | — (任务失败) | spark code 无效 |
| `SPARK_RESPONSE_TOO_LARGE` | — (任务失败) | 响应内容超过上限 |
| `SPARK_RESPONSE_INVALID` | — (任务失败) | 无法解析 spark 响应 |
| `SPARK_REMOTE_ERROR` | — (任务失败) | spark 服务端 5xx 或网络错误 |
| `AI_TIMEOUT` | — (任务失败) | DeepSeek 调用超时 |
| `AI_ERROR` | — (任务失败) | DeepSeek 其他错误 |
| `SERVER_RESTARTED` | — (任务失败) | 服务器进程重启导致分析中断 |
| `SERVER_SHUTDOWN` | — (任务失败) | 服务器关闭导致分析中断 |
| `INTERNAL_ERROR` | 500 | 未分类内部错误 |

## 架构概述

### 请求流程图

```
用户提交 spark 链接
  → POST /api/public/analyze
  → BodyLimit (1KB, Fastify 路由级先拦截)
  → RateLimit
  → Zod
  → SparkUrlParser (校验 + 提取 code)
  → ReportService.findOrCreateReport (复用检查)
  → 创建 SparkReport (status: pending, stage: queued)
  → 任务入队 (InMemoryJobQueue)
  → 立即返回 { reportId, status: "pending", ... }

后台任务执行:
  → lockedAt = now(), status = processing
  → stage: fetching_spark  → SparkFetcher.fetchRawMetadata()
  → stage: normalizing      → SparkNormalizer.normalize()
  → stage: rule_analyzing   → SparkRuleAnalyzer.analyze()
  → stage: building_prompt  → PromptBuilder.build()
  → stage: calling_ai       → AiAnalysisService.analyze()
  → stage: saving_result    → 保存 AnalysisResult + status = completed
  → 失败 → status = failed + errorCode + errorMessage

前端轮询:
  → GET /api/public/reports/:id/status → { status, progress, stage, message }
  → 完成后 GET /api/public/reports/:id → 完整结果（不含 raw data）
```

### 目录结构

```
spark-ai-analyzer-backend/
├── prisma/
│   ├── schema.prisma          # 数据库模型（8 张表）
│   └── seed.ts                # 初始数据填充脚本
├── src/
│   ├── app.ts                 # Fastify 应用工厂
│   ├── server.ts              # 服务入口（启动、恢复、优雅关闭）
│   ├── config/
│   │   └── env.ts             # 环境变量配置
│   ├── plugins/
│   │   ├── prisma.ts          # Prisma Client 单例
│   │   ├── auth.ts            # JWT 认证插件
│   │   ├── error-handler.ts   # 统一错误处理
│   │   └── request-id.ts      # requestId 插件
│   ├── modules/
│   │   ├── public/
│   │   │   ├── public.routes.ts              # 公开 API 路由
│   │   │   └── public-rate-limit.service.ts  # 公开接口限流服务
│   │   ├── admin/
│   │   │   ├── admin.routes.ts               # 管理员 API 路由（reports/settings/prompts/queue/logs 子路由均在此文件）
│   │   │   └── admin-auth.service.ts         # 管理员认证服务
│   │   ├── spark/
│   │   │   ├── spark.types.ts                # Spark 数据类型
│   │   │   ├── spark-url.parser.ts           # URL 校验 + code 提取
│   │   │   ├── spark-fetcher.service.ts      # Spark 数据抓取
│   │   │   ├── spark-normalizer.service.ts   # 数据标准化
│   │   │   └── spark-rule-analyzer.service.ts # 规则预分析
│   │   ├── ai/
│   │   │   ├── ai.types.ts               # AI 相关类型
│   │   │   ├── ai-provider.interface.ts  # AI Provider 抽象接口
│   │   │   ├── deepseek-provider.ts      # DeepSeek Provider 实现
│   │   │   ├── prompt-builder.service.ts # Prompt 构建器
│   │   │   └── ai-analysis.service.ts    # AI 分析服务（调用+JSON修复+降级）
│   │   ├── reports/
│   │   │   └── report.service.ts         # 报告 CRUD 服务
│   │   ├── settings/
│   │   │   └── settings.service.ts       # 系统设置服务
│   │   ├── prompts/
│   │   │   └── prompt.service.ts         # Prompt 模板服务
│   │   ├── queue/
│   │   │   ├── queue.interface.ts        # IJobQueueService 抽象接口
│   │   │   ├── in-memory-queue.ts        # 进程内队列实现
│   │   │   └── analysis-pipeline.ts      # 分析流水线编排
│   │   └── logs/
│   │       └── log.service.ts            # 系统日志服务
│   └── utils/
│       ├── crypto.ts          # AES-256-GCM 加解密
│       ├── ip.ts              # IP 哈希
│       ├── json.ts            # JSON 安全解析 + AI JSON 修复
│       ├── errors.ts          # 错误码定义 + 分类
│       └── safe-fetch.ts      # SSRF 安全的 HTTP 封装
├── tests/                       # 测试文件
├── frontend/                    # Vue 3 前端项目
├── dist/                        # TypeScript 编译输出
├── .env.example                 # 环境变量模板
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

> **关于目录结构：** 路由层已做扁平化合并 — `reports`、`settings`、`prompts`、`queue`、`logs` 的路由均挂载在 `admin.routes.ts` 下（`/api/admin/...`），不再各自持有独立路由文件。`prisma/migrations/` 目录由 `npx prisma migrate dev` 在开发环境自动生成；生产环境直接用 `npx prisma migrate deploy` 同步迁移，无需手动管理 migrations 目录。

### 数据库模型

8 张表：

| 表名 | 说明 |
|---|---|
| `AdminUser` | 管理员用户（bcrypt 密码哈希） |
| `AiSetting` | AI 配置（API Key AES-256-GCM 加密） |
| `PromptTemplate` | Prompt 模板（system/user/json_schema/beginner/advanced） |
| `SystemSetting` | 系统设置键值对（13 个默认配置项） |
| `SparkReport` | 分析报告核心表（含进度、阶段、结果） |
| `AnalysisResult` | AI 分析结果（1:1 关联 SparkReport，级联删除） |
| `SystemLog` | 系统日志（脱敏后存储） |
| `AdminAuditLog` | 管理员操作审计日志 |

## 宝塔面板部署教程

### 1. 安装 Node.js 20

宝塔面板 → 软件商店 → 搜索 "Node.js 版本管理器" → 安装。

安装后进入 Node.js 版本管理器 → 安装 Node 20 LTS 版本 → 设置为命令行版本。

可以在终端验证：
```bash
node -v   # 应显示 v20.x.x
npm -v    # 应显示 10.x.x
```

### 2. 安装 MySQL 8

软件商店 → 搜索 "MySQL" → 安装 MySQL 8.0。

安装后：
- 点击 MySQL → 设置 → 修改 root 密码（如果还没设置）
- 记录下 root 密码，稍后配置 .env 时需要

### 3. 创建数据库

在宝塔面板 → 数据库 → 添加数据库：

- 数据库名：`spark_ai_analyzer`
- 用户名：`spark_ai_analyzer`（或自定义）
- 密码：生成或设置一个强密码
- 访问权限：`localhost`（仅本机访问）

点击 "提交" 创建。

记下数据库名、用户名、密码，稍后配置 `DATABASE_URL`。

### 4. 上传代码

方式一：宝塔面板 → 文件 → 进入 `/www/wwwroot/` → 新建目录 `spark-ai-analyzer-backend` → 上传项目文件。

方式二（推荐）：在服务器上使用 git clone：
```bash
cd /www/wwwroot/
git clone <your-repo-url> spark-ai-analyzer-backend
cd spark-ai-analyzer-backend
```

### 5. 配置 .env 文件

```bash
cp .env.example .env
nano .env  # 或用宝塔面板文件编辑器
```

编辑 `.env` 内容：
```env
NODE_ENV=production
PORT=3001

DATABASE_URL="mysql://spark_ai_analyzer:你的数据库密码@127.0.0.1:3306/spark_ai_analyzer"

JWT_SECRET="替换为随机长字符串"
JWT_EXPIRES_IN="7d"

ENCRYPTION_KEY="替换为32字节base64密钥"
IP_HASH_SALT="替换为随机盐值"

CORS_ORIGIN="https://你的前端域名.com"

DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_PASSWORD="替换为强密码"

LOG_LEVEL="info"
```

生成安全随机值：
```bash
# JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 字节 base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# IP_HASH_SALT
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. 安装依赖并初始化数据库

```bash
cd /www/wwwroot/spark-ai-analyzer-backend

# 安装依赖
npm install

# 生成 Prisma Client
npx prisma generate

# 执行数据库迁移
npx prisma migrate deploy

# 填充初始数据
npm run prisma:seed
```

也可以使用 `npx prisma db seed`（前提是 `package.json` 中 `prisma.seed` 已配置），但 Prisma 7+ 已标记该配置为 deprecated，推荐统一使用 `npm run prisma:seed`。

> **⚠️ 首次部署必须执行此步骤。** 该命令初始化默认管理员、系统设置和 Prompt 模板。
> 如果未执行，后台「系统设置」和「Prompt 模板」页面将为空。

如果 `prisma db seed` 报错，检查：
- `.env` 中 `DATABASE_URL` 是否正确
- 数据库用户是否有 CREATE/INSERT 权限
- 执行 `npx prisma migrate deploy` 是否成功

### 7. 编译并配置 PM2

```bash
# 编译 TypeScript
npm run build

# 全局安装 PM2（如果未安装）
npm install -g pm2
pm2 install pm2-logrotate
```

创建 PM2 配置文件 `ecosystem.config.js`（项目根目录）：

```javascript
module.exports = {
  apps: [{
    name: 'spark-ai-analyzer-backend',
    script: './dist/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    // 日志
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    // 自动重启
    max_memory_restart: '512M',
    // 优雅关闭
    kill_timeout: 35000,
    wait_ready: false,
  }]
}
```

> **重要：必须使用 fork mode, instances=1。** 进程内队列不支持多实例。

启动前创建日志目录并启动：
```bash
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 设置开机自启（按提示执行输出的命令）
```

常用 PM2 命令：
```bash
pm2 status             # 查看状态
pm2 logs spark-ai-analyzer-backend   # 查看日志
pm2 restart spark-ai-analyzer-backend  # 重启
pm2 stop spark-ai-analyzer-backend     # 停止
pm2 delete spark-ai-analyzer-backend   # 删除
```

### 8. 配置 Nginx 反向代理

宝塔面板 → 网站 → 选择你的站点 → 设置 → 配置文件 → 在 `server` 块中添加：

```nginx
# 前端静态文件
location / {
    root /www/wwwroot/spark-ai-analyzer-backend/frontend/dist;
    try_files $uri $uri/ /index.html;
}

# Spark AI Analyzer Backend API
location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
```

保存后 Nginx 会自动重载。

### 9. 验证部署

```bash
# 检查 PM2 状态
pm2 status

# 测试 API
curl http://127.0.0.1:3001/api/public/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://spark.lucko.me/7twWCWSV0B"}'

# 通过域名测试
curl https://你的域名.com/api/health
```

### 10. 首次登录后台

1. 访问你的前端 `https://你的域名.com/admin/login`
2. 使用 `.env` 中配置的 `DEFAULT_ADMIN_USERNAME` 和 `DEFAULT_ADMIN_PASSWORD` 登录
3. 进入 AI 设置 → 填写 DeepSeek API Key → 保存 → 点击测试连接
4. 确认连接成功后，系统即可正常使用

> **安全提醒：** 首次登录后请立即修改管理员密码，并在后台更新 `.env` 中的 `DEFAULT_ADMIN_PASSWORD` 为新的强密码（仅影响未来 seed 时的默认值）。

### 修改管理员密码

首次部署默认管理员来自：

- `DEFAULT_ADMIN_USERNAME`（默认 `admin`）
- `DEFAULT_ADMIN_PASSWORD`（默认 `change_me_now`）

**注意：** 这些变量只在首次 `npm run prisma:seed` 创建管理员时生效。管理员已存在后，修改 `.env` 并重新 seed 不会自动改密码（`upsert` 的 `update: {}` 为空）。

登录后台后可在右上角用户菜单 → **修改密码** 中修改密码。修改成功后会自动退出登录，需要使用新密码重新登录。

### 管理后台入口

出于安全和简洁考虑，首页不展示"管理后台"按钮。请通过直链访问：

- **开发环境：** `http://localhost:5173/admin`
- **生产环境：** `https://你的域名/admin`

未登录时会自动跳转到 `/admin/login?redirect=/admin`，登录后进入后台仪表盘。

后台「系统设置 → 数据存储」提供"清理过期分析数据"按钮。该按钮会先预检查可清理数量，管理员确认后才会删除。清理范围仅限过期分析报告及其关联分析结果，不会删除系统设置、Prompt 模板、AI 配置或管理员账号。

## 扩展指南

### 如何添加完整数据解析（?full=true）

系统已实现基础 full data 抓取和合并逻辑：

- 当 spark 报告类型为 `sampler` 或 `unknown` 时，分析流水线会自动尝试抓取 `?raw=1&full=true` 完整数据。
- full data 抓取失败不会中断整个分析，会降级为仅使用 raw metadata 继续分析。
- 合并后的数据优先使用 full data 的类型识别、线程和来源信息。

如需进一步扩展完整调用树（protobuf/flamegraph）解析逻辑，可在 `src/modules/spark/spark-normalizer.service.ts` 中添加更多提取路径。

**注意流量控制：** full data 可能达到数十 MB，务必通过 `sparkFullMaxBytes` 系统设置配置合理上限（默认 30MB）。

### spark 报告数据不足说明

如果分析报告显示"报告数据解析不足，无法确认是否存在性能问题"或"数据不足"，可能的原因：

1. **后端提取问题：** spark 远端的 raw JSON 结构与后端解析路径不匹配，导致无法提取 TPS/MSPT/线程数据。可在后台分析记录中查看 `rawMetadataJson` / `normalizedJson` 字段，检查后端抓到的原始数据格式。
2. **报告类型不匹配：** spark 链接对应的报告可能不是 health 或 sampler/profiler 类型（如 heap dump），后者缺乏性能指标数据。
3. **报告本身无数据：** spark 远端的报告可能在采集时失败或数据为空。

排查步骤：
- 登录后台 → 分析记录 → 查看对应报告的 `rawMetadataJson`，确认 spark 远端确实返回了有效数据。
- 查看 `normalizedJson` 中的 `debug.rawTopLevelKeys` 和 `debug.extractionHints` 字段，了解后端解析到的顶层字段和提取提示。
- 如果 `debug.fullTopLevelKeys` 存在，说明系统已尝试抓取 full data。
- 若 spark 远端报告本身缺失 sampler/health 数据，需重新采集 spark health 或 profiler 报告。

### 如何将队列替换为 BullMQ

MVP 使用进程内 `InMemoryJobQueueService`，可通过以下步骤无痛替换为 BullMQ：

1. **安装依赖：**
   ```bash
   npm install bullmq ioredis
   ```

2. **创建 BullMQ 实现 —** 新建 `src/modules/queue/bullmq-queue.ts`，实现 `IJobQueueService` 接口：
   ```typescript
   import { Queue, Worker, Job } from 'bullmq'
   import { IJobQueueService, IAnalysisJob, IQueueStats } from './queue.interface.js'

   export class BullMqJobQueueService implements IJobQueueService {
     private queue: Queue
     private worker: Worker

     constructor(redisConnection: { host: string; port: number }, maxConcurrency: number) {
       this.queue = new Queue('spark-analysis', { connection: redisConnection })
       // Worker 实现分析流水线
     }

     async enqueue(job: IAnalysisJob): Promise<void> { /* ... */ }
     getStats(): IQueueStats { /* ... */ }
     async shutdown(): Promise<void> { /* ... */ }
   }
   ```

3. **切换实现 —** 修改 `src/server.ts`，将 `new InMemoryJobQueueService(...)` 替换为 `new BullMqJobQueueService(...)`。

4. **可选：启用多实例 —** BullMQ 天然支持多 worker，可将 PM2 instances 调整为 >1（需同时改用 Redis 存储 session/token）。

接口是抽象的，只需实现 `IJobQueueService` 的三个方法，其余代码无需改动。

### 如何添加新的 AI Provider

系统已内置 `IAiProvider` 接口，添加新 Provider（如 OpenAI、Claude）只需：

1. **新建 Provider 文件 —** `src/modules/ai/openai-provider.ts`：
   ```typescript
   import { IAiProvider, AiChatMessage, AiChatResponse } from './ai-provider.interface.js'

   export class OpenAiProvider implements IAiProvider {
     readonly name = 'openai'

     async chatCompletion(config: {
       baseUrl: string
       apiKey: string
       model: string
       messages: AiChatMessage[]
       temperature: number
       maxTokens: number
       timeoutMs: number
     }): Promise<AiChatResponse> {
       // 实现 OpenAI 兼容 API 调用
     }
   }
   ```

2. **注册到 factory —** 在 `src/modules/ai/ai-analysis.service.ts` 的 Provider 工厂中添加：
   ```typescript
   import { OpenAiProvider } from './openai-provider.js'

   const providers: Record<string, IAiProvider> = {
     deepseek: new DeepSeekProvider(),
     openai: new OpenAiProvider(),
     // 更多 Provider...
   }
   ```

3. **更新 AiSetting —** 在管理后台将 `provider` 字段设置为 `openai`，填写对应的 `baseUrl` 和 `apiKey`。

所有 OpenAI-compatible API（DeepSeek、OpenAI、通义千问、智谱 GLM 等）都可复用相同的调用格式。

## 安全注意事项

本项目实施了多层安全防护：

| 层级 | 措施 |
|---|---|
| **传输层** | Helmet 安全头 + HTTPS only |
| **跨域** | `@fastify/cors`，仅白名单域名 |
| **限流-公开** | 单 IP 每分钟 5 次 / 每日 30 次 |
| **限流-登录** | 同 IP 每 15 分钟最多 10 次 |
| **请求体** | 全局 1MB，analyze 路由 1KB |
| **SSRF** | SparkUrlParser 白名单校验 + 后端重构造 URL + safe-fetch redirect manual |
| **认证** | JWT HS256 + bcrypt 密码哈希 |
| **API Key** | AES-256-GCM 加密 + 日志脱敏 + 前端 masked 显示 |
| **IP 隐私** | SHA-256(ip + salt) 哈希存储 |
| **Prompt 防注入** | spark 数据作为数据不作为指令 |
| **错误信息** | 统一错误码 + 不暴露 stack trace + 不暴露 API 细节 |
| **JSON** | 用户不可上传 JSON |
| **原始数据** | 默认不保存 raw spark 数据 |
| **审计日志** | 管理员所有操作记录 AdminAuditLog |

### 生产环境检查清单

- [ ] 修改 `JWT_SECRET` 为随机 64 字符以上
- [ ] 修改 `ENCRYPTION_KEY` 为随机 32 字节 base64
- [ ] 修改 `IP_HASH_SALT` 为随机值
- [ ] 修改 `DEFAULT_ADMIN_PASSWORD` 为强密码
- [ ] 首次登录后立即修改管理员密码
- [ ] 设置 `CORS_ORIGIN` 为实际前端域名
- [ ] 配置 Nginx HTTPS（Let's Encrypt 免费证书）
- [ ] 配置 MySQL 防火墙仅允许 127.0.0.1 连接
- [ ] 配置 PM2 日志轮转（pm2-logrotate）
- [ ] 定期检查 `/api/admin/logs` 错误日志
- [ ] 设置 `autoCleanupDays` 合理值（建议 30 天）
- [ ] 配置服务器防火墙仅开放 80/443 端口
