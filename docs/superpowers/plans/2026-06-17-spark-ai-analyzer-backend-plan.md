# Spark AI Analyzer Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Minecraft spark report AI analysis backend with Fastify + TypeScript + Prisma + MySQL + DeepSeek API.

**Architecture:** Fastify HTTP server with modular plugin architecture. Public routes for spark URL submission and report retrieval. Admin routes behind JWT auth for settings/prompts/report management. In-process async job queue for spark fetch → normalize → rule analysis → AI analysis pipeline. All external requests routed through SSRF-safe fetch wrapper.

**Tech Stack:** Node.js 20, TypeScript (strict), Fastify, Prisma + MySQL 8, JWT HS256 + bcrypt, DeepSeek API (OpenAI-compatible), undici, pino, Zod, helmet, @fastify/cors, @fastify/rate-limit

**Spec:** `docs/superpowers/specs/2026-06-17-spark-ai-analyzer-backend-design.md`

---

## File Structure

```
spark-ai-analyzer-backend/
├── prisma/
│   ├── schema.prisma          — All 8 database models
│   └── seed.ts                — Default admin, settings, prompts
├── src/
│   ├── app.ts                 — Fastify app assembly (plugins + routes)
│   ├── server.ts              — Startup: DB connect, queue init, crash recovery, graceful shutdown
│   ├── config/
│   │   ├── env.ts             — Env var loading + Zod validation
│   │   └── security.ts        — CORS origins, rate limit configs, helmet config
│   ├── plugins/
│   │   ├── prisma.ts          — PrismaClient singleton, fastify.decorate('prisma')
│   │   ├── auth.ts            — JWT verification onRequest hook, fastify.decorate('authenticate')
│   │   ├── rate-limit.ts      — Tiered rate limiting (public strict, admin login strict)
│   │   ├── error-handler.ts   — Global error handler: AppError → uniform JSON response
│   │   └── request-id.ts      — Generate requestId per request, attach to reply headers
│   ├── modules/
│   │   ├── public/
│   │   │   └── public.routes.ts
│   │   ├── admin/
│   │   │   ├── admin.routes.ts
│   │   │   └── admin-auth.service.ts
│   │   ├── spark/
│   │   │   ├── spark.types.ts
│   │   │   ├── spark-url.parser.ts
│   │   │   ├── spark-fetcher.service.ts
│   │   │   ├── spark-normalizer.service.ts
│   │   │   └── spark-rule-analyzer.service.ts
│   │   ├── ai/
│   │   │   ├── ai.types.ts
│   │   │   ├── ai-provider.interface.ts
│   │   │   ├── deepseek-provider.ts
│   │   │   ├── prompt-builder.service.ts
│   │   │   └── ai-analysis.service.ts
│   │   ├── reports/
│   │   │   ├── report.service.ts
│   │   │   └── report.routes.ts
│   │   ├── settings/
│   │   │   ├── settings.service.ts
│   │   │   └── settings.routes.ts
│   │   ├── prompts/
│   │   │   ├── prompt.service.ts
│   │   │   └── prompt.routes.ts
│   │   ├── queue/
│   │   │   ├── queue.interface.ts
│   │   │   ├── in-memory-queue.ts
│   │   │   ├── analysis-pipeline.ts
│   │   │   └── queue.routes.ts
│   │   └── logs/
│   │       ├── log.service.ts
│   │       └── log.routes.ts
│   └── utils/
│       ├── crypto.ts
│       ├── ip.ts
│       ├── json.ts
│       ├── errors.ts
│       └── safe-fetch.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---
