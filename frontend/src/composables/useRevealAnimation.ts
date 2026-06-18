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
