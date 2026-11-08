import { get, malformedResponse } from './client'
import { readMemo, writeMemo, type Memo } from './memo'
import { kstNow, shiftYmd } from '../utils/date'
import { numberFromText } from '../utils/format'
import type { VolumeRankItem } from '../types/market'
import type { Candle } from '../types/stock'

/*
 * 증권사 직통 API 중 화면이 쓰는 둘(휴장일은 api/marketCalendar.ts).
 * 둘 다 요청마다 증권사를 부른다(JUBY-BE MarketService). 그래서 **사용자가 무언가 한 뒤에만** 부른다.
 * - 실시간 거래대금 순위 `GET /api/market/volume-rank` — 홈 '현재 주가 보기'의 '실시간 거래대금 순위' 탭을 누를 때. 1분 메모.
 * - 기간별 시세 `GET /api/market/{code}/daily_itemchartprice` — 들어온 종목 상세가 실패했을 때 그 종목 하나의 임시 차트.
 *   백엔드가 **모의투자 토큰**으로 부른다(getPeriodStockPrice) — 상세가 실패하는 흔한 까닭(실전 토큰 "1분 1회 발급")과 겹치지 않는다.
 * 둘 다 로그인해야 열린다(`/api/market/**`). 응답은 증권사 칸 이름(stck_prpr 등)·문자열 숫자 그대로다(백엔드 DTO의 @JsonProperty).
 * 스웨거는 같은 이름(Output)의 응답 모양 셋을 하나로 합쳐 보여 줘 틀리다 — 모양은 백엔드 소스에서 옮겼다.
 *
 * 쓰지 않는 것: `GET /api/market/{code}/daily-stock`(최근 30일 일봉)은 위 기간별 시세(최대 100일)에 들어 있는 값이라 같은 자리에 둘을 부르지 않는다.
 */

interface VolumeRankResponse {
  /** 종목명 */
  hts_kor_isnm?: string | null
  /** 순위 */
  data_rank?: string | number | null
  /** 현재가 */
  stck_prpr?: string | number | null
  /** 평균 거래대금 */
  avrg_tr_pbmn?: string | number | null
}

const RANK_MEMO_AGE = 60 * 1000
const rankMemo = new Map<string, Memo<VolumeRank>>()

interface VolumeRank {
  items: VolumeRankItem[]
  /** 받은 때(화면이 "HH:MM 기준"으로 적는다) */
  receivedAt: number
}

/**
 * 실시간 거래대금 순위(증권사가 주는 30줄, 거래금액순). 1분 안에 다시 열면 받아 둔 값이다 — 탭을 오갈 때마다 증권사를 부르지 않는다.
 * 응답에 종목코드가 없다(백엔드가 이름·순위·현재가·평균 거래대금만 옮긴다). 상세로 가는 길은 화면이 이름으로 찾는다.
 */
export async function getVolumeRank(): Promise<VolumeRank> {
  const remembered = readMemo(rankMemo, 'rank', RANK_MEMO_AGE)
  if (remembered !== null) return remembered
  const response = await get<(VolumeRankResponse | null)[] | null>('/api/market/volume-rank')
  if (!Array.isArray(response)) throw malformedResponse()
  const rank: VolumeRank = { items: response.flatMap(toRankItem).sort((left, right) => left.rank - right.rank), receivedAt: Date.now() }
  writeMemo(rankMemo, 'rank', rank, RANK_MEMO_AGE)
  return rank
}

function toRankItem(row: VolumeRankResponse | null): VolumeRankItem[] {
  if (typeof row !== 'object' || row === null) return []
  const stockName = typeof row.hts_kor_isnm === 'string' ? row.hts_kor_isnm.trim() : ''
  const rank = numberFromText(row.data_rank)
  if (stockName === '' || rank === null) return []
  return [{ rank, stockName, price: numberFromText(row.stck_prpr), averageTradingValue: numberFromText(row.avrg_tr_pbmn) }]
}

interface PeriodPriceResponse {
  stck_bsop_date?: string | null
  stck_oprc?: string | number | null
  stck_hgpr?: string | number | null
  stck_lwpr?: string | number | null
  stck_clpr?: string | number | null
  acml_vol?: string | number | null
}

/** 증권사가 한 번에 주는 봉은 100개까지다. 그 100거래일이 들어가는 달력 날짜(주말·공휴일 포함)만큼 거슬러 묻는다 */
const BACKUP_CALENDAR_DAYS = 150
const BACKUP_MEMO_AGE = 5 * 60 * 1000
const backupMemo = new Map<string, Memo<Candle[]>>()

/**
 * 임시 차트용 최근 일봉(오래된 날부터). 그릴 수 없는 봉(날짜가 여덟 자리가 아니거나 가격이 빈 날)은 뺀다 — 상세의 일봉과 같은 규칙.
 * 들어오자마자(상세 실패 뒤) 부르는 요청이라 401이어도 로그인 화면으로 끌고 가지 않는다.
 */
export async function getBackupCandles(stockCode: string): Promise<Candle[]> {
  const remembered = readMemo(backupMemo, stockCode, BACKUP_MEMO_AGE)
  if (remembered !== null) return remembered

  const endDate = kstNow().ymd
  const startDate = shiftYmd(endDate, -BACKUP_CALENDAR_DAYS)
  const query = new URLSearchParams({ startDate, endDate })
  const response = await get<(PeriodPriceResponse | null)[] | null>(
    `/api/market/${encodeURIComponent(stockCode)}/daily_itemchartprice?${query}`,
    { ignoreUnauthorized: true, timeoutMs: 8_000, countsTowardBreaker: false },
  )
  if (!Array.isArray(response)) throw malformedResponse()

  // 증권사는 최근 날부터 준다. 날짜가 겹치면 하나만 둔다
  const byDate = new Map<string, Candle>()
  for (const candle of response.flatMap(toCandle)) byDate.set(candle.date, candle)
  const candles = [...byDate.values()].sort((left, right) => (left.date < right.date ? -1 : 1))
  writeMemo(backupMemo, stockCode, candles, BACKUP_MEMO_AGE)
  return candles
}

function toCandle(row: PeriodPriceResponse | null): Candle[] {
  if (typeof row !== 'object' || row === null) return []
  const date = typeof row.stck_bsop_date === 'string' ? row.stck_bsop_date.trim() : ''
  const [open, high, low, close] = [row.stck_oprc, row.stck_hgpr, row.stck_lwpr, row.stck_clpr].map(numberFromText)
  if (!/^\d{8}$/.test(date) || open === null || high === null || low === null || close === null) return []
  // 거래 정지일은 증권사가 가격을 0으로 준다. 0원 봉은 차트 축을 바닥까지 끌어내려 뺀다
  if (close <= 0 || low <= 0) return []
  return [{ date, open, high, low, close, volume: numberFromText(row.acml_vol) }]
}
