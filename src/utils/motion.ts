/**
 * 화면 전환의 시간과 감속 곡선. 본문이 떠오르는 것(App.tsx Layout)과 머리글 메뉴 막대가 미끄러지는 것(Header)이 같이 쓴다 —
 * 같은 때 같은 곡선으로 움직여야 누른 곳과 바뀐 곳이 한 동작으로 읽힌다. 곡선은 빨리 출발해 천천히 닿는다(끝에서 튀지 않는다)
 */
export const PAGE_MOTION = { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' } as const

/** 움직임을 줄인 설정이면 참. 이때는 전환을 걸지 않는다(스피너도 돌지 않는다 — Spinner.module.css) */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
