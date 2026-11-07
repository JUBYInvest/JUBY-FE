import { Link } from 'react-router-dom'
import CardChart from './CardChart'
import { toKoreanDate } from '../utils/date'
import { formatChangeRate, formatPrice, rateTone } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import type { CardQuote, CardSeries, TopTheme } from '../types/stock'
import styles from './TopStockCard.module.css'

interface Props {
  theme: TopTheme
  /**
   * 1년 그래프. 받는 중이면 null, 이번에는 그릴 수 없으면 'unavailable'
   * (서버에 증권사 토큰이 없어 묻지 않았거나, 물었는데 실패했다 — api/home.ts loadCardSeries).
   */
  series: CardSeries | 'unavailable' | null
  /** 홈 시세표에서 찾은 이 종목의 종가. 시세표가 아직 안 왔거나 이 종목이 없으면 null */
  quote: CardQuote | null
  /** 카드에 기준일을 적는가. 세 카드가 같은 날이면 홈이 구역 제목 줄에 한 번만 적고 false를 준다 */
  showDate: boolean
}

/**
 * 테마별 대표 종목 칸. 이름 아래 그래프가 끝나는 날의 종가, 그 아래 1년 그래프와 "1년 전보다 ±x%"다.
 * "큰 % + 작은 라벨 + 그래프"를 담은 타일은 AI가 만든 화면의 흔한 꼴이라 쓰지 않고, 같은 값을 한 줄씩 적는다.
 * 1년인 까닭: 한 달 등락을 크게 적으면 그 한 달 때문에 뽑힌 것처럼 읽힌다. 종목은 백테스트 결과로
 * 고르지 않는다 — 백엔드가 테마마다 정해 둔 종목이다(JUBY-BE LeadingStockTheme).
 *
 * "1년 전보다" 숫자는 언제나 1년간 주가 변화다. 전략 수익률이 아니다. 그래프가 없을 때 다른 숫자(전일 대비 등)로 갈아 끼우면 카드마다
 * 같은 자리의 뜻이 달라진다 — 그때는 비워 두고, 전일 대비는 맨 아래 줄에서 본다.
 */
export default function TopStockCard({ theme, series, quote, showDate }: Props) {
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
      <p className={styles.top}>
        <span className={styles.theme}>{theme.theme}</span>
        {showDate && date !== '' && <span className={styles.quoteLabel}>{date} 종가</span>}
      </p>
      <p className={styles.name}>{theme.stockName}</p>
      {/*
        그래프가 끝나는 날의 종가와 그 전 거래일 대비. 그래프를 못 그린 카드도 이 줄은 있다.
        등락률 앞에 "전날보다"를 적는다 — 아래 1년 그래프·"1년 전보다"와 색이 엇갈리면(1년은 올랐는데 하루는 내림) 무엇이 올랐는지 안 읽혔다(2026-11-07 사용자)
      */}
      <p className={styles.quote}>
        <span className={styles.price}>{formatPrice(quote?.closePrice)}</span>{' '}
        {/* 전일 대비를 모르면 이름도 적지 않는다("전날보다 -"가 되지 않게) */}
        {quote?.fluctuate != null && (
          <span className={styles.daily}>
            <span className={styles.caption}>전날보다</span>{' '}
            <span className={styles[rateTone(quote.fluctuate)]}>{formatChangeRate(quote.fluctuate)}</span>
          </span>
        )}
      </p>

      {series === null ? (
        <CardPlaceholder />
      ) : series === 'unavailable' ? (
        <CardUnavailable />
      ) : (
        <CardChart stock={series} />
      )}
    </Link>
  )
}

/** 값이 오기 전 자리. 높이를 CardChart와 똑같이 잡아 도착해도 화면이 흔들리지 않는다 */
function CardPlaceholder() {
  return (
    <>
      <div className={`${styles.chart} ${styles.chartEmpty}`} />
      <p className={styles.yearRow}>
        <span className={styles.caption}>1년 전보다</span>
        <span className={`${styles.rate} ${styles.rateEmpty}`}>–</span>
      </p>
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
      <div className={`${styles.chart} ${styles.chartMessage}`}>
        <span>지금은 그래프를 불러올 수 없어요</span>
        <span className={styles.chartHint}>눌러서 차트 보기 ›</span>
      </div>
      <p className={styles.yearRow}>
        <span className={styles.caption}>1년 전보다</span>
        <span className={`${styles.rate} ${styles.rateEmpty}`}>–</span>
      </p>
    </>
  )
}
