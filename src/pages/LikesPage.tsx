import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getLikeStocks, unlikeStock } from '../api/member'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import KeywordNews from '../components/KeywordNews'
import { toStockHandoff } from '../hooks/useStockHandoff'
import { toKoreanDate } from '../utils/date'
import {
  formatChangeRate,
  formatPrice,
  formatTradingValue,
  isFiniteNumber,
  isFlatRate,
  rateTone,
} from '../utils/format'
import { loginPathFrom } from '../utils/navigation'
import { preloadStockChartPage } from '../utils/preload'
import { toPreviewState } from '../utils/stockPreview'
import { squarify } from '../utils/treemap'
import type { LikeStock } from '../types/member'
import styles from './LikesPage.module.css'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; baseDate: string; stocks: LikeStock[] }
  | { kind: 'error' }

type ListOrder = 'rate' | 'value' | 'recent'

const ORDERS: { key: ListOrder; label: string }[] = [
  { key: 'rate', label: '등락률 높은 순' },
  { key: 'value', label: '거래대금 많은 순' },
  { key: 'recent', label: '최근 담은 순' },
]

/**
 * 주식 모아보기(2026-10-30 사용자 요청 — 관심종목을 한 번에 보는 화면. 마이페이지 관심종목 탭을 여기로 합쳤다).
 * 관심종목 목록(GET /api/members/me/like-stocks, DB) 한 번으로 그린다 — 증권사를 부르지 않는다.
 * 맨 위 한 문장과 다섯 숫자, "한눈에 보기" 지도(칸 크기 거래대금, 색 등락률), 담은 종목 목록(해제·바로 가기).
 * 비로그인은 요청 없이 로그인 안내다.
 */
export default function LikesPage() {
  useDocumentTitle('주식 모아보기')
  const loggedIn = useIsLoggedIn()
  const { pathname } = useLocation()

  if (!loggedIn) {
    return (
      <section className={styles.page}>
        <header className={styles.head}>
          <div>
            <p className={styles.eyebrow}>주식 모아보기</p>
            <h1 className={styles.title}>관심종목을 한 번에 모아 봐요</h1>
          </div>
        </header>
        <div className={styles.message}>
          <p className={styles.messageText}>로그인하면 하트를 누른 종목이 여기에 모여요.</p>
          <Link to={loginPathFrom(pathname)} className={styles.primary}>
            로그인
          </Link>
        </div>
      </section>
    )
  }

  return <LikesBoard />
}

function LikesBoard() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  /** 해제 요청이 진행 중인 종목. 연타를 막는다 */
  const pending = useRef(new Set<string>())
  /** 해제에 실패해 목록을 되돌렸을 때 알리는 말. 되돌리기만 하면 누른 게 무시된 것처럼 보인다 */
  const [notice, setNotice] = useState('')
  const [order, setOrder] = useState<ListOrder>('rate')

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    getLikeStocks()
      .then((result) =>
        setState({ kind: 'ready', baseDate: result.baseDate, stocks: result.likeStockList }),
      )
      .catch((error: unknown) => {
        console.warn('관심종목 조회 실패', error)
        setState({ kind: 'error' })
      })
  }, [])

  useEffect(load, [load])

  // 홈과 같은 이유로 상세 화면 묶음을 미리 받아 둔다
  useEffect(() => preloadStockChartPage(), [])

  /** 먼저 지우고 서버에 알린다. 실패하면 목록을 다시 받아 원래대로 돌린다(예전 마이페이지 관심종목과 같다) */
  async function handleUnlike(stockCode: string) {
    if (pending.current.has(stockCode)) return
    pending.current.add(stockCode)
    setNotice('')
    setState((current) =>
      current.kind === 'ready'
        ? { ...current, stocks: current.stocks.filter((s) => s.stockCode !== stockCode) }
        : current,
    )
    try {
      await unlikeStock(stockCode)
    } catch (error: unknown) {
      console.warn('관심종목 해제 실패', error)
      setNotice('관심종목을 해제하지 못했어요. 잠시 후 다시 시도해 주세요.')
      load()
    } finally {
      pending.current.delete(stockCode)
    }
  }

  const stocks = useMemo(() => (state.kind === 'ready' ? state.stocks : []), [state])
  const sorted = useMemo(() => sortLikes(stocks, order), [stocks, order])

  if (state.kind === 'loading') {
    return (
      <section className={styles.page} aria-busy="true">
        <div className={`${styles.skeleton} ${styles.skeletonHead}`} />
        <div className={`${styles.skeleton} ${styles.skeletonBody}`} aria-label="불러오는 중" />
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section className={styles.page}>
        <div className={styles.message}>
          <p className={styles.messageText}>관심종목을 불러오지 못했습니다.</p>
          <button type="button" className={styles.primary} onClick={load}>
            다시 시도
          </button>
        </div>
      </section>
    )
  }

  const baseDate = toKoreanDate(state.baseDate)
  const rated = stocks.filter((s) => isFiniteNumber(s.fluctuate))
  const ups = rated.filter((s) => !isFlatRate(s.fluctuate) && (s.fluctuate ?? 0) > 0)
  const downs = rated.filter((s) => !isFlatRate(s.fluctuate) && (s.fluctuate ?? 0) < 0)
  const best = ups.reduce<LikeStock | null>((top, s) => (top === null || (s.fluctuate ?? 0) > (top.fluctuate ?? 0) ? s : top), null)
  const worst = downs.reduce<LikeStock | null>((low, s) => (low === null || (s.fluctuate ?? 0) < (low.fluctuate ?? 0) ? s : low), null)

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>주식 모아보기</p>
          <h1 className={styles.title}>{summarize(stocks.length, ups.length, downs.length)}</h1>
        </div>
        {baseDate !== '' && <p className={styles.base}>{baseDate} 종가 기준</p>}
      </header>

      {notice !== '' && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {stocks.length === 0 ? (
        <div className={styles.message}>
          <p className={styles.messageText}>아직 관심종목이 없어요</p>
          <p className={styles.hint}>홈 시세표나 종목 화면에서 하트를 누르면 여기에 모여요.</p>
          <Link to="/" className={styles.primary}>
            종목 보러 가기
          </Link>
        </div>
      ) : (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>담은 종목</dt>
              <dd>{stocks.length}개</dd>
            </div>
            <div>
              <dt>오른 종목</dt>
              <dd className={ups.length > 0 ? styles.up : undefined}>{ups.length}개</dd>
            </div>
            <div>
              <dt>내린 종목</dt>
              <dd className={downs.length > 0 ? styles.down : undefined}>{downs.length}개</dd>
            </div>
            <div className={styles.statWide}>
              <dt>가장 많이 오른 종목</dt>
              <dd>
                {best === null ? '-' : best.stockName}
                {best !== null && <small className={styles.up}>{formatChangeRate(best.fluctuate)}</small>}
              </dd>
            </div>
            <div className={styles.statWide}>
              <dt>가장 많이 내린 종목</dt>
              <dd>
                {worst === null ? '-' : worst.stockName}
                {worst !== null && <small className={styles.down}>{formatChangeRate(worst.fluctuate)}</small>}
              </dd>
            </div>
          </dl>

          <div className={styles.body}>
            <section className={styles.mapSection} aria-labelledby="likes-map-title">
              <div className={styles.sectionHead}>
                <h2 id="likes-map-title" className={styles.sectionTitle}>
                  한눈에 보기
                </h2>
                <span className={styles.sectionNote}>칸 크기는 거래대금, 색은 등락률이에요</span>
              </div>
              <HeatMap stocks={stocks} baseDate={state.baseDate} />
              <div className={styles.legend} aria-hidden="true">
                <span>-3%</span>
                {HEAT_LEVELS.map((level) => (
                  <i key={level} className={styles[level]} />
                ))}
                <span>+3%</span>
              </div>
            </section>

            {/* 넓은 화면은 오른쪽 한 칸에 담은 종목(위)·관심종목 뉴스(아래)를 둔다. 왼쪽 칸 전체가 지도다 */}
            <div className={styles.side}>
              <section aria-labelledby="likes-list-title">
                <div className={styles.sectionHead}>
                  <h2 id="likes-list-title" className={styles.sectionTitle}>
                    담은 종목
                  </h2>
                  <div className={styles.tabs} role="group" aria-label="정렬">
                    {ORDERS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={styles.tab}
                        aria-pressed={order === item.key}
                        onClick={() => setOrder(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className={styles.list}>
                  {sorted.map((stock) => (
                    <LikeRow
                      key={stock.stockCode}
                      stock={stock}
                      baseDate={state.baseDate}
                      onUnlike={() => void handleUnlike(stock.stockCode)}
                    />
                  ))}
                </ul>
              </section>

              <LikesNews stocks={stocks} />
            </div>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * 관심종목 뉴스(2026-10-30). 종목을 고르면 그 이름으로 네이버 뉴스를 찾는다(`GET /api/news`, 로그인 필요, KeywordNews).
 * 처음엔 담은 순서의 첫 종목 하나만 받는다 — 종목마다 미리 받으면 네이버 호출이 종목 수만큼 나간다.
 * 고른 종목을 관심종목에서 빼면 첫 종목으로 돌아간다.
 */
function LikesNews({ stocks }: { stocks: LikeStock[] }) {
  const [picked, setPicked] = useState<string | null>(null)
  const selected = stocks.find((stock) => stock.stockCode === picked) ?? stocks[0]
  if (selected === undefined) return null

  return (
    <section className={styles.newsSection} aria-labelledby="likes-news-title">
      <div className={styles.sectionHead}>
        <h2 id="likes-news-title" className={styles.sectionTitle}>
          관심종목 뉴스
        </h2>
        <span className={styles.sectionNote}>종목 이름으로 찾은 네이버 뉴스예요</span>
      </div>
      <div className={styles.newsTabs} role="group" aria-label="뉴스를 볼 종목">
        {stocks.map((stock) => (
          <button
            key={stock.stockCode}
            type="button"
            className={styles.tab}
            aria-pressed={stock.stockCode === selected.stockCode}
            onClick={() => setPicked(stock.stockCode)}
          >
            {stock.stockName}
          </button>
        ))}
      </div>
      <div className={styles.newsBody}>
        <KeywordNews query={selected.stockName} />
      </div>
    </section>
  )
}

/** 맨 위 한 문장. 받은 값으로만 짓는다 */
function summarize(total: number, ups: number, downs: number): string {
  if (total === 0) return '관심종목을 한 번에 모아 봐요'
  if (ups > 0) return `관심종목 ${total}개 중 ${ups}개가 올랐어요`
  if (downs === total) return `관심종목 ${total}개가 모두 내렸어요`
  return `관심종목 ${total}개 중 오른 종목이 없어요`
}

/** 값이 빈 줄은 방향과 상관없이 맨 뒤로 보낸다(utils/sort.sortStocks와 같은 규칙) */
function sortLikes(stocks: LikeStock[], order: ListOrder): LikeStock[] {
  const key = (s: LikeStock): number | null =>
    order === 'rate' ? s.fluctuate : order === 'value' ? s.tradingValue : s.likedAt === null ? null : Date.parse(s.likedAt)
  return [...stocks].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    const xOk = x !== null && Number.isFinite(x)
    const yOk = y !== null && Number.isFinite(y)
    if (!xOk || !yOk) return xOk === yOk ? 0 : xOk ? -1 : 1
    return y - x
  })
}

/** 등락률 → 지도 칸 색 단계(빨강·파랑 세 단계씩, 보합·모름은 회색). 색은 등락 뜻으로만 쓴다 */
const HEAT_LEVELS = ['heatDown3', 'heatDown2', 'heatDown1', 'heatFlat', 'heatUp1', 'heatUp2', 'heatUp3'] as const

function heatLevel(rate: number | null): (typeof HEAT_LEVELS)[number] {
  if (!isFiniteNumber(rate) || isFlatRate(rate)) return 'heatFlat'
  if (rate >= 2) return 'heatUp3'
  if (rate >= 1) return 'heatUp2'
  if (rate > 0) return 'heatUp1'
  if (rate > -1) return 'heatDown1'
  if (rate > -2) return 'heatDown2'
  return 'heatDown3'
}

/** 칸 크기를 잰 뒤에 나눈다(CardChart와 같은 방식). 칸을 누르면 그 종목 상세로 간다 */
function HeatMap({ stocks, baseDate }: { stocks: LikeStock[]; baseDate: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (box === null) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const tiles = size === null ? [] : squarify(stocks, (s) => s.tradingValue ?? 0, size.width, size.height)

  return (
    <div ref={boxRef} className={styles.map}>
      {tiles.map(({ item, x, y, width, height }) => (
        <Link
          key={item.stockCode}
          to={`/stocks/${item.stockCode}`}
          state={toPreviewState({
            stockCode: item.stockCode,
            stockName: item.stockName,
            closePrice: item.closePrice ?? undefined,
            fluctuate: item.fluctuate ?? undefined,
            baseDate,
          })}
          // 칸 색은 등락 뜻이다(판정이 등락 색 오용으로 세지 않게 표시한다)
          data-market=""
          className={`${styles.tile} ${styles[heatLevel(item.fluctuate)]} ${width < 128 || height < 92 ? styles.tileSmall : ''}`}
          style={{ left: x, top: y, width, height }}
        >
          <span className={styles.tileName}>{item.stockName}</span>
          <span>
            <span className={styles.tileRate}>{formatChangeRate(item.fluctuate)}</span>
            <span className={styles.tilePrice}>{formatPrice(item.closePrice)}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

function LikeRow({ stock, baseDate, onUnlike }: { stock: LikeStock; baseDate: string; onUnlike: () => void }) {
  const likedAt = toKoreanDate(stock.likedDate)
  const tone = styles[rateTone(stock.fluctuate)]
  const handoff = toStockHandoff({ stockCode: stock.stockCode, stockName: stock.stockName })

  return (
    <li className={styles.row}>
      {/* 하트를 누르면 관심종목에서 뺀다(채운 하트 = 담김) */}
      <button
        type="button"
        className={styles.heart}
        onClick={onUnlike}
        aria-pressed="true"
        aria-label={`${stock.stockName} 관심종목 해제`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M12 20.3 4.1 12.4a4.9 4.9 0 0 1 6.9-6.9l1 1 1-1a4.9 4.9 0 0 1 6.9 6.9z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className={styles.who}>
        <Link
          to={`/stocks/${stock.stockCode}`}
          state={toPreviewState({
            stockCode: stock.stockCode,
            stockName: stock.stockName,
            closePrice: stock.closePrice ?? undefined,
            fluctuate: stock.fluctuate ?? undefined,
            baseDate,
          })}
          className={styles.name}
        >
          {stock.stockName}
        </Link>
        <small className={styles.meta}>
          {stock.stockCode}
          {likedAt !== '' && <span>{likedAt} 담음</span>}
          <span className={styles.metaValue}>거래대금 {formatTradingValue(stock.tradingValue)}</span>
        </small>
      </span>
      <span className={styles.price}>{formatPrice(stock.closePrice)}</span>
      <span className={`${styles.rate} ${tone}`}>{formatChangeRate(stock.fluctuate)}</span>
      <span className={styles.go}>
        <Link to="/backtest" state={handoff} className={styles.goLink}>
          이 종목 백테스트
        </Link>
        <Link to="/ai" state={handoff} className={styles.goLink}>
          AI에게 물어보기
        </Link>
      </span>
    </li>
  )
}
