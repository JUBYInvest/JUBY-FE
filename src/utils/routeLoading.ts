/**
 * 화면 묶음(lazy)을 받는 중인지. 머리글 띠 아래 끝을 흐르는 줄(Header `.progress`)이 구독한다.
 *
 * React Router는 화면 이동을 전환(startTransition)으로 처리해, 다음 화면의 묶음이 올 때까지 **앞 화면을 그대로 둔다** —
 * Suspense의 빈 자리(App.tsx fallback)는 주소를 직접 열 때만 보이고, 메뉴를 눌러 옮길 때는 아무 표시 없이 앞 화면에 머물렀다
 * (2026-11-03 judge/motion.mjs M6에서 찾음 — 그 전에 둔 빈 자리 스피너는 메뉴 이동에서는 한 번도 뜨지 않았다).
 * 그래서 묶음을 부르는 함수(App.tsx의 lazy)를 `trackRouteChunk`로 감싸 받는 동안을 센다.
 */
let pending = 0
const listeners = new Set<() => void>()

// 묶음은 다른 컴포넌트를 그리는 도중(lazy가 처음 그려질 때) 불린다 — 그 자리에서 머리글을 바꾸지 않게 다음 틈에 알린다
const emit = () => queueMicrotask(() => listeners.forEach((listener) => listener()))

export function trackRouteChunk<T>(load: () => Promise<T>): () => Promise<T> {
  return () => {
    pending += 1
    emit()
    return load().finally(() => {
      pending -= 1
      emit()
    })
  }
}

export function subscribeRouteChunk(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isRouteChunkLoading(): boolean {
  return pending > 0
}
