import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import CandleChart from './CandleChart'
import { useRealtime } from '../api/realtime'
import { nameOrCode } from '../api/stock'
import { periodStart, toKoreanDate, toKoreanDateTime } from '../utils/date'
import { formatChangeRate, formatPrice, formatVolume, rateTone } from '../utils/format'
import type { Candle, Period, StockDetail, StockPreview } from '../types/stock'
import styles from '../pages/StockChartPage.module.css'

/*
 * 종목 상세의 가격 구역(2026-10-31 pages/StockChartPage.tsx에서 나눔) — 머리 띠(이름·가격·바로 가기) | 차트 열(기간 탭·차트) | 정보 열
 * (시세 요약·기간별 변화)과 실패·임시 차트 상자. 상태(무엇을 받았나·기다리나)는 화면(StockChartPage)과 hooks/useStockDetail이 정하고
 * 여기는 받은 값을 그리기만 한다. 스타일은 화면의 모듈(StockChartPage.module.css)을 그대로 쓴다 — 격자 칸 이름이 거기 있다.
 */

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

/** 비어 온 등락률("-")은 보합처럼 검정으로 둔다(utils/format rateTone) */
function toRateClassName(rate: number | null): string {
  return styles[rateTone(rate)]
}

/** 시세 요약 네 칸. 값이 오기 전에도 같은 칸을 그려 자리를 잡아 둔다 */
const SUMMARY_LABELS = ['시가', '고가', '저가', '거래량']

/**
 * 마지막 거래일의 시·고·저·거래량. 현재가 API는 이 값을 안 주고(현재가·등락률뿐), 일봉 테이블은 장 마감 후 확정값만
 * 들어가므로 "오늘"이 아니라 어느 날인지 함께 적는다. 응답 전에는 같은 칸을 뼈대로 그려 둔다.
 * 고가·저가는 등락이 아니라 색을 주지 않는다(빨강·파랑은 등락 전용)
 */
function SummaryCard({ lastCandle, loading }: { lastCandle: Candle | null; loading: boolean }) {
  const date = lastCandle === null ? '' : toKoreanDate(lastCandle.date)
  const values =
    lastCandle === null
      ? null
      : [formatPrice(lastCandle.open), formatPrice(lastCandle.high), formatPrice(lastCandle.low), formatVolume(lastCandle.volume)]

  if (!loading && values === null) return null

  return (
    <section className={styles.summaryCard} aria-label="시세 요약">
      <div className={styles.summaryHead}>
        <h2 className={styles.summaryTitle}>시세 요약</h2>
        {loading ? (
          <span className={styles.summaryDate}>
            <span className={`${styles.textSkeleton} ${styles.dateSkeleton}`} />
          </span>
        ) : (
          date !== '' && <span className={styles.summaryDate}>{date} 마감 기준</span>
        )}
      </div>
      <dl className={styles.summary}>
        {SUMMARY_LABELS.map((label, index) => (
          <div key={label}>
            <dt className={styles.summaryLabel}>{label}</dt>
            <dd className={styles.summaryValue}>
              {values === null ? (
                <span className={`${styles.textSkeleton} ${styles.valueSkeleton}`} />
              ) : (
                values[index]
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
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
  /** 실패해서 다시 부르기를 기다리는 중이면 언제 보내는지. 차트 자리에 남은 시간을 적는다 */
  waiting: { until: number } | null
  /** 종목 정보를 못 받았다. 가격·탭·차트 자리를 안내 상자 하나로 바꾼다 */
  failed: boolean
  /** 상세를 못 받는 동안 그릴 임시 차트의 일봉(증권사 기간별 시세). 없으면 null */
  backup: Candle[] | null
  onRetry: () => void
  /** 종목명 옆 관심종목 토글(LikeToggle) */
  likeToggle: ReactNode
  /** 관심종목 목록을 못 받았거나 토글을 되돌렸을 때의 안내. 없으면 null */
  likeStatus: ReactNode
  /** 오른쪽 열 바로 가기 카드(ActionPanel) */
  actionPanel: ReactNode
}

/** 이름·현재가·차트 카드(기간 탭 포함)·오른쪽 열(바로 가기·시세 요약). 구역 오류 경계 안에서 그려진다 */
export default function PriceSection({
  stockCode,
  detail,
  preview,
  period,
  onPeriodChange,
  waiting,
  failed,
  backup,
  onRetry,
  likeToggle,
  likeStatus,
  actionPanel,
}: PriceSectionProps) {
  /*
   * 렌더마다 새 배열을 만들면 CandleChart가 "봉이 바뀌었다"고 보고 setData + fitContent를 다시 해, 하트를 누르거나 관심종목
   * 목록이 늦게 올 때마다 확대해 둔 차트가 전체 보기로 돌아가고 범례가 사라졌다(2026-10-31). 일봉·기간이 바뀔 때만 자른다
   */
  const shown = useMemo(() => (detail === null ? [] : sliceByPeriod(detail.candles, period)), [detail, period])
  const lastCandle = shown.at(-1) ?? null
  const displayName = detail === null ? null : nameOrCode(detail.stockName, stockCode ?? '')

  /*
   * 실패는 이 구역 안에서만 알린다. 예전엔 화면 전체를 안내 한 줄로 바꿔, 따로 받는 뉴스까지 사라지고
   * 안내가 왼쪽 위에 붙었다. 이름 줄(모르면 종목코드)과 홈 링크는 두고, 탭·차트 자리를 정상 차트 카드와
   * 같은 높이의 상자 하나로 바꿔 가운데에 알린다. 다시 시도는 종목 정보만 다시 받는다(뉴스는 그대로).
   */
  /*
   * 상세를 못 받는 동안 임시 차트가 왔으면(로그인했을 때, 위 StockChartPage "임시 차트") 실패 상자 대신 그 차트를 그린다.
   * 머리 띠와 정보 열(시세 요약)은 정상 화면과 같은 자리다. 기간 탭은 두지 않는다 — 임시 차트는 100거래일 남짓이라 6개월·1년이 거짓이 된다.
   * 가격은 목록에서 들고 온 종가가 있으면 그것, 없으면 임시 차트의 마지막 종가를 "N월 N일 종가"로 흐리게 적는다(현재가가 아니다)
   */
  if (detail === null && backup !== null && stockCode !== undefined) {
    const shownPreview = preview?.closePrice !== undefined ? preview : previewFromCandles(stockCode, preview, backup)
    return (
      <>
        <header className={styles.band}>
          <Link to="/" className={styles.back}>
            <span aria-hidden="true">‹</span> 홈으로 돌아가기
          </Link>
          <h1 className={styles.identity}>
            <span className={styles.name}>{preview?.stockName ?? stockCode}</span>
            {preview !== null && <span className={styles.code}>{stockCode}</span>}
          </h1>
          <div className={styles.bandLike}>{likeToggle}</div>
          {likeStatus}
          <div className={styles.bandPrice}>
            <PriceLines detail={null} preview={shownPreview} />
          </div>
          <div className={styles.bandActs}>{actionPanel}</div>
        </header>

        <BackupChart candles={backup} waiting={waiting} failed={failed} onRetry={onRetry} />

        <div className={styles.info}>
          <SummaryCard lastCandle={backup.at(-1) ?? null} loading={false} />
        </div>
      </>
    )
  }

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
      <>
        <header className={styles.band}>
          <Link to="/" className={styles.back}>
            <span aria-hidden="true">‹</span> 홈으로 돌아가기
          </Link>
          {/* 이름을 모르면 종목코드를 이름 자리에 한 번만 적는다 */}
          <h1 className={styles.identity}>
            <span className={styles.name}>{preview?.stockName ?? stockCode}</span>
            {preview !== null && <span className={styles.code}>{stockCode}</span>}
          </h1>
          <div className={styles.bandLike}>{likeToggle}</div>
          {likeStatus}
          {hasPreviewPrice && (
            <div className={styles.bandPrice}>
              <PriceLines detail={null} preview={preview} />
            </div>
          )}
          {/* 상세가 실패해도(대개 증권사 쪽) 바로 가기는 DB·서버 AI라 쓸 수 있다 */}
          <div className={styles.bandActs}>{actionPanel}</div>
        </header>

        {/* 정보 열에 그릴 값이 없다. 정보 열 자리까지 넓게 쓴다 */}
        <div className={styles.chartColumnFull}>
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
        </div>
      </>
    )
  }

  /*
   * 세 조각을 내보낸다 — 머리 띠(이름·가격·바로 가기) | 차트 열 | 정보 열(시세 요약·기간별 변화). 뉴스 열과 함께 바깥 격자
   * (StockChartPage.module.css .layout) 하나에 놓여, 머리 띠 아래 굵은 먹 선 하나에서 세 칸이 같은 높이로 시작한다(2026-10-30 사용자
   * 요청 "세 화면이 따로 붙인 느낌"). 순서는 휴대폰에서 쌓이는 순서(머리 띠 → 차트 → 시세 요약)이고, 넓은 화면은 격자 칸 이름으로 정보 열을
   * 차트 왼쪽에 둔다. 정보 열에는 누를 것이 없어 Tab 순서는 보이는 순서와 어긋나지 않는다
   */
  return (
    <>
      <header className={styles.band}>
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
        <div className={styles.bandLike}>{likeToggle}</div>
        {likeStatus}

        <div className={styles.bandPrice}>
          <PriceLines detail={detail} preview={preview} />
        </div>
        <div className={styles.bandActs}>{actionPanel}</div>
      </header>

      <section className={styles.chartColumn} aria-label="차트" aria-busy={detail === null}>
        <div className={styles.chartBox}>
          {/* 탭이 곧 확대·축소다. 받아 둔 전체 일봉을 여기서 잘라 차트에 넘긴다. 이 줄이 차트 열의 머리다 */}
          <div className={styles.periodTabs} role="tablist" aria-label="기간">
            {PERIOD_TABS.map((tab) => (
              <button
                key={tab.period}
                type="button"
                role="tab"
                aria-selected={tab.period === period}
                className={
                  tab.period === period
                    ? styles.periodTabActive
                    : styles.periodTab
                }
                onClick={() => onPeriodChange(tab.period)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={styles.plot}>
            {detail === null && waiting !== null && (
              <WaitNotice until={waiting.until} />
            )}
            {detail === null && waiting === null && <div className={styles.chartSkeleton} />}

            {detail !== null && shown.length === 0 && (
              <p className={styles.chartMessage}>이 기간에는 거래일이 없습니다.</p>
            )}

            {shown.length > 0 && <CandleChart candles={shown} />}
          </div>
        </div>
      </section>

      <div className={styles.info}>
        <SummaryCard lastCandle={lastCandle} loading={detail === null} />
        {detail !== null && <PeriodStats candles={detail.candles} />}
      </div>
    </>
  )
}

/** 기간별 주가 변화 칸. 기간 탭과 같은 순서·이름이다(3년·전체는 뺀다 — 1년 최고·최저가 그 자리를 쓴다) */
const STAT_PERIODS: { period: Period; label: string }[] = PERIOD_TABS.filter(
  (tab) => tab.period !== 'THREE_YEAR' && tab.period !== 'ALL',
)

/**
 * 기간별 주가 변화와 1년 최고·최저(2026-10-30 사용자 결정 — 16:9에서 차트 아래가 비었다).
 * 상세가 이미 받은 전체 일봉(period=ALL)으로 계산해 요청은 늘지 않는다. 기준은 마지막 일봉의 종가이고,
 * 시작일은 기간 탭과 같은 규칙(periodStart)이다 — 그 날 이후 첫 거래일의 종가와 견준다.
 * 계산할 수 없는 칸(그 기간에 일봉이 없거나 종가가 0)은 "-"다
 */
function PeriodStats({ candles }: { candles: Candle[] }) {
  const last = candles.at(-1)
  if (last === undefined) return null

  const rates = STAT_PERIODS.map(({ period, label }) => {
    const start = periodStart(last.date, period)
    const first = start === null ? undefined : candles.find((c) => c.date >= start)
    const rate =
      first === undefined || first.close === 0 ? null : (last.close / first.close - 1) * 100
    return { period, label, rate }
  })

  const yearStart = periodStart(last.date, 'ONE_YEAR')
  const year = yearStart === null ? candles : candles.filter((c) => c.date >= yearStart)
  const high = year.reduce((top, c) => (c.high > top.high ? c : top), year[0])
  const low = year.reduce((bottom, c) => (c.low < bottom.low ? c : bottom), year[0])
  const baseDate = toKoreanDate(last.date)

  // 시세 요약과 같은 모양(머리 줄 + 한 줄에 이름 | 값)이다. 기준일은 머리 줄 오른쪽에 둔다
  return (
    <section className={styles.summaryCard} aria-label="기간별 주가 변화">
      <div className={styles.summaryHead}>
        <h2 className={styles.summaryTitle}>기간별 주가 변화</h2>
        {baseDate !== '' && <span className={styles.summaryDate}>{baseDate} 종가 기준</span>}
      </div>
      <dl className={styles.summary}>
        {rates.map(({ period, label, rate }) => (
          <div key={period}>
            <dt className={styles.summaryLabel}>{label}</dt>
            <dd className={`${styles.summaryValue} ${toRateClassName(rate)}`}>{formatChangeRate(rate)}</dd>
          </div>
        ))}
        <div>
          <dt className={styles.summaryLabel}>
            1년 최고<small className={styles.summaryWhen}>{toKoreanDate(high.date)}</small>
          </dt>
          <dd className={styles.summaryValue}>{formatPrice(high.high)}</dd>
        </div>
        <div>
          <dt className={styles.summaryLabel}>
            1년 최저<small className={styles.summaryWhen}>{toKoreanDate(low.date)}</small>
          </dt>
          <dd className={styles.summaryValue}>{formatPrice(low.low)}</dd>
        </div>
      </dl>
    </section>
  )
}

/** until까지 남은 초. 0초는 적지 않는다 — 그때는 이미 요청을 보내 '불러오는 중'으로 바뀐다 */
function useSecondsLeft(until: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // 1초마다 세면 타이머가 조금씩 밀려 숫자를 건너뛸 때가 있어 더 자주 본다
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  return Math.max(1, Math.ceil((until - now) / 1000))
}

/**
 * 실패해서 다시 부르기를 기다리는 동안 차트 자리에 적는 안내. 남은 초를 센다.
 * 말없이 뼈대만 1분 가까이 두면 멈춘 것처럼 보여서, 언제 다시 부르는지를 적는다.
 */
function WaitNotice({ until }: { until: number }) {
  const seconds = useSecondsLeft(until)

  return (
    <div className={styles.chartWait}>
      <p className={styles.chartWaitTitle}>{seconds}초 뒤에 차트를 다시 불러옵니다</p>
      <p className={styles.chartMessage}>서버가 잠시 응답하지 못했습니다.</p>
    </div>
  )
}

/** 임시 차트의 마지막 봉으로 지은 가격 줄(기준일 종가 · 전일 대비). 이름은 목록에서 들고 온 것, 없으면 종목코드다 */
function previewFromCandles(stockCode: string, preview: StockPreview | null, candles: Candle[]): StockPreview | null {
  const last = candles.at(-1)
  if (last === undefined) return preview
  const previous = candles.at(-2)
  const result: StockPreview = {
    stockCode,
    stockName: preview?.stockName ?? stockCode,
    closePrice: last.close,
    baseDate: last.date,
  }
  if (previous !== undefined && previous.close > 0) result.fluctuate = (last.close / previous.close - 1) * 100
  return result
}

/**
 * 상세를 못 받는 동안의 임시 차트(증권사 기간별 시세, 최근 100거래일 남짓). 차트 열 머리는 기간 탭 자리와 같은 높이의 제목 줄이고,
 * 아래에 왜 임시인지와 다음 할 일(기다리는 중이면 남은 초, 끝내 실패면 다시 시도)을 적는다
 */
function BackupChart({
  candles,
  waiting,
  failed,
  onRetry,
}: {
  candles: Candle[]
  waiting: { until: number } | null
  failed: boolean
  onRetry: () => void
}) {
  return (
    <section className={styles.chartColumn} aria-label="임시 차트">
      <div className={styles.chartBox}>
        <div className={styles.backupHead}>
          <h2 className={styles.backupTitle}>최근 {candles.length}거래일 차트</h2>
          <span className={styles.backupSource}>증권사 기간별 시세</span>
        </div>
        <div className={styles.plot}>
          <CandleChart candles={candles} />
        </div>
        <div className={styles.backupNotice}>
          <p className={styles.backupText} role="status">
            종목 정보를 받지 못해 증권사 시세로 임시 차트를 그렸어요.
          </p>
          {failed && (
            <button type="button" className={styles.retryButton} onClick={onRetry}>
              다시 시도
            </button>
          )}
          {!failed && waiting !== null && <RetryCountdown until={waiting.until} />}
        </div>
      </div>
    </section>
  )
}

function RetryCountdown({ until }: { until: number }) {
  const seconds = useSecondsLeft(until)
  return <p className={styles.backupCountdown}>{seconds}초 뒤에 종목 정보를 다시 불러와요</p>
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
  const realtime = useRealtime()
  if (detail !== null) {
    // 장중에는 실시간 연결의 값으로 바꿔 그린다(api/realtime.ts). 아래 시세 요약은 마지막 거래일 마감 값 그대로다
    const tick = realtime.live ? realtime.prices.get(detail.stockCode) : undefined
    const rate = tick?.changeRate ?? detail.comparePrev
    const asOf = tick !== undefined ? '실시간' : toKoreanDateTime(detail.receivedAt) !== '' ? `${toKoreanDateTime(detail.receivedAt)} 기준` : ''
    return (
      <>
        <p className={styles.price}>
          <PriceText value={tick?.price ?? detail.currentPrice} />
        </p>
        <p className={styles.change}>
          전일 대비{' '}
          <span className={toRateClassName(rate)}>{formatChangeRate(rate)}</span>
          {asOf !== '' && <span className={styles.asOf}>{asOf}</span>}
        </p>
      </>
    )
  }

  if (preview?.closePrice !== undefined) {
    return (
      <>
        <p className={`${styles.price} ${styles.pricePending}`}>
          <PriceText value={preview.closePrice} />
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

/**
 * 큰 가격. 숫자는 로고와 같은 넓은 글꼴(--font-wide), "원"은 본문 글꼴로 작게 적는다(시안 B).
 * 넓은 글꼴의 % 기호·한글은 어색해 숫자만 넓은 글꼴로 둔다. 값이 없으면 "-" 그대로다
 */
function PriceText({ value }: { value: number | null | undefined }) {
  const text = formatPrice(value)
  if (!text.endsWith('원')) return text
  return (
    <>
      <span className={styles.priceNumber}>{text.slice(0, -1)}</span>
      <span className={styles.priceUnit}>원</span>
    </>
  )
}
