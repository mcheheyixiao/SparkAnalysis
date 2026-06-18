# Spark AI Analyzer Frontend

面向 Minecraft 服主小白用户的 Spark 性能报告 AI 分析平台前端。

## 技术栈

| 层 | 选型 |
|---|---|
| Framework | Vue 3 |
| Build | Vite 6 |
| Language | TypeScript (strict) |
| Router | Vue Router 4 |
| State | Pinia |
| UI | Naive UI |
| HTTP | Axios |
| Markdown | markdown-it |
| Icons | Naive UI 内置 + 内联 SVG |

## 快速开始

### 环境要求

- Node.js 20 LTS
- npm 10+

### 安装

```bash
cd frontend
npm install
```

### 开发

```bash
npm run dev
```

开发服务器运行在 `http://localhost:5173`，自动代理 `/api` 到 `http://localhost:3001`。

### 生产构建

```bash
npm run typecheck
npm run build
```

构建产物在 `dist/` 目录。

## 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | 后端 API 地址 |

开发环境通过 Vite proxy 转发。生产环境通过 Nginx 反向代理。

## 目录结构

```
frontend/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── .env.example
├── src/
│   ├── main.ts              # 应用入口
│   ├── App.vue              # 根组件
│   ├── router/index.ts      # 路由配置
│   ├── api/
│   │   ├── http.ts          # Axios 实例 + 拦截器
│   │   ├── types.ts         # TypeScript 类型
│   │   ├── public-api.ts    # 公开 API
│   │   └── admin-api.ts     # 管理员 API
│   ├── stores/
│   │   ├── auth.store.ts    # 认证状态
│   │   └── report.store.ts  # 报告缓存
│   ├── layouts/
│   │   ├── PublicLayout.vue # 用户端布局
│   │   └── AdminLayout.vue  # 管理端布局
│   ├── pages/               # 页面组件
│   ├── components/          # 可复用组件
│   ├── styles/
│   │   ├── variables.css    # CSS 变量
│   │   ├── global.css       # 全局样式
│   │   └── theme.ts         # Naive UI 主题
│   └── utils/
│       ├── format.ts        # 格式化 + 错误映射
│       ├── polling.ts       # 轮询工具
│       └── storage.ts       # Token 存储
└── dist/                    # 构建产物
```

## 页面路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | HomePage | 首页，提交 spark 链接 |
| `/analyze/:reportId` | AnalyzePage | 分析进度页，轮询状态 |
| `/report/:reportId` | ReportPage | 报告详情页 |
| `/admin/login` | LoginPage | 管理员登录 |
| `/admin` | DashboardPage | 仪表盘 |
| `/admin/settings/ai` | AiSettingsPage | AI 配置 |
| `/admin/settings/system` | SystemSettingsPage | 系统设置 |
| `/admin/prompts` | PromptTemplatesPage | Prompt 模板 |
| `/admin/reports` | ReportsPage | 分析记录列表 |
| `/admin/reports/:id` | ReportDetailPage | 记录详情 |
| `/admin/logs` | LogsPage | 系统日志 |

## Nginx 部署配置

```nginx
# 前端静态文件
location / {
    root /www/wwwroot/spark-ai-analyzer-backend/frontend/dist;
    try_files $uri $uri/ /index.html;
}

# API 反向代理
location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
```

## 设计原则

- 浅色、简洁、小白友好
- 面向 Minecraft 服主，避免技术黑话
- 移动端适配 (375px+)
- 专业但不吓人的视觉风格
- 基于 `docs/api.md` 契约开发
