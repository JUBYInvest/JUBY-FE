import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import CandleChart from '../components/CandleChart'
import NewsList from '../components/NewsList'
import SectionBoundary from '../components/SectionBoundary'
import { ApiError } from '../api/client'
import { getStockDetail, isStockCode } from '../api/stock'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { withRetry } from '../utils/async'
import { periodStart, toKoreanDate } from '../utils/date'
import {
  formatChangeRate,
  formatPrice,
  formatVolume,
  isFlatRate,
} from '../utils/format'
import { readPreview } from '../utils/stockPreview'
import type { Candle, Period, StockDetail, StockPreview } from '../types/stock'
import styles from './StockChartPage.module.css'

/** 백엔드 Period enum 순서 그대로. 화면 탭도 이 순서로 놓는다 */
const PERIOD_TABS: { period: Period; label: string }[] = [
  { period: 'ONE_WEEK', label: '1주' },
  { period: 'ONE_MONTH', label: '1개월' },
  { period: 'THREE_MONTH', label: '3개월' },
  { period: 'SIX_MONTH', label: '6개월' },
  { period: 'ONE_YEAR', label: '1년' },
  { period: 'THREE_YEAR', label: '3년' },
  { period: 'ALL', label: '전체' },
]

/** 처음 열었을 때 기간. 60봉쯤이 봉 모양과 흐름이 함께 읽히는 길이다 */
const DEFAULT_PERIOD: Period = 'THREE_MONTH'

/**
 * 받아 온 결과는 어느 종목의 것인지(stockCode)를 함께 든다. 같은 라우트 안에서 주소가 A→B로 바뀌면
 * effect가 돌기 전 첫 렌더에 A의 결과가 남아 있어, B 코드 옆에 A의 이름·현재가·차트와 탭 제목이 그려졌다.
 * 렌더에서 코드를 견줘 다르면 불러오는 중으로 본다(아래 view).
 */
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; stockCode: string; detail: StockDetail }
  /** 백엔드 stock 테이블에 없는 종목코드 */
  | { kind: 'notFound'; stockCode: string }
  | { kind: 'error'; stockCode: string }

/**
 * 기간 탭은 서버에 기간마다 다시 묻지 않고 받아 둔 전체 일봉을 여기서 자른다. 상세 API는 일봉은 DB에서 주지만
 * 현재가 하나를 증권사에 물어본다. 탭을 누를 때마다 그 호출이 나가는 건 낭비라 ALL로 한 번 받는다.
 * 시작일은 서버에 period를 보낸 것과 같은 규칙으로 낸다(periodStart).
 */
function sliceByPeriod(candles: Candle[], period: Period): Candle[] {
  const last = candles.at(-1)
  if (last === undefined) return candles

  const start = periodStart(last.date, period)
  // 날짜가 YYYYMMDD 문자열이라 사전순 비교가 곧 날짜순 비교다
  return start === null ? candles : candles.filter((c) => c.date >= start)
}

/**
 * 화면에 적을 종목 이름. 서버가 이름을 비워 보내면(빈 문자열·공백) 종목코드로 대신한다 —
 * 탭 제목이 "JUBY"만 남고 제목 줄의 이름 자리가 비었다. 응답 모양상 null도 올 수 있어 문자열인지부터 본다
 */
function nameOrCode(name: string | null | undefined, stockCode: string | undefined): string {
  return typeof name === 'string' && name.trim() !== '' ? name : (stockCode ?? '')
}

function toRateClassName(rate: number): string | undefined {
  if (isFlatRate(rate)) return styles.flat
  return rate > 0 ? styles.up : styles.down
}

/** 시세 요약 네 칸. 값이 오기 전에도 같은 칸을 그려 자리를 잡아 둔다 */
const SUMMARY_LABELS = ['시가', '고가', '저가', '거래량']

export default function StockChartPage() {
  const { stockCode } = useParams<{ stockCode: string }>()
  /*
   * 목록에서 누르고 왔으면 이름(과 기준일 종가)을 들고 온다. 응답을 기다리는 동안 그 자리를
   * 먼저 채운다. 주소를 직접 열었으면 없다 — 그땐 뼈대를 그린다.
   */
  const location = useLocation()
  const preview =
    stockCode === undefined ? null : readPreview(location.state, stockCode)

  const [state, setState] = useState<State>({ kind: 'loading' })
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD)
  /** '다시 시도'가 1씩 올린다. 같은 종목으로 아래 effect를 한 번 더 돌리는 유일한 방법 */
  const [retryCount, setRetryCount] = useState(0)
  /*
   * 다시 시도가 남기는 표시. 아래 effect가 한 번 쓰고 지운다 — 그 한 번만 방금 받아 둔 값을 쓰지 않고 새로 받는다.
   * retryCount > 0으로 가르면 한 번 누른 뒤로는 화면이 살아 있는 동안 계속 참이라, 다른 종목에 갔다 와도 1분 캐시를 안 썼다
   */
  const freshNextRef = useRef(false)

  /*
   * 종목을 빠르게 갈아타면 먼저 보낸 요청이 나중에 도착해 새 종목 화면을 덮을 수 있다.
   * 그래서 응답을 받는 자리마다 isStale을 본다. 정리 함수는 이미 나간 요청을 취소하지
   * 못하고 '이 응답은 이제 쓸모없다'는 표시만 남긴다(NewsList도 같은 방식이다).
   *
   * 예전에는 요청을 거는 쪽을 isStale로 감쌌는데, 그 자리는 effect 안에서 곧바로
   * 실행돼 검사할 시점에 늘 false였다. 막는 시늉만 하고 아무것도 막지 못했다.
   */
  /*
   * 형식이 틀린 코드면 요청하지 않고 곧바로 "없는 종목"이다. effect에서 막으면 늦는다 —
   * 첫 렌더에 뉴스 목록이 먼저 마운트되고, 자식의 effect가 부모보다 먼저 돌아 요청이 나간다.
   * 그래서 렌더에서 판단해 뉴스 목록을 아예 그리지 않는다(아래 notFound 분기).
   */
  const hasValidCode = stockCode !== undefined && isStockCode(stockCode)

  useEffect(() => {
    if (stockCode === undefined || !hasValidCode) return
    let isStale = false

    setState({ kind: 'loading' })

    // 증권사 초당 제한에 걸리면 500이 온다. 한 번 더 부르면 대개 통과한다
    // 다시 시도로 도는 이번 한 번만 방금 받아 둔 값을 쓰지 않고 새로 받는다
    const fresh = freshNextRef.current
    freshNextRef.current = false
    withRetry(() => getStockDetail(stockCode, 'ALL', { fresh }), 1, 400)
      .then((detail) => {
        if (isStale) return
        setState({ kind: 'ready', stockCode, detail })
      })
      .catch((error: unknown) => {
        if (isStale) return
        if (error instanceof ApiError && error.status === 404) {
          setState({ kind: 'notFound', stockCode })
          return
        }
        console.warn('종목 상세 조회 실패', error)
        setState({ kind: 'error', stockCode })
      })

    return () => {
      isStale = true
    }
  }, [stockCode, hasValidCode, retryCount])

  /*
   * 탭 제목에 종목명을 넣는다. 종목 여러 개를 띄워 두고 비교할 때 탭이 다 'JUBY'면
   * 어느 게 어느 종목인지 알 수 없다. 받아오는 중이면 들고 온 이름을 쓰고,
   * 그것도 없거나 없는 종목·실패일 때는 '종목'으로 둔다.
   */
  // 앞 종목의 결과면 아직 이 종목을 받는 중이다
  const view: State =
    state.kind !== 'loading' && state.stockCode !== stockCode
      ? { kind: 'loading' }
      : state

  useDocumentTitle(
    view.kind === 'ready'
      ? nameOrCode(view.detail.stockName, stockCode)
      : view.kind === 'loading'
        ? (preview?.stockName ?? '종목')
        : '종목',
  )

  if (!hasValidCode || view.kind === 'notFound') {
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

  /*
   * 다시 시도. 받아 둔 값을 먼저 버리고(불러오는 중) 새로 받는다. 구역 경계는 누르는 순간 안쪽을 다시 그리는데,
   * 그때 멈추게 한 옛 값을 그대로 들고 있으면 곧바로 또 멈춰, 새 값이 멀쩡하게 와도 안내가 풀리지 않았다
   * (2026-09-27 재현). 홈 카드의 다시 시도와 같은 방식이다.
   */
  function retry() {
    setState({ kind: 'loading' })
    freshNextRef.current = true
    setRetryCount((count) => count + 1)
  }

  return (
    <>
      {/*
        가격·차트를 그리다 멈춰도 뉴스는 남는다. 다시 시도하면 종목 정보를 새로 받는다.
        오류 경계는 자식이 그리다 난 오류만 받아내므로 이 구역을 PriceSection으로 떼어 뒀다 —
        여기(StockChartPage) 렌더에서 계산하면 경계를 지나쳐 화면 전체가 오류 화면이 된다.
      */}
      {/* 종목이 바뀌면 앞 종목에서 멈춘 상태를 푼다 */}
      <SectionBoundary
        resetKey={stockCode}
        onRetry={retry}
      >
        <PriceSection
          stockCode={stockCode}
          detail={detail}
          preview={preview}
          period={period}
          onPeriodChange={setPeriod}
          failed={view.kind === 'error'}
          onRetry={retry}
        />
      </SectionBoundary>

      {stockCode !== undefined && (
        <section className={styles.section}>
          <NewsList stockCode={stockCode} />
        </section>
      )}
    </>
  )
}

interface PriceSectionProps {
  stockCode: string | undefined
  /** 아직 받아오기 전이면 null. 자리만 잡아 두고 차트 자리에 뼈대를 그린다 */
  detail: StockDetail | null
  /** 목록에서 들고 온 이름·기준일 종가. detail이 오기 전에만 쓴다 */
  preview: StockPreview | null
  period: Period
  onPeriodChange: (period: Period) => void
  /** 종목 정보를 못 받았다. 가격·탭·차트 자리를 안내 상자 하나로 바꾼다 */
  failed: boolean
  onRetry: () => void
}

/** 이름·현재가·기간 탭·차트·마지막 거래일 요약. 구역 오류 경계 안에서 그려진다 */
function PriceSection({
  stockCode,
  detail,
  preview,
  period,
  onPeriodChange,
  failed,
  onRetry,
}: PriceSectionProps) {
  const shown = detail === null ? [] : sliceByPeriod(detail.candles, period)
  const lastCandle = shown.at(-1) ?? null
  const displayName = detail === null ? null : nameOrCode(detail.stockName, stockCode)

  /*
   * 실패는 이 구역 안에서만 알린다. 예전엔 화면 전체를 안내 한 줄로 바꿔, 따로 받는 뉴스까지 사라지고
   * 안내가 왼쪽 위에 붙었다. 이름 줄(모르면 종목코드)과 홈 링크는 두고, 가격·탭·차트 자리를 정상 차트 상자와
   * 같은 높이의 상자 하나로 바꿔 가운데에 알린다. 다시 시도는 종목 정보만 다시 받는다(뉴스는 그대로).
   */
  if (failed) {
    /*
     * 목록에서 들고 온 기준일 종가가 있으면 그거라도 적는다.
     *
     * 상세 응답은 현재가(증권사)와 일봉(DB)을 함께 담는데, 증권사 쪽이 흔들리면 응답 전체가 500이라
     * 일봉까지 못 받는다(2026-10-04 확인). 그때 화면을 통째로 "불러오지 못했습니다"로 두면,
     * 바로 앞 목록에서 이미 보고 온 종가조차 사라져 아무것도 모르는 화면이 된다.
     *
     * 이 값은 현재가가 아니라 기준일 종가다. PriceLines가 날짜를 함께 적어 구분해 준다.
     */
    const hasPreviewPrice = preview?.closePrice !== undefined

    return (
      <section className={styles.section}>
        <Link to="/" className={styles.back}>
          <span aria-hidden="true">‹</span> 홈으로 돌아가기
        </Link>
        {/* 이름을 모르면 종목코드를 이름 자리에 한 번만 적는다 */}
        <h1 className={styles.identity}>
          <span className={styles.name}>{preview?.stockName ?? stockCode}</span>
          {preview !== null && <span className={styles.code}>{stockCode}</span>}
        </h1>

        {hasPreviewPrice && <PriceLines detail={null} preview={preview} />}

        <div className={`${styles.chartBox} ${styles.failBox}`} role="alert">
          {/* 가격을 적어 뒀으면 못 받은 건 차트뿐이다. 다 못 받은 것처럼 말하지 않는다 */}
          <p className={styles.failText}>
            {hasPreviewPrice
              ? '차트를 불러오지 못했습니다'
              : '종목 정보를 불러오지 못했습니다'}
          </p>
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            다시 시도
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.section} aria-busy={detail === null}>
      {/* 뒤로 가기 말고는 목록으로 돌아갈 길이 없었다 */}
      <Link to="/" className={styles.back}>
        <span aria-hidden="true">‹</span> 홈으로 돌아가기
      </Link>

      <h1 className={styles.identity}>
        {/* 이름은 응답에 실려 온다. 목록에서 들고 왔으면 그걸 먼저 쓰고, 없으면 뼈대를 둔다 */}
        <span className={styles.name}>
          {detail !== null ? (
            displayName
          ) : preview !== null ? (
            preview.stockName
          ) : (
            <span className={`${styles.textSkeleton} ${styles.nameSkeleton}`} />
          )}
        </span>
        {/* 이름이 비어 종목코드로 대신했으면 코드를 두 번 적지 않는다 */}
        {displayName !== stockCode && <span className={styles.code}>{stockCode}</span>}
      </h1>

      <PriceLines detail={detail} preview={preview} />

      {/* 탭이 곧 확대·축소다. 받아 둔 전체 일봉을 여기서 잘라 차트에 넘긴다 */}
      <div className={styles.periodTabs} role="tablist" aria-label="기간">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.period}
            type="button"
            role="tab"
            aria-selected={tab.period === period}
            className={
              tab.period === period
                ? `${styles.periodTab} ${styles.periodTabActive}`
                : styles.periodTab
            }
            onClick={() => onPeriodChange(tab.period)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.chartBox}>
        {detail === null && <div className={styles.chartSkeleton} />}

        {detail !== null && shown.length === 0 && (
          <p className={styles.chartMessage}>이 기간에는 거래일이 없습니다.</p>
        )}

        {shown.length > 0 && <CandleChart candles={shown} />}
      </div>

      {/*
        마지막 거래일의 시·고·저·거래량. 현재가 API는 이 값을 안 주고(현재가·등락률뿐),
        일봉 테이블은 장 마감 후 확정값만 들어가므로 "오늘"이 아니라 어느 날인지 함께 적는다.
        응답 전에는 같은 칸을 뼈대로 그려 둔다. 비워 두면 응답이 오는 순간 아래 뉴스가 밀려 내려간다.
      */}
      {detail === null && (
        <>
          <p className={styles.summaryDate}>
            <span className={`${styles.textSkeleton} ${styles.dateSkeleton}`} />
          </p>
          <dl className={styles.summary}>
            {SUMMARY_LABELS.map((label) => (
              <div key={label} className={styles.summaryItem}>
                <dt className={styles.summaryLabel}>{label}</dt>
                <dd className={styles.summaryValue}>
                  <span className={`${styles.textSkeleton} ${styles.valueSkeleton}`} />
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {lastCandle !== null && (
        <>
          {toKoreanDate(lastCandle.date) !== '' && (
            <p className={styles.summaryDate}>
              {toKoreanDate(lastCandle.date)} 마감 기준
            </p>
          )}
          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>시가</dt>
              <dd className={styles.summaryValue}>
                {formatPrice(lastCandle.open)}
              </dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>고가</dt>
              <dd className={`${styles.summaryValue} ${styles.up}`}>
                {formatPrice(lastCandle.high)}
              </dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>저가</dt>
              <dd className={`${styles.summaryValue} ${styles.down}`}>
                {formatPrice(lastCandle.low)}
              </dd>
            </div>
            <div className={styles.summaryItem}>
              <dt className={styles.summaryLabel}>거래량</dt>
              <dd className={styles.summaryValue}>
                {formatVolume(lastCandle.volume)}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}

/**
 * 가격 두 줄. 응답이 오면 현재가·전일 대비, 오기 전엔 목록에서 들고 온 기준일 종가를
 * 흐리게 날짜와 함께 적고(현재가로 읽히면 안 된다), 그것도 없으면 뼈대를 둔다.
 * 예전엔 오기 전에도 "-"를 적어 값이 없는 것과 오는 중인 것을 가를 수 없었다.
 */
function PriceLines({
  detail,
  preview,
}: {
  detail: StockDetail | null
  preview: StockPreview | null
}) {
  if (detail !== null) {
    return (
      <>
        <p className={styles.price}>{formatPrice(detail.currentPrice)}</p>
        <p className={styles.change}>
          전일 대비{' '}
          <span className={toRateClassName(detail.comparePrev)}>
            {formatChangeRate(detail.comparePrev)}
          </span>
        </p>
      </>
    )
  }

  if (preview?.closePrice !== undefined) {
    return (
      <>
        <p className={`${styles.price} ${styles.pricePending}`}>
          {formatPrice(preview.closePrice)}
        </p>
        <p className={styles.change}>
          {toKoreanDate(preview.baseDate)} 종가
          {preview.fluctuate !== undefined && (
            <>
              {' · 전일 대비 '}
              <span className={toRateClassName(preview.fluctuate)}>
                {formatChangeRate(preview.fluctuate)}
              </span>
            </>
          )}
        </p>
      </>
    )
  }

  return (
    <>
      <p className={styles.price}>
        <span className={`${styles.textSkeleton} ${styles.priceSkeleton}`} />
      </p>
      <p className={styles.change}>
        <span className={`${styles.textSkeleton} ${styles.changeSkeleton}`} />
      </p>
    </>
  )
}
