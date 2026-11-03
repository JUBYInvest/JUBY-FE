import { ApiError, get } from './client'
import { canSpendKisCall } from './stock'
import { isLoggedIn } from '../utils/auth'
import { readJson, readStamp, writeJson, writeStamp } from '../utils/cache'
import { kstNow, weekdayOf } from '../utils/date'
import type { MarketDay, MarketStatus } from '../types/market'

/*
 * 장이 열리는 날(증권사 휴장일 조회 `GET /api/market/holiday?basedate=YYYYMMDD`, 2026-10-31 연결).
 * 아래 지수 띠가 장 상태(장 시작 전·장 중·장 마감·오늘 휴장)와 다음 개장일을 적고, 휴장일에는 지수를 다시 묻지 않는다
 * (market.ts isMarketHours).
 *
 * 증권사 직통이다 — 백엔드가 요청마다 증권사를 부르고 실전 토큰을 쓴다(JUBY-BE MarketService.getHolidayList, dev b1aedd7).
 * 증권사도 "하루 한 번 넘게 부르지 말라"고 안내하는 API라 아끼고 아낀다.
 * - 로그인했을 때만 묻는다(`/api/market/**`는 인증 경로).
 * - 사용자가 누르지 않은 증권사 호출이라 서버에 토큰이 있을 때만 묻는다(canSpendKisCall, api/stock.ts).
 * - 받은 날짜들을 이 브라우저에 담아 두고(localStorage `marketCalendar`), 오늘과 그 뒤 개장일이 그 안에 있으면 묻지 않는다.
 *   담은 지 7일이 지나야 새로 묻는다 — 임시 공휴일이 뒤늦게 정해질 수 있다.
 * - 실패하면 401 10분, 그 밖 4xx 6시간, 서버 오류 30분 쉰다(`marketCalendarSkipUntil`).
 *
 * 모르면(비로그인·못 받음) 주말만 휴장으로 안다. **평일에는 장 상태를 지레 적지 않는다** — 공휴일에 "장 중"이라고 하면 틀린 말이다.
 * 장 시간은 9:00~15:30으로 본다. 수능일·새해 첫 거래일처럼 시간이 바뀌는 날은 모른다(응답에 시간이 없다).
 */
const CALENDAR_KEY = 'marketCalendar'
const CALENDAR_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const SKIP_KEY = 'marketCalendarSkipUntil'
const SKIP_UNAUTHORIZED = 10 * 60 * 1000
const SKIP_FORBIDDEN = 6 * 60 * 60 * 1000
const SKIP_SERVER = 30 * 60 * 1000

const OPEN_MINUTES = 9 * 60
const CLOSE_MINUTES = 15 * 60 + 30

/** 증권사 응답 그대로의 한 줄(백엔드 HolidayDto.Output의 @JsonProperty). 다른 칸(영업일·거래일 여부)은 쓰지 않는다 */
interface HolidayResponse {
  bass_dt?: string | null
  /** 개장일 여부 Y/N — 주식시장이 열리는 날 */
  opnd_yn?: string | null
}

interface SavedCalendar {
  days: MarketDay[]
  savedAt: number
}

function readCalendar(): SavedCalendar | null {
  const saved = readJson(CALENDAR_KEY)
  if (typeof saved !== 'object' || saved === null) return null
  const { days, savedAt } = saved as Partial<SavedCalendar>
  if (!Array.isArray(days) || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null
  const valid = days.every(
    (day: unknown) =>
      typeof day === 'object' &&
      day !== null &&
      typeof (day as MarketDay).date === 'string' &&
      /^\d{8}$/.test((day as MarketDay).date) &&
      typeof (day as MarketDay).open === 'boolean',
  )
  return valid ? { days, savedAt } : null
}

/** 그날 장이 열리는가. 받아 둔 휴장일에 있으면 그 값, 없으면 주말만 false로 알고 평일은 모른다(null) */
function isOpenDay(ymd: string, calendar: SavedCalendar | null): boolean | null {
  const known = calendar?.days.find((day) => day.date === ymd)
  if (known !== undefined) return known.open
  const weekday = weekdayOf(ymd)
  return weekday === 0 || weekday === 6 ? false : null
}

/** ymd 다음에 장이 열리는 날. 받아 둔 휴장일 안에서만 찾는다(주말 뒤 월요일이 공휴일일 수 있다) */
function nextOpenDay(ymd: string, calendar: SavedCalendar | null): string | null {
  if (calendar === null) return null
  const next = calendar.days
    .filter((day) => day.date > ymd && day.open)
    .sort((left, right) => (left.date < right.date ? -1 : 1))[0]
  return next?.date ?? null
}

/** 지금 장 상태. 모르면 null — 띠가 그 자리를 비운다 */
export function marketStatus(now: number = Date.now()): MarketStatus | null {
  const { ymd, minutes } = kstNow(now)
  const calendar = readCalendar()
  const open = isOpenDay(ymd, calendar)
  if (open === null) return null
  if (!open) return { phase: 'dayOff', nextOpen: nextOpenDay(ymd, calendar) }
  if (minutes < OPEN_MINUTES) return { phase: 'beforeOpen', nextOpen: ymd }
  if (minutes < CLOSE_MINUTES) return { phase: 'open', nextOpen: null }
  return { phase: 'closed', nextOpen: nextOpenDay(ymd, calendar) }
}

/**
 * 오늘 정규장(9:00~15:30, 한국 시각)이 얼마나 지났는지 — 지수 띠의 장 진행 막대(2026-11-03 사용자가 시안 비교에서 고름).
 * 장 중이면 지난 몫(0~1)과 마감까지 남은 분, 장 시작 전이면 0과 개장까지 남은 분. 그 밖(마감·휴장·모름)은 null — 막대를 두지 않는다
 */
export function sessionClock(status: MarketStatus | null, now: number = Date.now()): { ratio: number; minutesLeft: number; until: 'close' | 'open' } | null {
  if (status === null || (status.phase !== 'open' && status.phase !== 'beforeOpen')) return null
  const { minutes } = kstNow(now)
  if (status.phase === 'beforeOpen') return { ratio: 0, minutesLeft: Math.max(0, OPEN_MINUTES - minutes), until: 'open' }
  const ratio = (minutes - OPEN_MINUTES) / (CLOSE_MINUTES - OPEN_MINUTES)
  return { ratio: Math.min(1, Math.max(0, ratio)), minutesLeft: Math.max(0, CLOSE_MINUTES - minutes), until: 'close' }
}

/** 오늘 장이 열리지 않는 날로 확실한가(주말, 또는 받아 둔 휴장일). 모르면 false */
export function isDayOffToday(now: number = Date.now()): boolean {
  return isOpenDay(kstNow(now).ymd, readCalendar()) === false
}

/** 진행 중인 요청. 개발 모드(StrictMode)가 effect를 두 번 돌려도 한 번만 보낸다 */
let inflight: Promise<void> | null = null

/**
 * 휴장일을 받아 둔다. **던지지 않는다.** 묻지 않아도 되면(받아 둔 것이 오늘과 다음 개장일을 덮음) 곧바로 끝난다.
 * 끝나면 marketStatus()를 다시 읽는다.
 */
export function loadMarketCalendar(): Promise<void> {
  inflight ??= fetchCalendar().finally(() => {
    inflight = null
  })
  return inflight
}

async function fetchCalendar(): Promise<void> {
  if (!isLoggedIn()) return
  const now = Date.now()
  const skipUntil = readStamp(SKIP_KEY)
  // 시계를 되돌려 미래 값이 남아도 정해진 길이보다 오래 건너뛰지는 않는다
  if (now < skipUntil && skipUntil - now <= SKIP_FORBIDDEN) return

  const { ymd } = kstNow(now)
  const saved = readCalendar()
  const covers =
    saved !== null &&
    saved.days.some((day) => day.date === ymd) &&
    nextOpenDay(ymd, saved) !== null &&
    now - saved.savedAt < CALENDAR_MAX_AGE &&
    saved.savedAt - now < CALENDAR_MAX_AGE
  if (covers) return
  if (!canSpendKisCall(now)) return

  try {
    const response = await get<(HolidayResponse | null)[] | null>(`/api/market/holiday?basedate=${ymd}`, {
      // 들어오자마자 부르는 요청이라 401이어도 로그인 화면으로 끌고 가지 않는다(공개 화면 규칙, CLAUDE.md "API 계층")
      ignoreUnauthorized: true,
      timeoutMs: 5_000,
      countsTowardBreaker: false,
    })
    const days = (Array.isArray(response) ? response : []).flatMap(toMarketDay)
    if (!days.some((day) => day.date === ymd)) {
      console.warn('휴장일 응답에 오늘이 없습니다. 30분 뒤에 다시 묻습니다', response)
      writeStamp(SKIP_KEY, Date.now() + SKIP_SERVER)
      return
    }
    writeJson(CALENDAR_KEY, { days, savedAt: Date.now() } satisfies SavedCalendar)
  } catch (error: unknown) {
    const status = error instanceof ApiError ? error.status : 0
    const skip =
      status === 401 ? SKIP_UNAUTHORIZED : status >= 400 && status < 500 ? SKIP_FORBIDDEN : SKIP_SERVER
    writeStamp(SKIP_KEY, Date.now() + skip)
    console.warn(`휴장일을 받지 못했습니다. ${Math.round(skip / 60_000)}분 뒤에 다시 묻습니다`, error)
  }
}

function toMarketDay(row: HolidayResponse | null): MarketDay[] {
  if (typeof row !== 'object' || row === null) return []
  const date = typeof row.bass_dt === 'string' ? row.bass_dt.trim() : ''
  if (!/^\d{8}$/.test(date) || (row.opnd_yn !== 'Y' && row.opnd_yn !== 'N')) return []
  return [{ date, open: row.opnd_yn === 'Y' }]
}
