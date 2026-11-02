import { get } from './client'
import { isDayOffToday } from './marketCalendar'
import { canSpendKisCall } from './stock'
import { readCache, writeCache } from '../utils/cache'
import { kstNow } from '../utils/date'
import { isFiniteNumber, numberFromText } from '../utils/format'
import type { MarketIndex, MarketIndices } from '../types/market'

/*
 * 화면 아래 지수 띠(MarketIndexBar)의 코스피·코스닥.
 *
 * 백엔드가 지수 API를 만드는 중이다(2026-10-29 — JUBY-BE dev b1aedd7까지는 없다). 그동안은 예시 값을 그리고,
 * 띠가 "예시 값"이라고 밝힌다. API가 나오면 **이 파일만** 고친다.
 * ① USE_SAMPLE을 false로 ② INDICES_PATH를 실제 경로로 ③ 응답 모양이 아래 *Response와 다르면 그 둘과 toMarketIndex를 맞춘다.
 * 화면(MarketIndexBar)과 타입(types/market.ts)은 손대지 않는다. 백엔드에 건넨 응답 제안은 docs/지수-API-제안.md다.
 */
const USE_SAMPLE = true

/** 제안한 경로. `/api/stocks/**`는 로그인 없이 열려 있다(백엔드 SecurityConfig). `/api/market/**`는 로그인해야 열린다 */
const INDICES_PATH = '/api/stocks/indices'

/** 백엔드 API가 나오기 전 띠에 그리는 값. 실제 지수가 아니다. 오르는 줄과 내리는 줄을 하나씩 둬 두 색이 다 보이게 했다 */
const SAMPLE_INDICES: MarketIndex[] = [
  { code: '0001', name: '코스피', value: 5937.66, change: -74.78, changeRate: -1.24 },
  { code: '1001', name: '코스닥', value: 1152.34, change: 8.07, changeRate: 0.71 },
]

/** 장중에 다시 묻는 간격. 띠가 화면에 계속 떠 있어 이보다 잦으면 보는 사람 수만큼 서버 요청이 불어난다 */
export const INDEX_REFRESH_MS = 60_000

/*
 * 지난 값. 다음 방문의 첫 그림과, 서버에 묻지 않거나 못 받았을 때 쓴다. 받은 때를 띠에 같이 적으므로 오래된 값도
 * 오래된 줄 알고 보게 된다. 금요일 마감 값을 연휴 낀 주말 내내 쓸 수 있게 나흘을 둔다. 예시 값은 담지 않는다 —
 * 담으면 API로 갈아탄 뒤 첫 그림이 예시 값을 실제 값처럼 띄운다
 */
const INDEX_CACHE_KEY = 'marketIndices'
const INDEX_CACHE_MAX_AGE = 4 * 24 * 60 * 60 * 1000

/** 제안한 응답(docs/지수-API-제안.md). 스웨거에 실제 모양이 나오면 그걸로 바꾼다. 필드는 전부 비어 올 수 있게 적는다 */
interface MarketIndicesResponse {
  indices?: (MarketIndexResponse | null)[] | null
}

interface MarketIndexResponse {
  /** 증권사 업종 코드. 코스피 0001, 코스닥 1001 */
  indexCode?: string | null
  indexName?: string | null
  /** 현재 지수 */
  currentValue?: number | string | null
  /** 전일 대비(포인트). 내리면 음수 */
  changeValue?: number | string | null
  /** 전일 대비율(%). 내리면 음수 */
  changeRate?: number | string | null
}

/**
 * 장중인지(한국 시간 평일 9:00~15:35). 장 밖에는 지수가 바뀌지 않아 띠가 다시 묻지 않는다.
 * 15:30 마감 값까지 받으려고 5분을 더 둔다. 받아 둔 휴장일(api/marketCalendar.ts)에 있는 공휴일도 묻지 않는다 —
 * 휴장일을 못 받았으면(비로그인) 평일이면 묻는다(값이 그대로일 뿐이다)
 */
export function isMarketHours(now: number = Date.now()): boolean {
  if (isDayOffToday(now)) return false
  const { minutes } = kstNow(now)
  return minutes >= 9 * 60 && minutes < 15 * 60 + 35
}

/** 지난번에 받아 둔 지수. 모양이 하나라도 틀리면(예전 버전이 다르게 저장, 사람이 손댄 값) 없는 셈 친다 */
export function readCachedIndices(): MarketIndices | null {
  if (USE_SAMPLE) return null
  const cached = readCache<unknown>(INDEX_CACHE_KEY, INDEX_CACHE_MAX_AGE)
  if (typeof cached !== 'object' || cached === null) return null
  const { indices, receivedAt } = cached as Partial<MarketIndices>
  if (!Array.isArray(indices) || indices.length === 0 || !indices.every(isMarketIndex)) return null
  if (!isFiniteNumber(receivedAt)) return null
  return { indices, receivedAt, isSample: false }
}

function isMarketIndex(value: unknown): value is MarketIndex {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<MarketIndex>
  return (
    typeof row.code === 'string' &&
    typeof row.name === 'string' &&
    isFiniteNumber(row.value) &&
    (row.change === null || isFiniteNumber(row.change)) &&
    (row.changeRate === null || isFiniteNumber(row.changeRate))
  )
}

/** 진행 중인 요청. 개발 모드(StrictMode)가 effect를 두 번 돌려도 한 번만 보낸다 */
let inflight: Promise<MarketIndices | null> | null = null

/**
 * 지수를 받는다. **던지지 않는다.** 못 받으면 지난 값, 그것도 없으면 null(띠를 숨긴다).
 *
 * 지수 API가 요청마다 증권사를 부르는지 아직 모른다. 그래서 홈 카드 그래프처럼 "사용자가 누르지 않은 증권사 호출"로 보고
 * 서버에 증권사 토큰이 있을 때만 묻는다(canSpendKisCall — 없을 때 부르면 서버 전체의 "1분 1회 발급"을 써 버려 사용자가 누른
 * 상세가 1분 넘게 기다린다). 백엔드가 서버에 담아 둔 값을 준다고 확인되면(요청마다 증권사를 부르지 않으면) 이 검사를 걷는다.
 */
export function loadMarketIndices(): Promise<MarketIndices | null> {
  inflight ??= fetchIndices().finally(() => {
    inflight = null
  })
  return inflight
}

async function fetchIndices(): Promise<MarketIndices | null> {
  if (USE_SAMPLE) return { indices: SAMPLE_INDICES, receivedAt: Date.now(), isSample: true }
  if (!canSpendKisCall()) return readCachedIndices()

  try {
    // 띠는 없어도 되는 값이라 오래 기다리지 않는다. 일부러 짧게 끊은 시간 초과는 서버 무응답으로 세지 않는다(client.ts 차단기)
    const response = await get<MarketIndicesResponse | null>(INDICES_PATH, {
      timeoutMs: 5_000,
      countsTowardBreaker: false,
    })
    const indices = Array.isArray(response?.indices) ? response.indices.flatMap(toMarketIndex) : []
    if (indices.length === 0) {
      console.warn('지수 응답에 쓸 수 있는 줄이 없습니다. 지난 값으로 그립니다', response)
      return readCachedIndices()
    }
    const result: MarketIndices = { indices, receivedAt: Date.now(), isSample: false }
    writeCache(INDEX_CACHE_KEY, { indices, receivedAt: result.receivedAt })
    return result
  } catch (error: unknown) {
    console.warn('지수를 받지 못했습니다. 지난 값으로 그립니다', error)
    return readCachedIndices()
  }
}

/** 쓸 만한 줄이면 [줄], 아니면 []. 이름이나 지수가 비면 뺀다. 대비·대비율이 빈 건 그 자리만 비운다 */
function toMarketIndex(row: MarketIndexResponse | null): MarketIndex[] {
  if (typeof row !== 'object' || row === null) return []
  const name = typeof row.indexName === 'string' ? row.indexName.trim() : ''
  const value = numberFromText(row.currentValue)
  if (name === '' || value === null) return []
  return [{
    code: typeof row.indexCode === 'string' && row.indexCode !== '' ? row.indexCode : name,
    name,
    value,
    change: numberFromText(row.changeValue),
    changeRate: numberFromText(row.changeRate),
  }]
}
