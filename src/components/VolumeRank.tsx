import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getVolumeRank } from '../api/kisMarket'
import { normalizeName } from '../api/search'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { toKoreanDateTime } from '../utils/date'
import { formatPrice, formatTradingValue } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import type { VolumeRankItem } from '../types/market'
import type { StockInfo } from '../types/stock'
import styles from './VolumeRank.module.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; items: VolumeRankItem[]; receivedAt: number }
  | { kind: 'error' }

/**
 * 홈 '현재 주가 보기'의 두 번째 탭. 증권사가 주는 지금의 거래대금 상위 30종목이다(`GET /api/market/volume-rank`).
 * 첫 탭(시세표)은 JUBY가 다루는 종목의 마감 값이고, 이 탭은 시장 전체의 지금 값이라 둘을 한 표에 섞지 않는다.
 *
 * - **이 탭을 열 때만 묻는다**(증권사 직통 — api/kisMarket.ts). 1분 안에 다시 열면 받아 둔 값이다.
 * - 로그인해야 열린다. 비로그인이면 묻지 않고 로그인 안내다(로그인하면 홈으로 돌아온다).
 * - 응답에 종목코드가 없어 홈 목록에서 같은 이름을 찾아 상세로 잇는다. 못 찾은 종목은 이름만 적는다.
 */
export default function VolumeRank({ stocks, loginPath }: { stocks: StockInfo[]; loginPath: string }) {
  const loggedIn = useIsLoggedIn()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!loggedIn) return
    let isStale = false
    setState({ kind: 'loading' })
    getVolumeRank()
      .then(({ items, receivedAt }) => {
        if (!isStale) setState({ kind: 'ready', items, receivedAt })
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.warn('거래대금 순위 조회 실패', error)
        setState({ kind: 'error' })
      })
    return () => {
      isStale = true
    }
  }, [loggedIn, retryCount])

  const codeByName = useMemo(
    () => new Map(stocks.map((stock) => [normalizeName(stock.stockName), stock.stockCode])),
    [stocks],
  )

  if (!loggedIn) {
    return (
      <div className={styles.message}>
        <p className={styles.messageTitle}>로그인하면 지금 거래가 몰린 종목을 볼 수 있어요</p>
        <p className={styles.hint}>증권사가 주는 실시간 거래대금 상위 30종목이에요</p>
        <Link to={loginPath} className={styles.primary}>
          로그인
        </Link>
      </div>
    )
  }

  if (state.kind === 'loading') {
    return <div className={styles.skeleton} aria-label="불러오는 중" />
  }

  if (state.kind === 'error') {
    return (
      <div className={styles.message} role="alert">
        <p className={styles.messageTitle}>거래대금 순위를 불러오지 못했어요</p>
        <p className={styles.hint}>증권사 응답이 늦거나 막혔을 수 있어요. 시세표는 첫 탭에서 그대로 볼 수 있어요.</p>
        <button type="button" className={styles.secondary} onClick={() => setRetryCount((count) => count + 1)}>
          다시 시도
        </button>
      </div>
    )
  }

  const asOf = toKoreanDateTime(state.receivedAt)
  return (
    <div className={styles.table}>
      {asOf !== '' && <p className={styles.asOf}>{asOf} 기준 실시간 순위</p>}
      <div className={styles.head}>
        <span className={styles.rankHead}>순위</span>
        <span>종목명</span>
        <span className={styles.numeric}>현재가</span>
        <span className={`${styles.numeric} ${styles.colWide}`}>평균 거래대금</span>
      </div>
      <ol className={styles.body}>
        {state.items.map((item) => {
          const stockCode = codeByName.get(normalizeName(item.stockName))
          return (
            <li key={`${item.rank}-${item.stockName}`} className={styles.row}>
              <span className={styles.rank}>{item.rank}</span>
              <span className={styles.name}>
                {stockCode === undefined ? (
                  item.stockName
                ) : (
                  // 이름만 싣는다. 가격은 기준일 종가가 아니라 실시간 값이라 상세의 "N월 N일 종가" 자리에 넣지 않는다
                  <Link
                    to={`/stocks/${stockCode}`}
                    state={toPreviewState({ stockCode, stockName: item.stockName })}
                    className={styles.nameLink}
                  >
                    {item.stockName}
                  </Link>
                )}
              </span>
              <span className={styles.numeric}>{formatPrice(item.price)}</span>
              <span className={`${styles.numeric} ${styles.colWide}`}>{formatTradingValue(item.averageTradingValue)}</span>
            </li>
          )
        })}
        {state.items.length === 0 && <li className={styles.empty}>지금은 순위가 없어요. 장이 열리면 다시 열어 보세요.</li>}
      </ol>
      {/* 이름이 없는 줄이 왜 안 눌리는지 알린다 */}
      <p className={styles.note}>JUBY 시세표에 없는 종목은 이름만 보여요</p>
    </div>
  )
}
