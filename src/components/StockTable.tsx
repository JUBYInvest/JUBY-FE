import { Link } from 'react-router-dom'
import type { MouseEvent } from 'react'
import type { SortDirection, SortKey, SortState, Stock } from '../types/stock'
import {
  formatChangeRate,
  formatPrice,
  formatTradingValue,
  isFlatRate,
} from '../utils/format'
import { toPreviewState } from '../utils/stockPreview'
import styles from './StockTable.module.css'

interface Props {
  stocks: Stock[]
  /** 표 가격이 언제 종가인지(YYYYMMDD). 상세로 넘어갈 때 가격과 함께 싣는다 */
  baseDate: string
  sort: SortState | null
  onSort: (key: SortKey) => void
  favoriteCodes: Set<string>
  onHeartClick: (stockCode: string) => void
}

/**
 * isNumeric인 칸은 자릿수를 견주기 쉽도록 오른쪽에 붙인다.
 * hideAt은 화면이 좁아질 때 가장 먼저 접을 칸을 정한다(거래량 → 종목코드 순).
 */
const SORTABLE_COLUMNS: {
  key: SortKey
  label: string
  isNumeric: boolean
  hideAt?: 'small'
}[] = [
  { key: 'stockName', label: '종목명', isNumeric: false },
  { key: 'closePrice', label: '종가', isNumeric: true },
  { key: 'fluctuate', label: '등락률', isNumeric: true },
  { key: 'tradingValue', label: '거래대금', isNumeric: true, hideAt: 'small' },
]

function SortIcon({ direction }: { direction: SortDirection | null }) {
  const className =
    direction === 'asc' ? `${styles.sortIcon} ${styles.sortIconUp}` : styles.sortIcon

  return (
    <svg className={className} width="10" height="10" viewBox="0 0 10 10">
      <path d="M2 4L5 7L8 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function rateClassName(rate: number): string {
  if (isFlatRate(rate)) return `${styles.numeric} ${styles.flat}`
  return `${styles.numeric} ${rate > 0 ? styles.up : styles.down}`
}

export default function StockTable({
  stocks,
  baseDate,
  sort,
  onSort,
  favoriteCodes,
  onHeartClick,
}: Props) {
  function handleHeartClick(
    event: MouseEvent<HTMLButtonElement>,
    stockCode: string,
  ) {
    // 하트는 행 이동과 별개로 동작해야 한다
    event.preventDefault()
    event.stopPropagation()
    onHeartClick(stockCode)
  }

  return (
    <div className={styles.table}>
      <div className={styles.head}>
        <span />
        <span className={styles.colCode}>종목코드</span>

        {SORTABLE_COLUMNS.map((column) => {
          const direction =
            sort !== null && sort.key === column.key ? sort.direction : null

          const classNames = [styles.sortButton]
          if (direction !== null) classNames.push(styles.sortButtonActive)
          if (column.isNumeric) classNames.push(styles.numericHead)
          if (column.hideAt === 'small') classNames.push(styles.colVolume)

          return (
            <button
              key={column.key}
              type="button"
              className={classNames.join(' ')}
              onClick={() => onSort(column.key)}
              aria-label={`${column.label} 기준 정렬`}
            >
              {column.label}
              <SortIcon direction={direction} />
            </button>
          )
        })}
      </div>

      <ul className={styles.body}>
        {stocks.map((stock) => {
          const isFavorite = favoriteCodes.has(stock.stockCode)

          return (
            <li key={stock.stockCode} className={styles.row}>
              <button
                type="button"
                className={
                  isFavorite ? `${styles.heart} ${styles.heartOn}` : styles.heart
                }
                onClick={(event) => handleHeartClick(event, stock.stockCode)}
                aria-pressed={isFavorite}
                aria-label={`${stock.stockName} 관심종목 ${isFavorite ? '해제' : '추가'}`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={isFavorite ? 'currentColor' : 'none'}
                >
                  <path
                    d="M12 20.3 4.1 12.4a4.9 4.9 0 0 1 6.9-6.9l1 1 1-1a4.9 4.9 0 0 1 6.9 6.9z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <span className={`${styles.code} ${styles.colCode}`}>
                {stock.stockCode}
              </span>

              {/*
                링크는 종목명 하나뿐이고, 그 링크가 ::after로 행 전체를 덮어 어디를 눌러도 이동한다.
                예전에는 행 전체가 <a>고 그 안에 하트 <button>이 있었는데,
                HTML은 <a> 안에 버튼 같은 조작 요소를 넣는 것을 허용하지 않는다.
                하트는 z-index로 덮개 위에 띄워 두어 따로 눌린다.
              */}
              <span className={styles.name}>
                <Link
                  to={`/stocks/${stock.stockCode}`}
                  state={toPreviewState({
                    stockCode: stock.stockCode,
                    stockName: stock.stockName,
                    closePrice: stock.closePrice,
                    fluctuate: stock.fluctuate,
                    baseDate,
                  })}
                  className={styles.nameLink}
                >
                  {stock.stockName}
                </Link>
              </span>

              <span className={styles.numeric}>
                {formatPrice(stock.closePrice)}
              </span>
              <span className={rateClassName(stock.fluctuate)}>
                {formatChangeRate(stock.fluctuate)}
              </span>
              <span className={`${styles.numeric} ${styles.colVolume}`}>
                {formatTradingValue(stock.tradingValue)}
              </span>
            </li>
          )
        })}

        {/* 빈 목록을 머리글만 남긴 채 두면 표가 덜 그려진 건지 종목이 없는 건지 알 수 없다 */}
        {stocks.length === 0 && <li className={styles.empty}>표시할 종목이 없어요</li>}
      </ul>
    </div>
  )
}
