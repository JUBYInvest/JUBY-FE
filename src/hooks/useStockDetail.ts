import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { detailWaitMs, primeKisToken } from '../api/kisBudget'
import { getStockDetail, isStockDetailInFlight, peekStockDetail } from '../api/stock'
import type { StockDetail } from '../types/stock'

/** 서버 오류 뒤 첫 재시도까지. 잠깐의 오류는 대개 이걸로 풀린다(아래 schedule) */
const QUICK_RETRY_MS = 1_500

/**
 * 받아 온 결과는 어느 종목의 것인지(stockCode)를 함께 든다. 같은 라우트 안에서 주소가 A→B로 바뀌면
 * effect가 돌기 전 첫 렌더에 A의 결과가 남아 있어, B 코드 옆에 A의 이름·현재가·차트와 탭 제목이 그려진다.
 * 렌더에서 코드를 견줘 다르면 불러오는 중으로 본다(아래 view).
 */
type DetailView =
  | { kind: 'loading' }
  /** 실패해서 다시 부르기 전에 간격(api/stock.ts DETAIL_GAP_MS)을 기다리는 중. until(ms)이 되면 보낸다 */
  | { kind: 'waiting'; stockCode: string; until: number }
  | { kind: 'ready'; stockCode: string; detail: StockDetail }
  /** 백엔드 stock 테이블에 없는 종목코드 */
  | { kind: 'notFound'; stockCode: string }
  | { kind: 'error'; stockCode: string }

/**
 * 종목 상세를 받는 상태기계. 곧바로 보내고, 서버 오류면 1.5초 뒤 한 번, 그래도 안 되면
 * 65초 뒤 한 번 더 부른다(CLAUDE.md "증권사(KIS) 호출" — 백엔드가 고칠 때까지의 임시 장치). 로그인했으면 보내기 전에 증권사 토큰을 심는다.
 * retry()는 '다시 시도' — 받아 둔 값을 버리고 간격을 지켜 새로 받는다.
 * hasValidCode가 거짓이면(형식이 틀린 코드) 아무것도 보내지 않는다 — 화면이 렌더에서 "없는 종목"으로 처리한다.
 */
export function useStockDetail(
  stockCode: string | undefined,
  hasValidCode: boolean,
): { view: DetailView; retry: () => void } {
  const [state, setState] = useState<DetailView>({ kind: 'loading' })
  /** '다시 시도'가 1씩 올린다. 같은 종목으로 아래 effect를 한 번 더 돌리는 유일한 방법 */
  const [retryCount, setRetryCount] = useState(0)
  /*
   * 다시 시도가 남기는 표시. 아래 effect가 한 번 쓰고 지운다 — 그 한 번만 방금 받아 둔 값을 쓰지 않고 새로 받는다.
   * retryCount > 0으로 가르면 한 번 누른 뒤로는 화면이 살아 있는 동안 계속 참이라, 다른 종목에 갔다 와도 1분 캐시를 안 쓴다
   */
  const freshNextRef = useRef(false)

  /*
   * 종목을 빠르게 갈아타면 먼저 보낸 요청이 나중에 도착해 새 종목 화면을 덮을 수 있다.
   * 그래서 응답을 받는 자리마다 isStale을 본다. 정리 함수는 이미 나간 요청을 취소하지
   * 못하고 '이 응답은 이제 쓸모없다'는 표시만 남긴다(NewsList도 같은 방식이다).
   *
   * 요청을 거는 쪽을 isStale로 감싸는 건 소용없다 — 그 자리는 effect 안에서 곧바로
   * 실행돼 검사할 시점에 늘 false다.
   */
  useEffect(() => {
    if (stockCode === undefined || !hasValidCode) return
    let isStale = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // 다시 시도로 도는 이번 한 번만 방금 받아 둔 값을 쓰지 않고 새로 받는다
    const fresh = freshNextRef.current
    freshNextRef.current = false

    // 방금 본 종목이면 서버에 묻지 않는다
    const remembered = fresh ? null : peekStockDetail(stockCode)
    if (remembered !== null) {
      setState({ kind: 'ready', stockCode, detail: remembered })
      return
    }

    // 안쪽 함수에서는 위의 undefined 검사가 이어지지 않아 좁혀진 값을 따로 둔다
    const code = stockCode

    /*
     * 실패하면 저절로 두 번까지 다시 부른다. 늦출수록 딜레이라 짧은 것부터 한다.
     * - 0번째: 곧바로. 서버가 멀쩡하면(평일, 또는 로그인해 토큰을 심었으면) 종목을 연달아 열어도 기다리지 않는다.
     * - 1번째: 1.5초 뒤. 잠깐의 서버 오류는 대개 이걸로 풀린다. 서버 오류가 나면 심어 둔 표시가 지워지므로
     *   로그인했으면 이때 토큰을 다시 심는다(api/stock.ts forgetKisTokenPrime).
     * - 2번째: 마지막으로 보낸 때에서 65초 뒤(api/stock.ts "실패한 뒤 다시 부를 간격"). 1분에 1건만 되는 날(주말,
     *   비로그인)은 그 안에 다시 불러도 또 실패한다. 남은 초를 센다.
     * 그래도 실패하면 "다시 시도"를 띄우고, 그 버튼은 2번째와 같이 간격을 지켜 보낸다.
     * 기다리는 사이 다른 종목으로 가면 정리 함수가 타이머를 지워 이 종목 요청은 더 나가지 않는다.
     */
    function schedule(attempt: number) {
      const wait =
        attempt === 0 || isStockDetailInFlight(code)
          ? 0
          : attempt === 1
            ? QUICK_RETRY_MS
            : detailWaitMs()
      if (wait === 0) {
        send(attempt)
        return
      }
      // 짧은 기다림은 뼈대로 두고, 긴 기다림만 남은 초를 센다
      setState(
        attempt >= 2
          ? { kind: 'waiting', stockCode: code, until: Date.now() + wait }
          : { kind: 'loading' },
      )
      // 긴 기다림은 끝날 때 다시 잰다 — 그사이 다른 탭이 보냈으면 더 기다린다
      timer = setTimeout(() => (attempt >= 2 ? schedule(attempt) : send(attempt)), wait)
    }

    function send(attempt: number) {
      setState({ kind: 'loading' })
      // 로그인했으면 먼저 증권사 토큰을 심는다(api/stock.ts "증권사 토큰 심기"). 심는 사이 떠났으면 상세는 보내지 않는다
      primeKisToken(code)
        .then(() => (isStale ? null : getStockDetail(code, 'ALL', { fresh: true })))
        .then((detail) => {
          if (isStale || detail === null) return
          setState({ kind: 'ready', stockCode: code, detail })
        })
        .catch((error: unknown) => {
          if (isStale) return
          if (error instanceof ApiError && error.status === 404) {
            setState({ kind: 'notFound', stockCode: code })
            return
          }
          console.warn('종목 상세 조회 실패', error)
          // 4xx와 모양이 틀린 200은 다시 불러도 같다. 서버 오류(5xx)와 서버에 못 닿은 경우만 다시 부른다
          const serverSide = !(error instanceof ApiError) || error.status >= 500
          if (attempt < 2 && serverSide) {
            schedule(attempt + 1)
            return
          }
          setState({ kind: 'error', stockCode: code })
        })
    }

    // 다시 시도 버튼으로 왔으면(fresh) 방금 실패한 것이니 간격부터 지킨다
    schedule(fresh ? 2 : 0)

    return () => {
      isStale = true
      clearTimeout(timer)
    }
  }, [stockCode, hasValidCode, retryCount])

  // 앞 종목의 결과면 아직 이 종목을 받는 중이다
  const view: DetailView =
    state.kind !== 'loading' && state.stockCode !== stockCode ? { kind: 'loading' } : state

  /*
   * 다시 시도. 받아 둔 값을 먼저 버리고(불러오는 중) 새로 받는다. 구역 경계는 누르는 순간 안쪽을 다시 그리는데,
   * 그때 멈추게 한 옛 값을 그대로 들고 있으면 곧바로 또 멈춰, 새 값이 멀쩡하게 와도 안내가 풀리지 않는다.
   * 홈 카드의 다시 시도와 같은 방식이다.
   */
  function retry() {
    setState({ kind: 'loading' })
    freshNextRef.current = true
    setRetryCount((count) => count + 1)
  }

  return { view, retry }
}
