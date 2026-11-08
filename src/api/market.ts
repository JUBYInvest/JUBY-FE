import { get } from './client'
import { isDayOffToday } from './marketCalendar'
import { canSpendKisCall } from './kisBudget'
import { readCache, writeCache } from '../utils/cache'
import { fromKstDateTime, kstNow } from '../utils/date'
import { isFiniteNumber, numberFromText } from '../utils/format'
import type { MarketIndex, MarketIndices } from '../types/market'

/*
 * 화면 아래 지수 띠(MarketIndexBar)의 코스피·코스닥 — `GET /api/market-indices`.
 * 장중에는 서버가 실시간 체결 값을, 장 밖에는 증권사 현재지수(1분 캐시)를 준다. 장중 갱신은 실시간 연결(api/realtime.ts)이 맡고,
 * 이 요청은 처음 그림과 실시간 연결이 없을 때만 쓴다.
 */
const INDICES_PATH = '/api/market-indices'

/** 실시간 연결이 없을 때 장중에 다시 묻는 간격 */
export const INDEX_REFRESH_MS = 60_000

/** 지난 값 — 다음 방문의 첫 그림과 못 받았을 때. 받은 때를 띠에 같이 적어 오래된 값도 오래된 줄 알고 본다. 연휴 낀 주말까지 나흘 */
const INDEX_CACHE_KEY = 'marketIndices.v2'
const INDEX_CACHE_MAX_AGE = 4 * 24 * 60 * 60 * 1000

interface MarketIndicesResponse {
  /** 응답을 만든 한국 시각("2026-11-04T10:15:30") */
  asOf?: string | null
  indices?: (MarketIndexResponse | null)[] | null
}

interface MarketIndexResponse {
  /** 업종 코드. 코스피 0001, 코스닥 1001 */
  code?: string | null
  name?: string | null
  currentIndex?: number | string | null
  /** 전일 대비율(%) */
  changeRate?: number | string | null
}

/**
 * 장중인지(한국 시간 평일 9:00~15:35). 15:30 마감 값까지 받으려고 5분을 더 둔다.
 * 받아 둔 휴장일(api/marketCalendar.ts)의 공휴일은 뺀다. 휴장일을 모르면(비로그인) 평일이면 장중으로 본다
 */
export function isMarketHours(now: number = Date.now()): boolean {
  if (isDayOffToday(now)) return false
  const { minutes } = kstNow(now)
  return minutes >= 9 * 60 && minutes < 15 * 60 + 35
}

/** 지난번에 받아 둔 지수. 모양이 하나라도 틀리면 없는 셈 친다 */
export function readCachedIndices(): MarketIndices | null {
  const cached = readCache<unknown>(INDEX_CACHE_KEY, INDEX_CACHE_MAX_AGE)
  if (typeof cached !== 'object' || cached === null) return null
  const { indices, receivedAt } = cached as Partial<MarketIndices>
  if (!Array.isArray(indices) || indices.length === 0 || !indices.every(isMarketIndex)) return null
  if (!isFiniteNumber(receivedAt)) return null
  return { indices, receivedAt }
}

function isMarketIndex(value: unknown): value is MarketIndex {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<MarketIndex>
  return (
    typeof row.code === 'string' &&
    typeof row.name === 'string' &&
    isFiniteNumber(row.value) &&
    (row.changeRate === null || isFiniteNumber(row.changeRate))
  )
}

let inflight: Promise<MarketIndices | null> | null = null

/**
 * 지수를 받는다. **던지지 않는다** — 못 받으면 지난 값, 그것도 없으면 null(띠를 숨긴다).
 * 장 밖의 값은 서버가 증권사를 불러 만든다. 서버에 증권사 토큰이 없을 때 부르면 서버 전체의 "1분 1회 발급"을 써 버려
 * 사용자가 누른 상세가 기다리므로 그때는 지난 값을 쓴다(canSpendKisCall). 지난 값도 없으면 띠가 통째로 비므로 그래도 묻는다.
 * 장중 값은 서버가 실시간 체결로 만들어 증권사를 부르지 않는다.
 */
export function loadMarketIndices(): Promise<MarketIndices | null> {
  inflight ??= fetchIndices().finally(() => {
    inflight = null
  })
  return inflight
}

async function fetchIndices(): Promise<MarketIndices | null> {
  if (!canSpendKisCall() && !isMarketHours()) {
    const cached = readCachedIndices()
    if (cached !== null) return cached
  }
  try {
    // 띠는 없어도 되는 값이라 짧게 끊는다. 일부러 끊은 시간 초과는 서버 무응답으로 세지 않는다(client.ts 차단기)
    const response = await get<MarketIndicesResponse | null>(INDICES_PATH, {
      timeoutMs: 5_000,
      countsTowardBreaker: false,
      ignoreUnauthorized: true,
    })
    const indices = Array.isArray(response?.indices) ? response.indices.flatMap(toMarketIndex) : []
    if (indices.length === 0) return readCachedIndices()
    const result: MarketIndices = { indices, receivedAt: fromKstDateTime(response?.asOf) ?? Date.now() }
    writeCache(INDEX_CACHE_KEY, result)
    return result
  } catch (error: unknown) {
    console.warn('지수를 받지 못했습니다. 지난 값으로 그립니다', error)
    return readCachedIndices()
  }
}

/** 쓸 만한 줄이면 [줄], 아니면 []. 이름이나 지수가 비면 뺀다 */
function toMarketIndex(row: MarketIndexResponse | null): MarketIndex[] {
  if (typeof row !== 'object' || row === null) return []
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const value = numberFromText(row.currentIndex)
  if (name === '' || value === null) return []
  return [{
    code: typeof row.code === 'string' && row.code !== '' ? row.code : name,
    name,
    value,
    changeRate: numberFromText(row.changeRate),
  }]
}
