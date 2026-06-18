# GSAP 动画美化设计 Spec

> 日期: 2026-06-18
> 主题: 为 Spark AI Analyzer 前端引入 GSAP 动画，提升界面体验
> 风格: 轻盈优雅 — 快速平滑淡入+上移，弹性缓动，不拖沓
> 范围: 仅 Public 页面（HomePage / AnalyzePage / ReportPage + 子组件），Admin 页面不加 GSAP

---

## 1. 技术栈与依赖

### 1.1 新增依赖

```json
{
  "dependencies": {
    "gsap": "^3.12.0"
  }
}
```

无其他新增。不需要 `@types/gsap`（GSAP 自带 types）。

### 1.2 文件结构

```
frontend/src/
├── plugins/
│   └── gsap.ts                 ← NEW  一次性注册 ScrollTrigger，导出 { gsap, ScrollTrigger }
├── composables/
│   └── useRevealAnimation.ts   ← NEW  挂载后 stagger 入场动画
├── styles/
│   └── animations.css          ← NEW  CSS 变量 + .reveal-item 初始态 + reduced-motion 全局覆盖
├── main.ts                     ← MOD  import '@/plugins/gsap' + import '@/styles/animations.css'
├── App.vue                     ← MOD  仅最外层 <transition name="page-fade" mode="out-in">
├── layouts/
│   └── PublicLayout.vue        ← MOD  保持纯布局，不加复杂动画
├── pages/
│   ├── HomePage.vue            ← MOD  不变（HeroAnalyzeCard 自行处理入场）
│   ├── AnalyzePage.vue         ← MOD  数据 ready 后 play() + nextTick → refresh
│   └── ReportPage.vue          ← MOD  各 section 滚动揭示 + 数据加载后 init() → refresh
└── components/public/
    ├── HeroAnalyzeCard.vue     ← MOD  stagger 入场动画（autoPlay: true）
    └── MetricCard.vue          ← MOD  数字递增动画

注:
- 不再有 useScrollReveal.ts, ScrollTrigger 相关逻辑合并到 useRevealAnimation.ts 中
  或内联到 ReportPage.vue（视复杂度决定；本 spec 采用内联方案，减少抽象层）。
  若未来 ScrollTrigger 使用场景变多，可再抽取 useScrollReveal composable。
- ReportPage.vue 在 pages/ 下，不在 components/public/ 下（修正上轮错误）。
```

---

## 2. 基础设施

### 2.1 `plugins/gsap.ts` — 一次性注册

```ts
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }
```

- **必须**在 `main.ts` 第一行 import：`import '@/plugins/gsap'`
- **禁止**在 App.vue 或其他组件的 lifecycle 里调用 `gsap.registerPlugin`
- 所有 composable / 组件通过 `import { gsap, ScrollTrigger } from '@/plugins/gsap'` 引入

### 2.2 `styles/animations.css` — CSS 变量与初始态

```css
/* ===== Animation Variables ===== */
:root {
  --anim-duration-fast: 0.28s;
  --anim-duration-base: 0.6s;
  --anim-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --reveal-distance: 18px;
}

/* ===== Unified Initial Hidden State ===== */
/* JS uses gsap.to() to animate from these to visible */
.reveal-item {
  opacity: 0;
  transform: translateY(var(--reveal-distance));
  will-change: opacity, transform;
}

.reveal-item-fade-only {
  opacity: 0;
}

.reveal-section {
  opacity: 0;
  transform: translateY(var(--reveal-distance));
  will-change: opacity, transform;
}

/* ===== App.vue Route Transition ===== */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

/* ===== Reduced Motion — Global Override ===== */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }

  .page-fade-enter-active,
  .page-fade-leave-active {
    transition: none !important;
  }
}
```

- **必须**在 `main.ts` 中全局引入：`import '@/styles/animations.css'`
- 使用 `transform` 而非 `translate` 属性（兼容性更稳）
- `will-change` 提示浏览器优化合成层
- `.reveal-item` — 标准入场：opacity + translateY 从隐藏到可见，用于 stagger 入场和 ScrollTrigger 揭示
- `.reveal-item-fade-only` — 仅 opacity 从 0 到 1，无位移。复用 `useRevealAnimation` 时传入 `y: 0` 即可，CSS 不设 transform 因此不会产生位移
- `.reveal-section` — ReportPage 各 section 卡片的 ScrollTrigger 初始隐藏态（结构同 `.reveal-item`，语义独立便于维护）

### 2.3 `main.ts` 修改

```ts
import '@/plugins/gsap'              // ← 新增：GSAP + ScrollTrigger 一次性注册
import '@/styles/animations.css'     // ← 新增：动画 CSS 变量 + 初始态
// ... 其余不变
```

---

## 3. Composable: `useRevealAnimation`

### 3.1 文件: `frontend/src/composables/useRevealAnimation.ts`

```ts
import { onMounted, onBeforeUnmount, type Ref } from 'vue'
import { gsap } from '@/plugins/gsap'

// ---- Helpers (SSR-safe) ----

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---- Types ----

interface RevealOptions {
  /** CSS selector for target elements, default '.reveal-item' */
  selector?: string
  /** Stagger interval in seconds, default 0.08 */
  stagger?: number
  /** Tween duration in seconds, default 0.6 */
  duration?: number
  /** Target y offset (animated to 0), default 18 */
  y?: number
  /** GSAP ease string, default 'power2.out' */
  ease?: string
  /** Initial delay in seconds, default 0 */
  delay?: number
  /** When true, skip animation and make elements visible immediately.
   *  Supports Ref<boolean> for reactivity. */
  disabled?: Ref<boolean> | boolean
  /** If false, caller must invoke play() manually. Default true. */
  autoPlay?: boolean
}

// ---- Composable ----

export function useRevealAnimation(
  scope: Ref<HTMLElement | null>,
  options: RevealOptions = {}
) {
  const {
    selector = '.reveal-item',
    stagger = 0.08,
    duration = 0.6,
    y = 18,
    ease = 'power2.out',
    delay = 0,
    disabled,
    autoPlay = true,
  } = options

  const prefersReduced = getPrefersReducedMotion()
  let ctx: gsap.Context | null = null

  function isDisabled(): boolean {
    if (prefersReduced) return true
    if (typeof disabled === 'boolean') return disabled
    return disabled?.value ?? false
  }

  function play() {
    if (!scope.value) return

    // Kill previous context before creating new one (safe re-play)
    ctx?.revert()

    ctx = gsap.context(() => {
      const targets = scope.value!.querySelectorAll<HTMLElement>(selector)
      if (targets.length === 0) return

      if (isDisabled()) {
        // CRITICAL: disabled/reduced-motion is NOT "skip" — must make elements visible
        gsap.set(targets, { opacity: 1, y: 0 })
        return
      }

      gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration,
        stagger,
        ease,
        delay,
      })
    }, scope.value)
  }

  function kill() {
    ctx?.revert()
    ctx = null
  }

  onMounted(() => {
    if (autoPlay) play()
  })

  onBeforeUnmount(() => {
    kill()
  })

  return { play, kill }
}
```

### 3.2 核心约束

| # | 约束 | 说明 |
|---|---|---|
| 1 | CSS 管理初始隐藏态 | `.reveal-item { opacity: 0; transform: translateY(18px) }` |
| 2 | JS 只用 `gsap.to` | 不做 `gsap.from`，不做 `immediateRender: true` |
| 3 | `prefersReduced` 在模块顶层只调用一次 | 通过 `getPrefersReducedMotion()` SSR-safe 封装 |
| 4 | `disabled=true` 也要确保可见 | `gsap.set(targets, { opacity: 1, y: 0 })`，不做 `clearProps: 'all'` |
| 5 | 所有 tween 在 `gsap.context` 内创建 | 组件卸载时 `ctx.revert()` 自动清理 |
| 6 | 支持 `play()` 手动触发 | `autoPlay: false` 时由调用方在数据 ready 后调用 |

---

## 4. MetricCard 数字动画

### 4.1 `parseNumericValue` — 纯函数

```ts
interface ParsedNumber {
  numeric: number
  unit: string          // "" | "TPS" | "ms" | "%" | ...
  rawNumber: string     // original numeric part string, for decimal detection
  isAnimatable: boolean
  raw: string           // full original value
}

function parseNumericValue(raw: string | number): ParsedNumber {
  const str = String(raw).trim()

  // Strict: only accept "42", "19.8", "-3.5", "42 ms", "19.8 TPS" etc.
  // Reject: "12.3.4", ".5", "abc123"
  const match = str.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/)
  if (!match) {
    return { numeric: 0, unit: '', rawNumber: '', isAnimatable: false, raw: str }
  }

  const rawNumber = match[1]
  const numeric = parseFloat(rawNumber)
  const unit = match[2]

  if (isNaN(numeric)) {
    return { numeric: 0, unit: '', rawNumber: '', isAnimatable: false, raw: str }
  }

  return { numeric, unit, rawNumber, isAnimatable: true, raw: str }
}
```

**正则解释:** `/^(-?\d+(?:\.\d+)?)\s*(.*)$/`
- `-?\d+` — 整数部分（可选负号）
- `(?:\.\d+)?` — 可选小数部分
- `\s*(.*)$` — 可选空格 + 单位

### 4.2 小数位保留逻辑

```ts
function getDecimalPlaces(rawNumber: string): number {
  if (!rawNumber.includes('.')) return 0
  return Math.min(rawNumber.split('.')[1].length, 2)
}
```

| 输入 | 输出 |
|---|---|
| `19.8` | `19.8` |
| `19.95` | `19.95` |
| `19.956` | `19.96` (最多 2 位) |
| `42` | `42` |

### 4.3 MetricCard 组件修改

```
现有: <div class="metric-value">{{ value }}</div>
改为: <div class="metric-value">{{ displayValue }}</div>

新增 props:
  animateValue?: boolean  (default: true, 允许外部关闭)

新增逻辑:
  const prefersReduced = getPrefersReducedMotion()
  const displayValue = ref<string | number>(props.value)
  let tween: gsap.core.Tween | null = null

  function animate() {
    tween?.kill()

    const parsed = parseNumericValue(props.value)

    if (!parsed.isAnimatable || !props.animateValue || prefersReduced) {
      displayValue.value = props.value
      return
    }

    const decimalPlaces = getDecimalPlaces(parsed.rawNumber)

    tween = gsap.to(
      { val: 0 },
      {
        val: parsed.numeric,
        duration: 0.8,
        ease: 'power2.out',
        onUpdate() {
          const v = (this.targets() as Array<{ val: number }>)[0].val
          const rounded = decimalPlaces > 0
            ? v.toFixed(decimalPlaces)
            : String(Math.round(v))
          displayValue.value = parsed.unit
            ? `${rounded} ${parsed.unit}`
            : rounded
        },
      }
    )
  }

  watch(() => props.value, animate, { immediate: true })
  onBeforeUnmount(() => tween?.kill())
```

**防御覆盖:**
- `"42"` → 数字递增 `0→42`
- `"19.8"` → `0→19.8`（保持 1 位小数）
- `"42 ms"` → `0→42 ms`（带单位）
- `"19.8 TPS"` → `0→19.8 TPS`
- `"N/A"` / `"unknown"` → 直接显示，无动画
- `123` (number) → 正常递增

---

## 5. App.vue 路由过渡

### 5.1 修改

```html
<!-- 仅最外层轻量 fade -->
<router-view v-slot="{ Component }">
  <transition name="page-fade" mode="out-in">
    <component :is="Component" />
  </transition>
</router-view>
```

- 仅 `opacity` 过渡，不碰 `transform`
- `mode="out-in"` 避免双页重叠
- CSS 已在 `animations.css` 中定义
- reduced-motion 时 `transition: none !important`

### 5.2 PublicLayout.vue

- **保持纯布局**，不添加任何 GSAP 动画或路由过渡逻辑
- 现有 header/footer 样式不变

---

## 6. 各组件动画编排

### 6.1 HeroAnalyzeCard

| 元素 | class | 说明 |
|---|---|---|
| `.hero-logo` | `reveal-item` | AppLogo |
| `.hero-title` | `reveal-item` | 标题 |
| `.hero-subtitle` | `reveal-item` | 副标题 |
| `.hero-form` | `reveal-item` | 输入框 + 按钮 |
| `.hero-hints` | `reveal-item` | 提示文字 |
| `.preview-card` | `reveal-item` | 预览卡片（最后入场） |

调用方式:
```ts
useRevealAnimation(containerRef, {
  selector: '.reveal-item',
  stagger: 0.08,
  autoPlay: true,  // 首页无异步依赖
})
```

### 6.2 AnalyzePage

调用方式:
```ts
const { play } = useRevealAnimation(containerRef, {
  selector: '.reveal-item',
  stagger: 0.1,
  autoPlay: false,
  disabled: computed(() => !report.value || report.value.status === 'pending'),
})
```

触发时机:
- `poll()` 首次返回非 pending 状态后 → `await nextTick()` → `play()`

核心区域（加 `reveal-item`）:
- `.progress-section`
- `StatusTimeline` 组件（外容器）
- `.analyze-tips`

### 6.3 ReportPage

ScrollTrigger 动画内联实现（不使用独立 composable，减少抽象层）:

```ts
const sectionRef = ref<HTMLElement | null>(null)
const prefersReduced = getPrefersReducedMotion()
let scrollCtx: gsap.Context | null = null
const dataReady = computed(() => !!aiResult.value)

function initScrollReveal() {
  if (!sectionRef.value) return

  const sections = gsap.utils.toArray<HTMLElement>(
    '.reveal-section',
    sectionRef.value!
  )

  // CRITICAL: reduced-motion must make sections visible, not leave them hidden
  if (prefersReduced) {
    gsap.set(sections, { opacity: 1, y: 0 })
    return
  }

  scrollCtx?.revert()

  // sections already resolved above, reuse inside context
  const targets = sections

  scrollCtx = gsap.context(() => {
    targets.forEach((section) => {
      gsap.to(section, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
      })
    })
  }, sectionRef.value)
}

function refresh() {
  ScrollTrigger.refresh()
}

// 数据加载完成后
async function loadReport() {
  // ... existing fetch logic ...
  await nextTick()
  if (!prefersReduced && dataReady.value) {
    initScrollReveal()
    refresh()
  }
}

onBeforeUnmount(() => {
  scrollCtx?.revert()
})
```

各 section 卡片加 `reveal-section` class:
- 核心证据
- 疑似原因
- 修复建议
- 小白解释
- 复测命令
- 缺少的信息
- 完整诊断报告（MarkdownReport）

每个 section 独立 ScrollTrigger:
- `trigger: section`（每个 section 自己作为 trigger）
- `start: 'top 85%'`（进入视口 85% 时触发）
- `toggleActions: 'play none none none'`（只播一次）

Summary Card 和 Topbar 使用 `reveal-item` + 入场动画（非滚动）:
```ts
useRevealAnimation(topRef, { stagger: 0.06, autoPlay: true })
```

### 6.4 HomePage

无需修改。HeroAnalyzeCard 自行处理所有入场动画。

---

## 7. ScrollTrigger.refresh 时机（精确清单）

| 场景 | 时机 | 说明 |
|---|---|---|
| AnalyzePage — 数据就绪 | `report.status !== 'pending'` 后 → `nextTick()` | DOM 从 loading 变为 finished |
| ReportPage — AI 结果渲染 | `loadReport()` 完成 + `aiResult` 有值 → `nextTick()` → `initScrollReveal()` → `refresh()` | section 卡片才真正插入 DOM |
| 窗口 resize | ScrollTrigger 自动处理 | **不需要**手动 watch 调用 refresh |
| Polling 中间状态 | **不调** | 每 2 秒的 progress 更新不改变 DOM 结构 |

**不做的事情:**
- 不 watch 大对象频繁 refresh
- 不在每次 progress 变化时 refresh
- 不每 2 秒 polling 时 refresh

---

## 8. Reduced-Motion 完整防御清单

| 层级 | 措施 | 位置 |
|---|---|---|
| CSS 全局 | `@media (prefers-reduced-motion) { animation-duration: 0.001ms !important }` | `animations.css` |
| CSS 路由过渡 | `.page-fade-* { transition: none !important }` | `animations.css` |
| JS 辅助函数 | `getPrefersReducedMotion()` SSR-safe | composable 内部 |
| useRevealAnimation | `isDisabled()` → `gsap.set({ opacity: 1, y: 0 })`（直接显示，不播放） | composable |
| ScrollTrigger 初始化 | `prefersReduced` → 不创建 ScrollTrigger | ReportPage |
| MetricCard | `prefersReduced` → 直接显示最终值 | 组件内部 |
| clearProps 策略 | reduced-motion 时 **不使用** clearProps | 所有位置 |

---

## 9. 硬约束

### 9.1 必须遵守

1. **所有 GSAP 动画必须通过 `gsap.context(scope)` 创建**
2. **组件卸载时 `ctx.revert()` 清理**
3. **所有 ScrollTrigger 必须在 `gsap.context` 内创建；禁止在 context 外创建 ScrollTrigger**
4. **不在 context 外创建 ScrollTrigger，若不得已则必须显式 kill**
5. **CSS 管理初始隐藏态，JS 只用 `gsap.to`**
6. **从 `@/plugins/gsap` 引入，不直接从 `gsap` 包引入**
7. **`main.ts` 全局引入 `plugins/gsap.ts` 和 `animations.css`**

### 9.2 不允许

1. ❌ 改业务逻辑（API 调用、路由守卫、表单提交、轮询逻辑）
2. ❌ 在 Admin 页面引入 GSAP（只保留 CSS transition）
3. ❌ 在 App.vue / PublicLayout.vue 做复杂路由过渡（双重动画）
4. ❌ `gsap.from` / `gsap.fromTo`（用 CSS + gsap.to 替代）
5. ❌ `immediateRender: true` 全局依赖
6. ❌ `clearProps: 'all'`
7. ❌ 创建 context 外的 ScrollTrigger
8. ❌ 直接修改 props.value（MetricCard 用 displayValue ref）
9. ❌ SSR 不安全的 `window` 直接访问（用 `getPrefersReducedMotion()` 封装）

---

## 10. 实施文件变更汇总

| 文件 | 操作 | 内容 |
|---|---|---|
| `frontend/src/plugins/gsap.ts` | **NEW** | 注册 ScrollTrigger，导出 `{ gsap, ScrollTrigger }` |
| `frontend/src/composables/useRevealAnimation.ts` | **NEW** | staggers 入场动画 composable |
| `frontend/src/styles/animations.css` | **NEW** | CSS 变量、.reveal-item、路由过渡、reduced-motion |
| `frontend/src/main.ts` | MOD | +2 行 import |
| `frontend/package.json` | MOD | +`gsap` 依赖 |
| `frontend/src/App.vue` | MOD | `<router-view>` 包 `<transition>` |
| `frontend/src/components/public/HeroAnalyzeCard.vue` | MOD | 元素加 `reveal-item` + useRevealAnimation |
| `frontend/src/components/public/MetricCard.vue` | MOD | 数字递增动画 |
| `frontend/src/pages/AnalyzePage.vue` | MOD | `reveal-item` + delayed play + refresh |
| `frontend/src/pages/ReportPage.vue` | MOD | `reveal-section` 滚动揭示 + init + refresh |
| `frontend/src/pages/HomePage.vue` | 不变 | HeroAnalyzeCard 自行处理 |
| `frontend/src/layouts/PublicLayout.vue` | 不变 | 纯布局 |
| Admin 所有文件 | 不变 | 不加 GSAP |

---

## 11. 自检清单

- [ ] 所有文件路径确认存在（或新建）
- [ ] 无 TBD / TODO 占位符
- [ ] 正则、小数位保留、onUpdate 语法与环境兼容
- [ ] `prefersReduced` 覆盖 CSS + JS 两个层面
- [ ] `disabled` / `prefersReduced` 走 "直接显示" 路径，不跳过
- [ ] MetricCard 数字/非数字/带单位/非数字字符串全部覆盖
- [ ] 所有动画在 `gsap.context` 内，卸载时 `ctx.revert()`
- [ ] ScrollTrigger 在 context 内创建，ReportPage 每个 section 独立 trigger
- [ ] `autoPlay: false` 的页面在数据加载 `nextTick` 后才触发动画
- [ ] Admin 页面完全不受影响
