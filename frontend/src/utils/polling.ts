import { ref, onUnmounted } from 'vue'

export function usePolling(
  callback: () => Promise<void>,
  intervalMs: number = 2000,
) {
  const timer = ref<ReturnType<typeof setInterval> | null>(null)
  const isActive = ref(false)

  function start() {
    if (isActive.value) return
    isActive.value = true
    callback() // Immediate first call
    timer.value = setInterval(callback, intervalMs)
  }

  function stop() {
    isActive.value = false
    if (timer.value !== null) {
      clearInterval(timer.value)
      timer.value = null
    }
  }

  function restart() {
    stop()
    start()
  }

  onUnmounted(stop)

  // Resume polling when tab becomes visible
  function handleVisibility() {
    if (document.hidden) {
      stop()
    } else if (!isActive.value) {
      start()
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility)
    onUnmounted(() => {
      document.removeEventListener('visibilitychange', handleVisibility)
    })
  }

  return { start, stop, restart, isActive }
}
