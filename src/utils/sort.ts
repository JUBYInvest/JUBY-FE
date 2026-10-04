import { isFiniteNumber } from './format'
import type { SortKey, SortState, Stock } from '../types/stock'

/**
 * 종목명 가나다순 비교. `localeCompare(…, 'ko')`와 같은 결과인데, 그건 비교할 때마다 비교기를 새로 만든다 —
 * 100행을 정렬하면 비교가 수백 번이다. 하나를 만들어 같이 쓴다.
 */
const KO_COLLATOR = new Intl.Collator('ko')

/** 견줄 값. 서버가 필드를 빼거나 null·빈 문자열로 준 행은 null */
function sortValue(stock: Stock, key: SortKey): string | number | null {
  const value: unknown = stock[key]
  if (key === 'stockName') return typeof value === 'string' && value !== '' ? value : null
  return isFiniteNumber(value) ? value : null
}

/**
 * 정렬된 새 배열을 돌려준다. 원본은 건드리지 않는다.
 *
 * 값이 빈 행은 방향과 상관없이 맨 뒤로 보낸다. 빈 값을 그대로 빼면 NaN이 나오는데, 엔진은 이를
 * "같다"로 읽어 **값이 있는 행들까지** 순서가 틀어진다(거래대금 기본 정렬에서 100행 중 빈 행 셋이면
 * 표 중간에 빈 행이 끼고 앞뒤가 뒤섞였다). 종목명이 비면 localeCompare가 던져 표가 통째로 멈췄다.
 */
export function sortStocks(stocks: Stock[], sort: SortState): Stock[] {
  const sign = sort.direction === 'asc' ? 1 : -1

  return [...stocks].sort((a, b) => {
    const left = sortValue(a, sort.key)
    const right = sortValue(b, sort.key)
    if (left === null || right === null) return Number(left === null) - Number(right === null)
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign
    return KO_COLLATOR.compare(String(left), String(right)) * sign
  })
}

/** 정렬 기준을 사람 말로. 좁은 화면에서 거래대금 열이 숨으면 무엇 순인지 이 글로 알린다 */
const SORT_WORDS: Record<SortKey, { asc: string; desc: string }> = {
  stockName: { asc: '종목명 가나다순', desc: '종목명 가나다 역순' },
  closePrice: { asc: '종가 낮은 순', desc: '종가 높은 순' },
  fluctuate: { asc: '등락률 낮은 순', desc: '등락률 높은 순' },
  tradingValue: { asc: '거래대금 적은 순', desc: '거래대금 많은 순' },
}

export function describeSort(sort: SortState): string {
  return SORT_WORDS[sort.key][sort.direction]
}

/** 다른 컬럼을 누르면 기본 방향으로, 같은 컬럼을 다시 누르면 반대 방향으로 */
export function nextSort(current: SortState | null, key: SortKey): SortState {
  if (current !== null && current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }

  return { key, direction: key === 'stockName' ? 'asc' : 'desc' }
}
