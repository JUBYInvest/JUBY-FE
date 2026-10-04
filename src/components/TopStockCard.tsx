import { Link } from 'react-router-dom'
import CardChart from './CardChart'
import { toKoreanDate } from '../utils/date'
import { formatChangeRate, formatPrice, isFiniteNumber, isFlatRate } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import type { CardQuote, CardSeries, TopTheme } from '../types/stock'
import styles from './TopStockCard.module.css'

interface Props {
  theme: TopTheme
  /**
   * 한 달 그래프. 받는 중이면 null, 이번에는 그릴 수 없으면 'unavailable'
   * (서버에 증권사 토큰이 없어 묻지 않았거나, 물었는데 실패했다 — api/home.ts loadCardSeries).
   */
  series: CardSeries | 'unavailable' | null
  /** 홈 시세표에서 찾은 이 종목의 종가. 시세표가 아직 안 왔거나 이 종목이 없으면 null */
  quote: CardQuote | null
}

/**
 * 테마별 대표 종목 카드. 큰 숫자와 그래프는 한 달 주가 흐름, 맨 아래 줄은 그 그래프가 끝나는 날의 종가다.
 *
 * 큰 숫자는 언제나 "한 달 전 대비"다. 그래프가 없을 때 다른 숫자(전일 대비 등)로 갈아 끼우면 카드마다
 * 같은 자리의 뜻이 달라진다 — 그때는 비워 두고, 전일 대비는 맨 아래 줄에서 본다.
 */
export default function TopStockCard({ theme, series, quote }: Props) {
  const date = quote === null ? '' : toKoreanDate(quote.baseDate)

  return (
    <Link
      to={`/stocks/${theme.stockCode}`}
      /*
       * 시세표의 종가가 있으면 함께 싣는다. 상세 화면은 응답이 오기 전에 이 값으로 가격 자리를 채우고,
       * 상세를 못 받았을 때도 이 종가는 남겨 둔다(StockChartPage). 없으면 이름만 싣는다.
       */
      state={toPreviewState(
        quote === null
          ? { stockCode: theme.stockCode, stockName: theme.stockName }
          : {
              stockCode: theme.stockCode,
              stockName: theme.stockName,
              closePrice: quote.closePrice,
              baseDate: quote.baseDate,
              ...(quote.fluctuate === null ? {} : { fluctuate: quote.fluctuate }),
            },
      )}
      className={styles.card}
    >
      <p className={styles.theme}>{theme.theme}</p>
      <p className={styles.name}>{theme.stockName}</p>

      {series === null ? (
        <CardPlaceholder />
      ) : series === 'unavailable' ? (
        <CardUnavailable />
      ) : (
        <CardChart stock={series} />
      )}

      {/* 그래프가 끝나는 날의 종가. 그래프를 못 그린 카드도 이 줄은 있다 */}
      <p className={styles.quote}>
        <span className={styles.quoteLabel}>{date === '' ? '종가' : `${date} 종가`}</span>
        <span className={styles.quoteValue}>
          {formatPrice(quote?.closePrice)}{' '}
          <span className={toneClass(quote?.fluctuate ?? null)}>
            {formatChangeRate(quote?.fluctuate)}
          </span>
        </span>
      </p>
    </Link>
  )
}

/** 값이 오기 전 자리. 높이를 CardChart와 똑같이 잡아 도착해도 화면이 흔들리지 않는다 */
function CardPlaceholder() {
  return (
    <>
      <p className={styles.rateRow}>
        <span className={`${styles.rate} ${styles.rateEmpty}`}>–</span>
        <span className={styles.caption}>한 달 전 대비</span>
      </p>
      <div className={`${styles.chart} ${styles.chartEmpty}`} />
    </>
  )
}

/**
 * 이번에는 그래프를 그릴 수 없는 카드. 높이는 자리표시와 같게 두되 반짝이지 않는다.
 * 눌러서 들어가면 상세 차트는 볼 수 있다 — 카드가 묻지 않고 남겨 둔 몫이 그 한 번이다.
 */
function CardUnavailable() {
  return (
    <>
      <p className={styles.rateRow}>
        <span className={`${styles.rate} ${styles.rateEmpty}`}>–</span>
        <span className={styles.caption}>한 달 전 대비</span>
      </p>
      <div className={`${styles.chart} ${styles.chartMessage}`}>
        <span>지금은 그래프를 불러올 수 없어요</span>
        <span className={styles.chartHint}>눌러서 차트 보기 ›</span>
      </div>
    </>
  )
}

/** 한국식 등락 색. 오르면 빨강, 내리면 파랑, 보합이거나 모르면 기본 글자색 */
function toneClass(rate: number | null): string {
  if (!isFiniteNumber(rate) || isFlatRate(rate)) return styles.flat
  return rate > 0 ? styles.up : styles.down
}
