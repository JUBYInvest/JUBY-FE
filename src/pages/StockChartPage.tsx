import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import LoginModal from '../components/LoginModal'
import NewsList from '../components/NewsList'
import SectionBoundary from '../components/SectionBoundary'
import { ActionPanel, LikeToggle } from '../components/StockActions'
import PriceSection from '../components/StockPriceSection'
import { getBackupCandles } from '../api/kisMarket'
import { isStockCode, nameOrCode } from '../api/stock'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { useLikeToggle } from '../hooks/useLikeToggle'
import { useStockDetail } from '../hooks/useStockDetail'
import { loginPathFrom } from '../utils/navigation'
import { rememberStock } from '../utils/recentStocks'
import { readPreview } from '../utils/stockPreview'
import type { Candle, Period, StockInfo } from '../types/stock'
import styles from './StockChartPage.module.css'

/** 처음 열었을 때 기간. 60봉쯤이 봉 모양과 흐름이 함께 읽히는 길이다 */
const DEFAULT_PERIOD: Period = 'THREE_MONTH'

/**
 * 종목 상세. 상세 상태기계(hooks/useStockDetail)·관심종목 하트(hooks/useLikeToggle)·임시 차트·최근 본 종목을 엮고,
 * 그림은 components/StockPriceSection(머리 띠·차트 열·정보 열)과 StockActions(하트·바로 가기)가 맡는다.
 */
export default function StockChartPage() {
  const { stockCode } = useParams<{ stockCode: string }>()
  /*
   * 목록에서 누르고 왔으면 이름(과 기준일 종가)을 들고 온다. 응답을 기다리는 동안 그 자리를
   * 먼저 채운다. 주소를 직접 열었으면 없다 — 그땐 뼈대를 그린다.
   */
  const location = useLocation()
  const preview = stockCode === undefined ? null : readPreview(location.state, stockCode)
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)

  /*
   * 형식이 틀린 코드면 요청하지 않고 곧바로 "없는 종목"이다. effect에서 막으면 늦는다 —
   * 첫 렌더에 뉴스 목록이 먼저 마운트되고, 자식의 effect가 부모보다 먼저 돌아 요청이 나간다.
   * 그래서 렌더에서 판단해 뉴스 목록을 아예 그리지 않는다(아래 notFound 분기).
   */
  const hasValidCode = stockCode !== undefined && isStockCode(stockCode)
  const { view, retry } = useStockDetail(stockCode, hasValidCode)

  const loggedIn = useIsLoggedIn()
  const like = useLikeToggle(stockCode, hasValidCode, loggedIn)
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)

  /*
   * 탭 제목에 종목명을 넣는다. 종목 여러 개를 띄워 두고 비교할 때 탭이 다 'JUBY'면
   * 어느 게 어느 종목인지 알 수 없다. 받아오는 중·기다리는 중(65초)·실패에는 들고 온 이름을 쓰고,
   * 그것도 없거나 없는 종목일 때는 '종목'으로 둔다.
   */
  useDocumentTitle(
    view.kind === 'ready' ? nameOrCode(view.detail.stockName, stockCode ?? '') : (preview?.stockName ?? '종목'),
  )

  /*
   * 상세를 못 받았을 때의 임시 차트. 상세는 증권사 현재가가 실패하면 DB 일봉까지 못 받는다(useStockDetail).
   * 로그인했으면 그 종목 하나의 기간별 시세(증권사 `GET /api/market/{code}/daily_itemchartprice`, 모의투자 토큰 — api/kisMarket.ts)를
   * 한 번 받아 차트 자리를 채운다. 기다리는 중(waiting)이나 끝내 실패(error)일 때만, 이 화면에서 종목마다 한 번이다. 상세가 오면 상세가 먼저다.
   * 받은 값은 종목코드와 함께 두고 그릴 때 견준다 — 다른 종목으로 옮긴 뒤 늦게 온 응답이 새 종목 자리에 그려지지 않는다
   */
  const [backup, setBackup] = useState<{ stockCode: string; candles: Candle[] } | null>(null)
  const backupAskedRef = useRef(new Set<string>())
  const needsBackup = loggedIn && hasValidCode && (view.kind === 'waiting' || view.kind === 'error')

  useEffect(() => {
    if (!needsBackup || stockCode === undefined || backupAskedRef.current.has(stockCode)) return
    backupAskedRef.current.add(stockCode)
    const code = stockCode
    getBackupCandles(code)
      .then((candles) => {
        if (candles.length > 0) setBackup({ stockCode: code, candles })
      })
      .catch((error: unknown) => {
        console.warn('임시 차트(기간별 시세)를 받지 못했습니다', error)
      })
  }, [needsBackup, stockCode])

  /*
   * 최근 본 종목(홈 검색창이 비어 있을 때 보인다, utils/recentStocks.ts). 이름을 알 때만 남긴다 — 목록에서 들고 온 이름, 상세가 오면 그 이름.
   * 응답이 이름을 비워 종목코드로 대신했으면 남기지 않는다
   */
  const readyName = view.kind === 'ready' ? nameOrCode(view.detail.stockName, stockCode ?? '') : null
  const rememberedName = readyName !== null && readyName !== stockCode ? readyName : (preview?.stockName ?? null)

  useEffect(() => {
    if (stockCode === undefined || !hasValidCode || rememberedName === null) return
    rememberStock({ stockCode, stockName: rememberedName })
  }, [stockCode, hasValidCode, rememberedName])

  // 없는 종목에는 바로 가기 버튼도 두지 않는다
  if (stockCode === undefined || !hasValidCode || view.kind === 'notFound') {
    return (
      <section className={styles.section}>
        <h1 className={styles.heading}>목록에 없는 종목입니다</h1>
        <Link to="/" className={styles.backLink}>
          홈으로 돌아가기
        </Link>
      </section>
    )
  }

  const detail = view.kind === 'ready' ? view.detail : null
  const backupCandles =
    detail === null && backup !== null && backup.stockCode === stockCode ? backup.candles : null

  /*
   * 백테스트·AI로 실어 갈 종목명. 응답의 이름, 아직이면 목록에서 실어 온 이름이다. 응답이 이름을 비워 종목코드로
   * 대신했으면(nameOrCode) 모르는 것으로 본다 — AI에 "005930의 주가에 대해서…"로 묻게 된다. 모르면 두 버튼을 잠근다
   */
  const knownName =
    detail !== null && nameOrCode(detail.stockName, stockCode) !== stockCode
      ? detail.stockName
      : (preview?.stockName ?? null)

  const stock: StockInfo | null = knownName === null ? null : { stockCode, stockName: knownName }
  /** 로그인하면 이 상세로 돌아온다(비로그인 바로 가기·하트 안내) */
  const loginPath = loginPathFrom(`${location.pathname}${location.search}`)

  // 비로그인은 하트를 눌러 로그인 안내를 본다. 로그인했으면 훅이 먼저 바꾸고 서버에 알린다
  const likeToggle = (
    <LikeToggle like={like.view} onToggle={() => (loggedIn ? like.toggle() : setIsLoginModalOpen(true))} />
  )

  const likeStatus =
    like.view.kind === 'error' ? (
      <p className={styles.likeStatus} role="status">
        관심종목을 불러오지 못했습니다.
        <button type="button" className={styles.retryButton} onClick={like.retry}>
          다시 시도
        </button>
      </p>
    ) : like.notice !== null ? (
      <p className={styles.likeStatus} role="status">
        {like.notice}
      </p>
    ) : null

  const actionPanel = (
    <ActionPanel
      title={`${knownName ?? '이 종목'}, 이렇게 살펴보세요`}
      stock={stock}
      loginPath={loggedIn ? null : loginPath}
    />
  )

  return (
    <>
      {/*
        가격·차트를 그리다 멈춰도 뉴스는 남는다. 다시 시도하면 종목 정보를 새로 받는다.
        오류 경계는 자식이 그리다 난 오류만 받아내므로 이 구역을 PriceSection으로 떼어 뒀다 —
        여기(StockChartPage) 렌더에서 계산하면 경계를 지나쳐 화면 전체가 오류 화면이 된다.
        종목이 바뀌면(resetKey) 앞 종목에서 멈춘 상태를 푼다.
      */}
      {/*
        넓은 화면(1600px 이상)은 가격 구역 | 뉴스 두 열이다. 가격 구역 안이 다시 정보 열 | 차트로 나뉘어 화면에는 세 열로 보인다
        (뉴스가 첫 화면에 들도록). 그보다 좁으면 뉴스가 아래로 내려간다
      */}
      <div className={styles.layout}>
        <SectionBoundary resetKey={stockCode} onRetry={retry}>
          <PriceSection
            stockCode={stockCode}
            detail={detail}
            preview={preview}
            period={period}
            onPeriodChange={setPeriod}
            waiting={view.kind === 'waiting' ? view : null}
            failed={view.kind === 'error'}
            backup={backupCandles}
            onRetry={retry}
            likeToggle={likeToggle}
            likeStatus={likeStatus}
            actionPanel={actionPanel}
          />
        </SectionBoundary>

        <section className={styles.newsColumn}>
          <NewsList stockCode={stockCode} stockName={knownName} />
        </section>
      </div>

      {/* 홈 하트와 같은 안내. 로그인하면 이 상세로 돌아온다 */}
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
    </>
  )
}
