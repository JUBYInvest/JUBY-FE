import { useEffect, useRef, useState } from 'react'
import { getLikeStocksOnPublicPage, likeStock, unlikeStock } from '../api/member'

/**
 * 이 종목이 내 관심종목인가. 상세 응답에는 관심 여부가 없어, 로그인했으면 관심종목 목록(DB)을 한 번 받아 가린다.
 * 어느 종목의 것인지 함께 든다 — 종목을 갈아타면 앞 종목의 하트가 한 번 비친다(useStockDetail의 view와 같은 이유).
 */
type LikeState =
  | { kind: 'loading' }
  /** 목록을 못 받았다. 켜져 있는지 모르니 누를 수 없게 두고 다시 시도를 준다 */
  | { kind: 'error'; stockCode: string }
  | { kind: 'ready'; stockCode: string; liked: boolean }

/** 화면이 보는 하트 상태. 비로그인은 목록을 부르지 않고, 누르면 화면이 로그인 안내를 띄운다 */
export type LikeView = LikeState | { kind: 'loggedOut' }

/**
 * 종목 상세의 관심종목 하트. 처음 상태는 관심종목 목록으로 정하고(로그인했을 때만,
 * 공개 화면 규칙대로 401이면 토큰만 지운다), toggle은 홈 하트와 같은 규칙 — 먼저 바꾸고 실패하면 되돌려 notice로 알린다.
 * 진행 중인 종목은 Set으로 연타를 막는다. 비로그인의 toggle은 아무것도 하지 않는다(화면이 로그인 안내를 연다).
 */
export function useLikeToggle(
  stockCode: string | undefined,
  hasValidCode: boolean,
  loggedIn: boolean,
): { view: LikeView; toggle: () => void; retry: () => void; notice: string | null } {
  const [like, setLike] = useState<LikeState>({ kind: 'loading' })
  /** 관심종목 목록의 '다시 시도'가 올린다 */
  const [retryCount, setRetryCount] = useState(0)
  /** 하트 요청이 진행 중인 종목. 연타로 등록·해제가 겹쳐 서버와 어긋나는 걸 막는다(홈과 같다) */
  const pendingLikes = useRef(new Set<string>())
  /** 하트를 서버에 반영하지 못해 되돌렸을 때 알리는 말. 어느 종목의 것인지 함께 든다 */
  const [likeNotice, setLikeNotice] = useState<{ stockCode: string; text: string } | null>(null)

  /*
   * 하트의 처음 상태. 로그인했을 때만 관심종목 목록(DB, 증권사 무관)을 받고, 로그인·로그아웃(다른 탭 포함)을 따라간다.
   * 하트 때문에 더 나가는 요청은 이것 하나다 — 토큰 심기·상세·뉴스는 그대로다.
   * 공개 화면이 들어오자마자 부르는 요청이라 401이면 로그인 화면으로 끌고 가지 않는다(getLikeStocksOnPublicPage).
   */
  useEffect(() => {
    if (stockCode === undefined || !hasValidCode || !loggedIn) return
    let isStale = false
    const code = stockCode
    setLike({ kind: 'loading' })

    getLikeStocksOnPublicPage()
      .then((list) => {
        // null이면 토큰이 만료돼 지웠다. 로그인 구독이 이 화면을 비로그인으로 바꾼다
        if (isStale || list === null) return
        setLike({
          kind: 'ready',
          stockCode: code,
          liked: list.likeStockList.some((item) => item.stockCode === code),
        })
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.warn('관심종목 목록 조회 실패', error)
        setLike({ kind: 'error', stockCode: code })
      })

    return () => {
      isStale = true
    }
  }, [stockCode, hasValidCode, loggedIn, retryCount])

  // 앞 종목의 상태면 아직 이 종목을 받는 중이다
  const view: LikeView = !loggedIn
    ? { kind: 'loggedOut' }
    : like.kind !== 'loading' && like.stockCode === stockCode
      ? like
      : { kind: 'loading' }

  /**
   * 하트는 홈과 같은 규칙이다. 먼저 바꾸고 서버에 알리며, 실패하면 되돌리고 알린다(조용히 되돌리면 누른 게 무시된 것처럼 보인다).
   * 처음 상태를 모르면(받는 중·못 받음) 버튼이 잠겨 여기 오지 않는다.
   */
  async function toggle() {
    if (view.kind !== 'ready') return
    const { stockCode: code, liked: wasLiked } = view
    if (pendingLikes.current.has(code)) return

    // 기다리는 사이 다른 종목으로 갔으면 그 종목의 하트는 건드리지 않는다
    const apply = (liked: boolean) =>
      setLike((previous) =>
        previous.kind === 'ready' && previous.stockCode === code ? { ...previous, liked } : previous,
      )

    pendingLikes.current.add(code)
    setLikeNotice(null)
    apply(!wasLiked)

    try {
      if (wasLiked) await unlikeStock(code)
      else await likeStock(code)
    } catch (error: unknown) {
      console.warn('관심종목 반영 실패', error)
      apply(wasLiked)
      setLikeNotice({
        stockCode: code,
        text: wasLiked
          ? '관심종목을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.'
          : '관심종목에 추가하지 못했어요. 잠시 후 다시 시도해 주세요.',
      })
    } finally {
      pendingLikes.current.delete(code)
    }
  }

  return {
    view,
    toggle: () => void toggle(),
    retry: () => setRetryCount((count) => count + 1),
    notice: likeNotice !== null && likeNotice.stockCode === stockCode ? likeNotice.text : null,
  }
}
