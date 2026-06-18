# GSAP Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight-elegant GSAP animations to Spark AI Analyzer public pages (entrance stagger, number counting, scroll reveal) without touching business logic or admin pages.

**Architecture:** A shared `useRevealAnimation` composable for stagger entrances, inline ScrollTrigger logic in ReportPage for per-section scroll reveal, CSS-managed initial hidden states with JS `gsap.to()` only, and layered reduced-motion defense.

**Tech Stack:** Vue 3 (`<script setup>`), GSAP 3.12+, ScrollTrigger plugin, Naive UI, TypeScript

## Global Constraints

- All GSAP animations MUST be created inside `gsap.context(scope)` and reverted via `ctx.revert()` on unmount
- All ScrollTrigger instances MUST be created inside `gsap.context` — never outside
- JS only uses `gsap.to()`; CSS manages initial hidden state (`.reveal-item`, `.reveal-section`)
- Never use `gsap.from` / `gsap.fromTo` / `immediateRender: true` / `clearProps: 'all'`
- Import from `@/plugins/gsap`, never directly from `gsap` package
- `prefers-reduced-motion` defense at both CSS and JS layers; use SSR-safe `getPrefersReducedMotion()` helper
- Do NOT modify any business logic, API calls, routing guards, form submissions, or polling logic
- Do NOT add GSAP animations to any Admin page
- PublicLayout.vue stays pure layout — no animation layer added
- HomePage.vue stays unchanged — HeroAnalyzeCard handles its own animations

---

### Task 1: Install GSAP dependency

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `gsap` package available at `^3.12.0` in `node_modules`

- [ ] **Step 1: Add gsap to package.json**

```bash
cd frontend && npm install gsap@^3.12.0
```

- [ ] **Step 2: Verify installation**

```bash
node -e "const gsap = require('gsap'); console.log('GSAP version:', gsap.version);"
```

Expected: prints GSAP version ≥ 3.12.0

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add gsap ^3.12.0 dependency"
```

---

### Task 2: Create plugins/gsap.ts — one-time ScrollTrigger registration

**Files:**
- Create: `frontend/src/plugins/gsap.ts`

**Interfaces:**
- Produces: `export { gsap, ScrollTrigger }` — all modules import from here

- [ ] **Step 1: Create the plugin file**

```ts
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/plugins/gsap.ts
git commit -m "feat: add GSAP plugin registration module"
```

---

### Task 3: Create styles/animations.css — CSS variables + initial hidden states + reduced-motion

**Files:**
- Create: `frontend/src/styles/animations.css`

**Interfaces:**
- Produces: CSS classes `.reveal-item`, `.reveal-item-fade-only`, `.reveal-section`, `.page-fade-*`, and `@media (prefers-reduced-motion)` override

- [ ] **Step 1: Create animations.css**

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

- [ ] **Step 2: Commit**

```bash
git add frontend/src/styles/animations.css
git commit -m "feat: add animations.css — CSS variables, initial states, reduced-motion"
```

---

### Task 4: Modify main.ts — wire up plugin and CSS

**Files:**
- Modify: `frontend/src/main.ts`

**Interfaces:**
- Consumes: `@/plugins/gsap`, `@/styles/animations.css`

- [ ] **Step 1: Add two import lines to main.ts**

The current `main.ts` is:

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import router from './router'
import App from './App.vue'
import './styles/global.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')
```

Add two lines after `import './styles/global.css'`:

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import router from './router'
import App from './App.vue'
import './styles/global.css'
import '@/plugins/gsap'              // GSAP + ScrollTrigger one-time registration
import '@/styles/animations.css'     // Animation CSS variables + initial states

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')
```

- [ ] **Step 2: Verify the app still compiles**

```bash
cd frontend && npx vite build --emptyOutDir false 2>&1 | tail -5
```

Expected: build succeeds without errors. The new imports don't break anything.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.ts
git commit -m "feat: wire up GSAP plugin and animations.css in main.ts"
```

---

### Task 5: Create composables/useRevealAnimation.ts

**Files:**
- Create: `frontend/src/composables/useRevealAnimation.ts`

**Interfaces:**
- Consumes: `{ gsap }` from `@/plugins/gsap`
- Produces: `useRevealAnimation(scope, options) → { play, kill }`
  - `scope: Ref<HTMLElement | null>` — component's container ref
  - `options.selector?: string` — CSS selector for targets (default `'.reveal-item'`)
  - `options.stagger?: number` — stagger interval (default `0.08`)
  - `options.duration?: number` — tween duration (default `0.6`)
  - `options.y?: number` — target translateY offset (default `18`, animated to `0`)
  - `options.ease?: string` — GSAP ease (default `'power2.out'`)
  - `options.delay?: number` — initial delay (default `0`)
  - `options.disabled?: Ref<boolean> | boolean` — skip animation, make visible immediately
  - `options.autoPlay?: boolean` — if false, caller must invoke `play()` (default `true`)
  - Returns `{ play: () => void, kill: () => void }`

- [ ] **Step 1: Create the composable file**

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

- [ ] **Step 2: Verify the file compiles**

```bash
cd frontend && npx vue-tsc --noEmit src/composables/useRevealAnimation.ts 2>&1 | head -10
```

Expected: no type errors (may show unrelated project errors — focus on this file's errors only).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useRevealAnimation.ts
git commit -m "feat: add useRevealAnimation composable — stagger entrance + reduced-motion"
```

---

### Task 6: Modify App.vue — add route-level fade transition

**Files:**
- Modify: `frontend/src/App.vue`

**Interfaces:**
- Consumes: `.page-fade-*` CSS classes from `animations.css` (already imported globally)

Current `App.vue` template:

```html
<template>
  <n-config-provider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
```

- [ ] **Step 1: Wrap router-view in a transition**

Change `App.vue` template to:

```html
<template>
  <n-config-provider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-dialog-provider>
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>
```

Script section remains unchanged.

- [ ] **Step 2: Verify the app builds**

```bash
cd frontend && npx vite build --emptyOutDir false 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.vue
git commit -m "feat: add route-level opacity fade transition to App.vue"
```

---

### Task 7: Modify MetricCard.vue — add number counting animation

**Files:**
- Modify: `frontend/src/components/public/MetricCard.vue`

**Interfaces:**
- Consumes: `{ gsap }` from `@/plugins/gsap`
- New prop: `animateValue?: boolean` (default `true`) — allows parent to disable counting
- Internal: `parseNumericValue()`, `getDecimalPlaces()` — pure utility functions
- Internal: `displayValue` ref — never mutates `props.value`

- [ ] **Step 1: Replace template value binding**

Current template line 4:
```html
<div class="metric-value">{{ value }}</div>
```

Change to:
```html
<div class="metric-value">{{ displayValue }}</div>
```

- [ ] **Step 2: Rewrite script section**

Current script:
```ts
defineProps<{
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  clickable?: boolean
}>()

defineEmits<{
  click: []
}>()
```

Replace with:

```ts
import { ref, watch, onBeforeUnmount } from 'vue'
import { gsap } from '@/plugins/gsap'

// ---- Pure utility functions ----

interface ParsedNumber {
  numeric: number
  unit: string
  rawNumber: string
  isAnimatable: boolean
  raw: string
}

function parseNumericValue(raw: string | number): ParsedNumber {
  const str = String(raw).trim()

  // Strict: only accept "42", "19.8", "-3.5", "42 ms", "19.8 TPS"
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

function getDecimalPlaces(rawNumber: string): number {
  if (!rawNumber.includes('.')) return 0
  return Math.min(rawNumber.split('.')[1].length, 2)
}

function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---- Props & Emits ----

const props = defineProps<{
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  clickable?: boolean
  animateValue?: boolean
}>()

defineEmits<{
  click: []
}>()

// ---- Number counting animation ----

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

onBeforeUnmount(() => {
  tween?.kill()
})
```

Style section: unchanged.

- [ ] **Step 3: Verify the file compiles**

```bash
cd frontend && npx vue-tsc --noEmit src/components/public/MetricCard.vue 2>&1 | head -10
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/MetricCard.vue
git commit -m "feat: add number counting animation to MetricCard"
```

---

### Task 8: Modify HeroAnalyzeCard.vue — stagger entrance animation

**Files:**
- Modify: `frontend/src/components/public/HeroAnalyzeCard.vue`

**Interfaces:**
- Consumes: `useRevealAnimation` from `@/composables/useRevealAnimation`

- [ ] **Step 1: Add reveal-item classes to template elements**

The current template has these elements that need animation. Add `class="reveal-item"` to each:

| Line | Element | Change |
|---|---|---|
| 2 | `<div class="hero-card glass-card">` | Add inner wrapper `<div ref="heroRef" class="hero-card glass-card">` |
| 5 | `<app-logo :size="'default'" />` | Add `class="reveal-item"` |
| 6 | `<h1 class="hero-title">` | Add `class="reveal-item"` to the `<h1>` |
| 7 | `<p class="hero-subtitle">` | Add `class="reveal-item"` |
| 11 | `<div class="hero-form">` | Add `class="reveal-item"` |
| 47 | `<div class="hero-hints">` | Add `class="reveal-item"` |
| 62 | `<div class="preview-card glass-card">` | Add `class="reveal-item"` |

The ref `heroRef` must wrap the full container to scope selectors.

Specifically, change line 2:
```html
<div class="hero-card glass-card">
```
to:
```html
<div ref="heroRef" class="hero-card glass-card">
```

And add `reveal-item` to the listed elements. For example, line 5-6:
```html
<app-logo class="reveal-item" :size="'default'" />
<h1 class="hero-title reveal-item">让 spark 性能报告变成小白也看得懂的中文诊断</h1>
```

(line 7)
```html
<p class="hero-subtitle reveal-item">
```

(line 11)
```html
<div class="hero-form reveal-item">
```

(line 47)
```html
<div class="hero-hints reveal-item">
```

(line 62)
```html
<div class="preview-card glass-card reveal-item">
```

- [ ] **Step 2: Add useRevealAnimation call in script**

Add after the existing imports:
```ts
import { useRevealAnimation } from '@/composables/useRevealAnimation'
```

The current script setup starts with:
```ts
const router = useRouter()
const message = useMessage()
const reportStore = useReportStore()
```

Add after `const router = useRouter()`:
```ts
const heroRef = ref<HTMLElement | null>(null)

useRevealAnimation(heroRef, {
  selector: '.reveal-item',
  stagger: 0.08,
  autoPlay: true,
})
```

Make sure `ref` is already imported from `vue` — check line 106: `import { ref } from 'vue'`. It is, so no change needed there.

- [ ] **Step 3: Verify the file compiles**

```bash
cd frontend && npx vue-tsc --noEmit src/components/public/HeroAnalyzeCard.vue 2>&1 | head -10
```

Expected: no new type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/public/HeroAnalyzeCard.vue
git commit -m "feat: add stagger entrance animation to HeroAnalyzeCard"
```

---

### Task 9: Modify AnalyzePage.vue — delayed entrance animation after data load

**Files:**
- Modify: `frontend/src/pages/AnalyzePage.vue`

**Interfaces:**
- Consumes: `useRevealAnimation` from `@/composables/useRevealAnimation`
- Consumes: `{ ScrollTrigger }` from `@/plugins/gsap`

- [ ] **Step 1: Add reveal-item classes and container ref**

Add `ref="analyzeRef"` to the outer container div (line 3):
```html
<div ref="analyzeRef" class="analyze-page container">
```

Add `class="reveal-item"` to these sections inside the card:

- `.progress-section` (line 47):
```html
<div class="progress-section reveal-item">
```

- `StatusTimeline` wrapper — add a wrapper div around `<status-timeline>`:
```html
<div class="reveal-item">
  <status-timeline :current-stage="report.stage || 'queued'" />
</div>
```

- `.analyze-tips` (line 64):
```html
<div class="analyze-tips reveal-item">
```

- [ ] **Step 2: Add useRevealAnimation with autoPlay: false and trigger on data ready**

Add import:
```ts
import { useRevealAnimation } from '@/composables/useRevealAnimation'
import { ScrollTrigger } from '@/plugins/gsap'
import { nextTick, computed } from 'vue'
```

(Check existing imports — `ref, watch, onMounted` are already imported from `vue`. Add `computed, nextTick` to that import.)

Add composable usage after `const report = ref<ReportStatus>(...)` block (after line 93):

```ts
const analyzeRef = ref<HTMLElement | null>(null)

const dataReady = computed(() =>
  report.value.status === 'completed' || report.value.status === 'failed'
)

const { play } = useRevealAnimation(analyzeRef, {
  selector: '.reveal-item',
  stagger: 0.1,
  autoPlay: false,
  disabled: computed(() => !dataReady.value),
})
```

- [ ] **Step 3: Trigger play() and refresh() when data is ready**

Modify the `poll()` function. Current (line 99-113):

```ts
async function poll() {
  try {
    const status = await getReportStatus(reportId)
    report.value = status

    if (status.status === 'completed') {
      polling.stop()
      router.replace({ name: 'report', params: { reportId } })
    } else if (status.status === 'failed') {
      polling.stop()
    }
  } catch {
    // Keep polling on error
  }
}
```

Change to:

```ts
let entrancePlayed = false

async function poll() {
  try {
    const status = await getReportStatus(reportId)
    report.value = status

    // Play entrance animation once data is no longer pending
    if (!entrancePlayed && status.status !== 'pending') {
      entrancePlayed = true
      await nextTick()
      play()
      await nextTick()
      ScrollTrigger.refresh()
    }

    if (status.status === 'completed') {
      polling.stop()
      router.replace({ name: 'report', params: { reportId } })
    } else if (status.status === 'failed') {
      polling.stop()
    }
  } catch {
    // Keep polling on error
  }
}
```

- [ ] **Step 4: Add container ref to return (if needed with `<script setup>` this is automatic since refs bound in template are auto-exposed)**

`<script setup>` automatically exposes template refs — no explicit return needed.

- [ ] **Step 5: Verify the file compiles**

```bash
cd frontend && npx vue-tsc --noEmit src/pages/AnalyzePage.vue 2>&1 | head -10
```

Expected: no new type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AnalyzePage.vue
git commit -m "feat: add delayed entrance animation to AnalyzePage"
```

---

### Task 10: Modify ReportPage.vue — scroll-triggered section reveal + top entrance

**Files:**
- Modify: `frontend/src/pages/ReportPage.vue`

**Interfaces:**
- Consumes: `useRevealAnimation` from `@/composables/useRevealAnimation`
- Consumes: `{ gsap, ScrollTrigger }` from `@/plugins/gsap`

- [ ] **Step 1: Add script imports and setup logic**

Add imports (merge with existing `vue` import):
```ts
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { gsap, ScrollTrigger } from '@/plugins/gsap'
import { useRevealAnimation } from '@/composables/useRevealAnimation'
```

SSR-safe helper (add in `<script setup>`, before composable calls):
```ts
function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
```

- [ ] **Step 2: Split template into two zones — top entrance + scroll sections**

Add `ref="topRef"` to the outer container (line 3, the div wrapping everything after `<public-layout>`):
```html
<div ref="topRef" class="report-page container">
```

Add `class="reveal-item"` to:
- `.report-topbar` (line 40)
```html
<div class="report-topbar reveal-item">
```

Add `class="reveal-item"` to:
- `.report-summary-card` → change line 61:
```html
<n-card class="report-summary-card reveal-item" :bordered="true">
```

Wrap all section cards in a scroll-reveal container. Add `<div ref="sectionRef">` wrapping all the `<n-card>` elements in the "Completed" template (after the summary card). Each section card gets `class="reveal-section"`:

- Core evidence card (line 86):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="核心证据">
```

- Suspected causes card (line 91):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="疑似原因" v-if="aiResult.suspected_causes?.length">
```

- Fix plan card (line 115):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="修复建议" v-if="aiResult.fix_plan?.length">
```

- Beginner explanation card (line 139):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="小白解释" v-if="aiResult.beginner_explanation">
```

- Retest commands card (line 151):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="复测命令" v-if="aiResult.retest_commands?.length">
```

- Missing information card (line 161):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="缺少的信息" v-if="aiResult.missing_information?.length">
```

- Markdown report card (line 183):
```html
<n-card class="report-section-card reveal-section" :bordered="true" title="完整诊断报告" v-if="report.aiResult?.markdown_report">
```

- [ ] **Step 3: Add top entrance animation composable**

After `const router = useRouter()`:
```ts
const topRef = ref<HTMLElement | null>(null)

// Top bar + summary card entrance (auto-play on mount)
useRevealAnimation(topRef, {
  selector: '.reveal-item',
  stagger: 0.06,
  autoPlay: true,
})
```

- [ ] **Step 4: Add inline ScrollTrigger logic for section reveals**

After the `const flatMetrics` computed block (after line 238):
```ts
// ---- Scroll-triggered section reveals ----

const sectionRef = ref<HTMLElement | null>(null)
const prefersReduced = getPrefersReducedMotion()
let scrollCtx: gsap.Context | null = null
const dataReady = computed(() => !!aiResult.value)

function initScrollReveal() {
  if (!sectionRef.value) return

  const sections = gsap.utils.toArray<HTMLElement>(
    '.reveal-section',
    sectionRef.value
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

function refreshTriggers() {
  ScrollTrigger.refresh()
}
```

- [ ] **Step 5: Modify loadReport() to trigger initScrollReveal + refresh**

Current `loadReport` (line 240-251):
```ts
async function loadReport() {
  try {
    const data = await getPublicReport(reportId)
    report.value = data
    if (data.status === 'processing' || data.status === 'pending') {
      router.replace({ name: 'analyze', params: { reportId } })
    }
  } catch {
    message.error('加载报告失败')
  }
}
```

Change to:
```ts
async function loadReport() {
  try {
    const data = await getPublicReport(reportId)
    report.value = data
    if (data.status === 'processing' || data.status === 'pending') {
      router.replace({ name: 'analyze', params: { reportId } })
    }

    // After data loads and DOM updates, init scroll reveals
    await nextTick()
    if (!prefersReduced && dataReady.value) {
      initScrollReveal()
      refreshTriggers()
    }
  } catch {
    message.error('加载报告失败')
  }
}
```

- [ ] **Step 6: Add cleanup in onBeforeUnmount**

Add after `onMounted(loadReport)`:
```ts
onBeforeUnmount(() => {
  scrollCtx?.revert()
})
```

Make sure `onBeforeUnmount` is imported from `vue`. Check line 206: `import { ref, computed, onMounted } from 'vue'`. Add `onBeforeUnmount, nextTick` to this import:
```ts
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
```

- [ ] **Step 7: Verify the file compiles**

```bash
cd frontend && npx vue-tsc --noEmit src/pages/ReportPage.vue 2>&1 | head -10
```

Expected: no new type errors.

- [ ] **Step 8: Full build check**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/ReportPage.vue
git commit -m "feat: add scroll-triggered section reveals and top entrance to ReportPage"
```

---

## Post-Implementation Verification

After all tasks are committed:

- [ ] Run `cd frontend && npx vite build` — must succeed
- [ ] Run `cd frontend && npx vite` — dev server starts
- [ ] Open HomePage — logo/title/form/preview stagger in on load
- [ ] Submit a spark URL — transition to AnalyzePage should fade
- [ ] AnalyzePage — progress bar + status show; entrance animates once data is non-pending
- [ ] ReportPage — top bar + summary stagger in; scroll down, each section reveals on enter
- [ ] Test with `prefers-reduced-motion: reduce` (browser DevTools → Rendering) — all elements visible immediately, no animations
- [ ] Admin pages — no animations, no GSAP-related console errors
- [ ] No console errors on any page
