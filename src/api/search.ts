import { get, malformedResponse } from './client'
import { isStockCode, nameOrCode } from './stock'
import { sortStocks } from '../utils/sort'
import type { Stock, StockInfo } from '../types/stock'

/*
 * 종목 검색. 가진 목록에서 찾기(searchStocks), 서버 검색(searchStocksRemote), 둘을 합친 순위(rankStocks),
 * 후보를 거래대금 순으로 세우기(byTradingValue). 검색창(components/SearchBar)과 백테스트 종목 칸이 쓴다.
 */


/** 검색창 후보 목록에 한 번에 보여줄 최대 개수 */
const MAX_RESULTS = 8

/**
 * 띄어쓰기와 대소문자를 무시하고 비교하려고 다듬는다. "sk 하이닉스" → "sk하이닉스"
 * 검색창과 홈 거래대금 순위(이름으로 종목을 찾는다 — components/VolumeRank)가 쓴다.
 */
export function normalizeName(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

/** 정확히 일치 → 앞부분 일치 → 그 밖의 순서로 보여주기 위한 정렬 키 */
function matchRank(stock: StockInfo, keyword: string): number {
  const name = normalizeName(stock.stockName)

  if (name === keyword || stock.stockCode === keyword) return 0
  if (name.startsWith(keyword) || stock.stockCode.startsWith(keyword)) return 1
  return 2
}

/** GET /api/stocks/search */
interface SearchRowResponse {
  stockCode?: string | null
  stockName?: string | null
}

/**
 * 서버에서 종목명을 찾는다.
 *
 * **순서는 믿지 않는다.** 서버는 가나다순으로 주므로 "삼성"에 삼성E&A·삼성SDI가 앞을 다 차지하고
 * 정작 찾는 삼성전자가 잘린다. 찾은 종목이 무엇인지만 받아 와서, 순서는 rankStocks가 다시 매긴다.
 *
 * **이것만으로 후보를 정하지 않는다.** 서버는 종목명만 찾아서 종목코드("005930")와 띄어쓴 이름
 * ("sk 하이닉스")은 0건이다. 부르는 쪽이 가진 목록의 결과(searchStocks)와 합쳐 써야 한다.
 *
 * 검색창은 이것이 오기 전에도 가진 목록으로 먼저 후보를 보여 준다(components/SearchBar.tsx).
 * 그래서 이 호출이 늦거나 실패해도 검색이 멈추지 않는다.
 */
export async function searchStocksRemote(keyword: string): Promise<StockInfo[]> {
  const trimmed = keyword.trim()
  if (trimmed === '') return []

  const rows = await get<(SearchRowResponse | null)[] | null>(
    `/api/stocks/search?keyword=${encodeURIComponent(trimmed)}`,
  )
  if (!Array.isArray(rows)) throw malformedResponse()

  return rows.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []
    const { stockCode } = row
    if (typeof stockCode !== 'string' || !isStockCode(stockCode)) return []
    return [{ stockCode, stockName: nameOrCode(row.stockName, stockCode) }]
  })
}

/**
 * 찾아 놓은 후보에 순서를 매긴다. 규칙은 searchStocks와 같다 —
 * 일치 종류(정확→앞부분→그 밖)로 먼저 세우고, 같은 종류 안에서는 거래대금 순으로 둔다.
 *
 * `preferred`는 거래대금 순으로 세운 목록(홈이 가진 것)이다. 여기 없는 종목은 맨 뒤로 보낸다.
 */
export function rankStocks(
  found: StockInfo[],
  keyword: string,
  preferred: StockInfo[],
): StockInfo[] {
  const normalized = normalizeName(keyword)
  if (normalized === '') return []

  const priority = new Map(preferred.map((stock, index) => [stock.stockCode, index]))

  return [...found]
    // 두 번 세운다. sort가 안정 정렬이라 뒤 기준이 같으면 앞 기준의 순서가 남는다
    .sort(
      (a, b) =>
        (priority.get(a.stockCode) ?? Number.MAX_SAFE_INTEGER) -
        (priority.get(b.stockCode) ?? Number.MAX_SAFE_INTEGER),
    )
    .sort((a, b) => matchRank(a, normalized) - matchRank(b, normalized))
    .slice(0, MAX_RESULTS)
}

/**
 * 종목명·종목코드 부분 검색. 넘겨받은 목록에서 찾는다.
 * 목록은 GET /api/stocks 로 받은 것을 쓴다(도착 전에는 stockList.ts의 사본).
 * "삼성"처럼 여러 종목에 걸리는 말은 후보를 전부 돌려주고 고르는 건 화면에 맡긴다.
 *
 * 서버 검색(searchStocksRemote)이 도착하기 전과 실패했을 때 쓰는 길이다.
 *
 * **넘겨주는 목록의 순서가 곧 같은 순위 안의 우선순위다.** 서버 목록은 가나다순이라
 * 그대로 쓰면 "삼성"에 삼성E&A·삼성SDI·…·삼성전기가 앞을 다 차지하고 삼성전자가 잘린다.
 * 부르는 쪽이 거래대금 순으로 세워서 넘기면 사람들이 찾는 종목이 먼저 온다.
 */
export function searchStocks(stocks: StockInfo[], keyword: string): StockInfo[] {
  const normalized = normalizeName(keyword)
  if (normalized === '') return []

  return stocks
    .filter(
      (stock) =>
        normalizeName(stock.stockName).includes(normalized) ||
        stock.stockCode.includes(normalized),
    )
    /*
     * 일치 종류로만 세우고, 같은 종류 안에서는 넘겨받은 순서(거래대금 순)를 그대로 둔다(sort는 안정 정렬).
     * 이름 길이를 먼저 보면 "SK"에 SK하이닉스가 4번째, "삼성"에 거래대금 1위가 맨 뒤로 밀린다.
     * "삼성전자"를 치면 정확히 같은 삼성전자가 앞부분만 같은 삼성전자우보다 먼저 온다(일치 종류).
     */
    .sort((a, b) => matchRank(a, normalized) - matchRank(b, normalized))
    .slice(0, MAX_RESULTS)
}

/**
 * 거래대금 큰 순. 검색 후보에 쓴다 — 찾는 종목이 위에 오게.
 * 홈 시세표 정렬과 같은 규칙이라 거래대금이 빈 종목은 맨 뒤로 간다(sortStocks)
 */
export function byTradingValue(stocks: Stock[]): Stock[] {
  return sortStocks(stocks, { key: 'tradingValue', direction: 'desc' })
}
