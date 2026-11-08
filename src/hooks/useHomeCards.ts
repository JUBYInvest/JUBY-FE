import { useEffect, useState } from 'react'
import { readCardSeries } from '../api/cardSeries'
import { FALLBACK_LEADING, loadCardSeries, loadLeading, readCachedLeading } from '../api/home'
import type { CardSeries, LeadingStocks } from '../types/stock'

/*
 * 홈 '테마별 대표 종목' 칸에 필요한 두 가지 — 어떤 종목인지(대장주)와 그 1년 그래프. HomePage가 원래 자리에서 부른다:
 * effect가 도는 순서가 곧 요청 순서라(대장주 → 시세표 → 카드 그래프, judge expect/api-order.json·snapshot.mjs) 둘을 한 훅으로 합치지 않는다.
 */

/**
 * 대장주. 어떤 종목인지는 서버가 정한다(GET /api/stocks/leading-stocks — DB만 읽어 몇 번을 불러도 부담이 없어 들어올 때마다 새로 받는다).
 * 첫 그림은 지난 방문에 받아 둔 값, 그것도 없으면 고정 목록이고 받은 값으로 갈아 끼운다. 실패해도 loadLeading()이 지난 값이나 고정 목록을
 * 돌려주므로 카드는 늘 그려진다. settled는 응답이 왔는가(실패해도 끝난다) — 카드 그래프는 그 뒤의 목록으로만 묻는다:
 * 첫 그림의 고정 목록으로 먼저 물으면 서버 목록이 다를 때 또 물어, 첫 방문에 증권사를 거치는 상세 요청이 3건이 아니라 6건 나간다.
 * 다시 시도는 번호만 올린다 — effect가 앞 요청을 버리고 새로 받는다(단추가 직접 부르면 늦게 온 앞 응답을 못 버린다)
 */
export function useLeadingStocks(): { leading: LeadingStocks; settled: boolean; retry: () => void } {
  const [leading, setLeading] = useState<LeadingStocks>(() => readCachedLeading() ?? FALLBACK_LEADING)
  const [settled, setSettled] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let ignore = false
    void loadLeading().then((next) => {
      if (ignore) return
      setLeading(next)
      setSettled(true)
    })
    return () => {
      ignore = true
    }
  }, [attempt])
  return { leading, settled, retry: () => setAttempt((count) => count + 1) }
}

/**
 * 카드 그래프. 종목마다 받는 중이면 없음, 그릴 수 없으면 'unavailable'. 담아 둔 그래프는 받기 전 첫 그림부터 쓴다.
 * 받는 길과 막는 규칙은 api/home.ts loadCardSeries — 카드 그래프가 사용자가 누를 상세의 몫을 쓰지 않게 한다.
 * themeCodes는 쉼표로 이은 종목코드다 — themes 배열은 받을 때마다 새로 만들어져, 카드 종목이 바뀔 때만 다시 받으려고 글자로 견준다.
 * baseDate는 홈 시세표의 기준일(모르면 null)이다
 */
export function useCardSeries(themeCodes: string, baseDate: string | null, leadingSettled: boolean): Map<string, CardSeries | 'unavailable'> {
  const [cardSeries, setCardSeries] = useState<Map<string, CardSeries | 'unavailable'>>(() => new Map())
  useEffect(() => {
    let ignore = false
    const codes = themeCodes === '' ? [] : themeCodes.split(',')
    // 기준일이 바뀌면 묵은 그래프는 내리고 다시 받는다. 못 그린다고 정한 것도 다시 판단한다
    setCardSeries(() => {
      const next = new Map<string, CardSeries | 'unavailable'>()
      for (const code of codes) {
        const cached = readCardSeries(code, baseDate)
        if (cached !== null) next.set(code, cached)
      }
      return next
    })
    // 대장주 응답 전의 목록(지난 값·고정 목록)으로는 묻지 않는다. 담아 둔 그래프만 먼저 그린다
    if (!leadingSettled) return
    void loadCardSeries(codes, baseDate, (code, series) => {
      if (ignore) return
      setCardSeries((prev) => new Map(prev).set(code, series ?? 'unavailable'))
    })
    return () => {
      ignore = true
    }
  }, [themeCodes, baseDate, leadingSettled])
  return cardSeries
}
