import { Link } from 'react-router-dom'
import { toKoreanDate } from '../utils/date'
import { formatChangeRate, formatPrice, isFiniteNumber, isFlatRate } from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import type { CardQuote, TopTheme } from '../types/stock'
import styles from './TopStockCard.module.css'

interface Props {
  theme: TopTheme
  /** 대장주를 뽑은 기간. 예: "1년". 모르면 null */
  periodLabel: string | null
  /**
   * 서버에 물어본 결과가 나왔는가(성공이든 고정 목록으로 물러섰든).
   * false면 아직 오는 중이라 수익률 자리를 비워 두고, true인데 수익률이 없으면 못 받은 것이다.
   */
  settled: boolean
  /** 홈 시세표에서 찾은 이 종목의 종가. 시세표가 아직 안 왔거나 이 종목이 없으면 null */
  quote: CardQuote | null
}

/**
 * 테마별 대표 종목 카드. 위쪽이 전략 수익률, 아래쪽이 종가다.
 *
 * 둘은 뜻이 다르다. 수익률은 "이 전략으로 이 종목을 그 기간 사고팔았다면"의 성적이고,
 * 종가는 지금 이 종목의 값이다. 섞여 읽히지 않게 위아래로 나누고 각각 무엇인지 적는다.
 *
 * 카드에 필요한 값은 전부 DB만 읽는 API에서 온다. 그래서 세 장이 늘 함께 그려진다.
 */
export default function TopStockCard({ theme, periodLabel, settled, quote }: Props) {
  const { returnRate, tradeCount } = theme
  const hasRate = settled && returnRate !== null
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

      {/* 오는 중이거나 못 받았으면 같은 회색 자리표시. 큰 글자로 진하게 "-"를 찍으면 값처럼 보인다 */}
      <p className={`${styles.rate} ${hasRate ? toneClass(returnRate) : styles.rateEmpty}`}>
        {hasRate ? formatChangeRate(returnRate, 1) : '–'}
      </p>
      <p className={styles.caption}>{describeReturn(periodLabel, tradeCount, settled, returnRate)}</p>

      <dl className={styles.quote}>
        <div className={styles.quoteRow}>
          <dt>{date === '' ? '종가' : `${date} 종가`}</dt>
          <dd>{formatPrice(quote?.closePrice)}</dd>
        </div>
        <div className={styles.quoteRow}>
          <dt>전일 대비</dt>
          <dd className={toneClass(quote?.fluctuate ?? null)}>
            {formatChangeRate(quote?.fluctuate)}
          </dd>
        </div>
      </dl>
    </Link>
  )
}

/** 한국식 등락 색. 오르면 빨강, 내리면 파랑, 보합이거나 모르면 기본 글자색 */
function toneClass(rate: number | null): string {
  if (!isFiniteNumber(rate) || isFlatRate(rate, 1)) return styles.flat
  return rate > 0 ? styles.up : styles.down
}

/**
 * 수익률 밑에 붙는 설명. 숫자가 무엇의 수익률인지부터 밝힌다 — 주가 등락률로 읽히면 안 된다.
 *
 * 매매 횟수를 함께 적는 이유: 전략이 한 번도 사고팔지 않으면 수익률이 0%로 나온다.
 * "0%"만 보면 제자리였던 것처럼 읽히는데, 실제로는 신호가 한 번도 안 나온 것이다.
 */
function describeReturn(
  periodLabel: string | null,
  tradeCount: number | null,
  settled: boolean,
  returnRate: number | null,
): string {
  const what = periodLabel === null ? '전략 수익률' : `${periodLabel} 전략 수익률`
  if (!settled) return what
  if (returnRate === null) return '전략 수익률을 받지 못했어요'
  return tradeCount === null ? what : `${what} · 매매 ${tradeCount}회`
}
