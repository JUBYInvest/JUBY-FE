import { useEffect, useRef, useState, type RefObject } from 'react'
import { prefersReducedMotion } from '../utils/motion'

/** idle: 가만히, pulling: 당기는 중(덜 당김), ready: 놓으면 새로고침, refreshing: 받는 중, closing: 받고 닫히는 중, settling: 덜 당겨 제자리로 돌아가는 중 */
type PullPhase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'closing' | 'settling'

/** 당김 거리(손가락이 내려온 거리의 절반)가 이만큼이면 놓았을 때 새로고침한다 */
const THRESHOLD = 64
/** 당김 거리 끝 — 더 내려도 이 이상 벌어지지 않는다 */
const MAX = 112
/** 받는 동안 벌려 두는 높이 */
const HOLD = 56
/** 너무 빨리 끝나도 도는 표시를 이만큼은 보인다 — 깜빡하고 사라지면 무엇이 일어났는지 모른다 */
const MIN_SPIN_MS = 600
/** 가만히(idle)로 바꾸는 때 — CSS transition(0.28s)보다 조금 길게. 같게 두면 끝나기 전에 바뀌어 남은 몇 분의 1픽셀이 툭 풀린다 */
const SETTLE_MS = 320
/** 이만큼 움직이기 전에는 어느 쪽 몸짓인지 정하지 않는다 */
const SLOP = 8

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * 당겨서 새로고침. 페이지 맨 위에서 손가락으로 끌어내리면 `areaRef` 칸에 당김 거리를 CSS 변수(`--pull`·`--pull-progress`)와 단계(`data-pull`)로 싣고 —
 * 손가락을 따라가는 동안 React를 다시 그리지 않는다 — 문턱을 넘겨 놓으면 `onRefresh`를 부른 뒤 곧바로 닫는다. 결과는 돌려주기만 한다(화면에 띄우지 않는다).
 * 처음 8px이 옆쪽(카드 줄 밀기)이거나 위쪽(내려 읽기)이면 손대지 않는다. 기본 동작을 막아야 하는 touchmove는 맨 위에서 닿은 동안만 듣는다.
 * 브라우저 자체 당겨서 새로고침(안드로이드 크롬 — 페이지 전체를 다시 읽는다)과 아이폰의 위쪽 출렁임은 이 화면에 있는 동안 끈다
 */
export function usePullToRefresh<T>(
  areaRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<T>,
): { phase: PullPhase; /** 마지막 새로고침 결과 — 다음에 당기기 시작할 때까지 둔다 */ result: T | null } {
  const [phase, setPhase] = useState<PullPhase>('idle')
  const [result, setResult] = useState<T | null>(null)
  const refreshRef = useRef(onRefresh)
  useEffect(() => {
    refreshRef.current = onRefresh
  })

  useEffect(() => {
    const area = areaRef.current
    if (area === null) return
    const root = document.documentElement
    const before = root.style.overscrollBehaviorY
    root.style.overscrollBehaviorY = 'contain'

    let alive = true
    let busy = false
    let startX = 0
    let startY = 0
    /** null: 아직 모름, pull: 당기는 몸짓, none: 다른 몸짓(손대지 않는다) */
    let gesture: 'pull' | 'none' | null = null
    let distance = 0

    const show = (next: PullPhase, px: number) => {
      area.dataset.pull = next
      distance = px
      area.style.setProperty('--pull', `${px}px`)
      area.style.setProperty('--pull-progress', String(Math.min(1, px / THRESHOLD)))
      setPhase(next)
    }
    show('idle', 0)

    const settle = async (how: 'closing' | 'settling') => {
      show(how, 0)
      await wait(prefersReducedMotion() ? 0 : SETTLE_MS)
      if (alive && area.dataset.pull === how) show('idle', 0)
    }

    const run = async () => {
      busy = true
      show('refreshing', HOLD)
      try {
        const [value] = await Promise.all([refreshRef.current(), wait(MIN_SPIN_MS)])
        if (alive) setResult(value)
      } catch (error: unknown) {
        // 실패를 알리는 건 onRefresh 몫이다(실패를 값으로 돌려준다). 여기까지 던져도 당김이 열린 채 굳지 않게 닫는다
        console.warn('당겨서 새로고침 실패', error)
      } finally {
        if (alive) await settle('closing')
        busy = false
      }
    }

    const stop = () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }

    function onMove(event: TouchEvent) {
      const touch = event.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (gesture === null) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        gesture = dy > 0 && Math.abs(dy) > Math.abs(dx) && window.scrollY <= 0 ? 'pull' : 'none'
        if (gesture === 'none') {
          stop()
          return
        }
        setResult(null)
      }
      // 당기는 동안은 페이지가 움직이지 않는다(브라우저 출렁임·스크롤 대신 이 칸이 벌어진다)
      event.preventDefault()
      const px = Math.round(Math.min(MAX, Math.max(0, (dy - SLOP) * 0.5)))
      show(px >= THRESHOLD ? 'ready' : 'pulling', px)
    }

    function onEnd() {
      stop()
      if (gesture !== 'pull') return
      gesture = null
      if (distance >= THRESHOLD) void run()
      else void settle('settling')
    }

    const onStart = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1 || window.scrollY > 0) return
      // 글자 칸·검색 후보 목록 안의 몸짓은 그 칸의 것이다
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [role="listbox"]') !== null) return
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      gesture = null
      window.addEventListener('touchmove', onMove, { passive: false })
      window.addEventListener('touchend', onEnd)
      window.addEventListener('touchcancel', onEnd)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    return () => {
      alive = false
      stop()
      window.removeEventListener('touchstart', onStart)
      root.style.overscrollBehaviorY = before
    }
  }, [areaRef])

  return { phase, result }
}
