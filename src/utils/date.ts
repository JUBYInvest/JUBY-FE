import type { Period } from '../types/stock'

/** 여덟 자리 숫자 날짜("20260805")인가. 아니면 아래 함수들이 엉뚱한 값("--", 1899년)을 만든다 */
function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{8}$/.test(value)
}

/**
 * Date → "20260805" (백엔드가 하이픈 없는 형식을 쓴다).
 * Date가 아니거나 잘못된 날짜면 던지지 않고 빈 문자열이다(다른 날짜 함수와 같은 규칙).
 */
export function toYmd(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * "2026-08-05" → "20260805". /api/stocks 계열이 하이픈 형식을 주는데 앱은 붙여 쓴다.
 * 날짜가 비어 오면(null) 던지지 않고 빈 문자열로 둔다 — 기준일 하나 때문에
 * 멀쩡한 시세표 전체가 실패로 바뀌면 안 된다. 화면이 빈 날짜의 줄을 숨긴다.
 */
export function fromDashedYmd(dashed: string | null | undefined): string {
  return typeof dashed === 'string' ? dashed.replace(/-/g, '') : ''
}

/**
 * YYYYMMDD → Date(로컬 자정). 상세 화면이 기간 탭으로 일봉을 자를 때 쓴다(periodStart).
 * new Date("2026-08-05")는 UTC 자정이라 한국에서 날짜가 밀릴 수 있어 직접 조립한다.
 * 여덟 자리 날짜가 아니면 잘못된 날짜(Invalid Date)다. 그대로 쪼개면 ""가 1899년 11월 30일이 된다.
 */
function ymdToDate(ymd: string): Date {
  if (!isYmd(ymd)) return new Date(Number.NaN)
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(4, 6)) - 1,
    Number(ymd.slice(6, 8)),
  )
}

/**
 * months달 거슬러 올라간 날. 그달에 같은 날이 없으면 그달 말일로 맞춘다(Java `LocalDate.minusMonths`와 같다).
 * `Date.setMonth`는 넘쳐서 다음 달로 간다 — 7월 31일의 한 달 전이 6월 31일 → 7월 1일이 됐다.
 */
function minusMonths(date: Date, months: number): Date {
  const year = date.getFullYear()
  const month = date.getMonth() - months
  // 다음 달의 0일이 이달 말일이다. 월이 음수여도 Date가 연을 넘겨 계산한다
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(date.getDate(), lastDay))
}

/**
 * 마지막 거래일에서 기간만큼 거슬러 올라간 시작일(YYYYMMDD). 전체면 null.
 * 백엔드 StockService.calculateDay와 같은 규칙이다 — 1주는 7일 전, 달·해는 `minusMonths`·`minusYears`라
 * 거슬러 간 달에 그날이 없으면 말일로 맞춘다(2026-07-31의 1개월 전은 06-30, 2028-02-29의 1년 전은 2027-02-28).
 * 날짜가 여덟 자리가 아니면 ""다(그러면 자르지 않는다).
 */
export function periodStart(lastYmd: string, period: Period): string | null {
  if (period === 'ALL') return null

  const date = ymdToDate(lastYmd)
  switch (period) {
    case 'ONE_WEEK':
      date.setDate(date.getDate() - 7)
      return toYmd(date)
    case 'ONE_MONTH':
      return toYmd(minusMonths(date, 1))
    case 'THREE_MONTH':
      return toYmd(minusMonths(date, 3))
    case 'SIX_MONTH':
      return toYmd(minusMonths(date, 6))
    case 'ONE_YEAR':
      return toYmd(minusMonths(date, 12))
    case 'THREE_YEAR':
      return toYmd(minusMonths(date, 36))
  }
}

/** "20260805" → "2026-08-05" (lightweight-charts가 이 형식을 받는다). 여덟 자리 날짜가 아니면 빈 문자열 */
export function toDashedYmd(ymd: string): string {
  if (!isYmd(ymd)) return ''
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

/**
 * "20260805" → "8월 5일" (화면에 읽히는 형태). 해가 바뀌면 연도까지 적는다.
 * 여덟 자리 날짜가 아니면 빈 문자열이다. 그대로 쪼개면 "년 0월 0일"이 나온다.
 */
export function toKoreanDate(
  ymd: string | null | undefined,
  today: Date = new Date(),
): string {
  if (!isYmd(ymd)) return ''

  const year = ymd.slice(0, 4)
  const month = Number(ymd.slice(4, 6))
  const day = Number(ymd.slice(6, 8))
  const prefix = year === String(today.getFullYear()) ? '' : `${year}년 `

  return `${prefix}${month}월 ${day}일`
}

/**
 * 기준일(YYYYMMDD)이 모두 같으면 그 날, 하나라도 다르거나 비었거나 여덟 자리가 아니면 null. 홈 테마 카드 셋이 같은 날의 종가면 구역 제목 줄에
 * 한 번만 적고, 아니면 카드마다 적는다(2026-11-03 지시서 N-3 — 카드 셋마다 "11월 3일 종가"가 되풀이됐다)
 */
export function sharedYmd(dates: readonly string[]): string | null {
  const first = dates[0]
  return first !== undefined && /^\d{8}$/.test(first) && dates.every((date) => date === first) ? first : null
}

/** 한국 시간은 UTC보다 9시간 빠르다(일광 절약 시간 없음) */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 한국 시각의 벽시계를 UTC 칸에 담은 Date(getUTCHours()가 한국 시). Date가 담지 못하는 값(NaN, ±8.64e15 밖)이면 null —
 * Number.isFinite만 보면 1e16 같은 값이 "오후 NaN:NaN"으로 새어 나갔다
 */
function kstClock(ms: number): Date | null {
  const kst = new Date(ms + KST_OFFSET_MS)
  return Number.isNaN(kst.getTime()) ? null : kst
}

/**
 * 한국 시각으로 "10월 29일 11:00". 종목 상세 머리 가격의 기준 시각(응답을 받은 때)에 쓴다.
 * 시장 시각이라 보는 사람의 시간대가 아니라 한국 시간으로 적는다. 시각이 아니면 ""(그 줄을 숨긴다)
 */
export function toKoreanDateTime(ms: number): string {
  const kst = kstClock(ms)
  if (kst === null) return ''
  const hours = String(kst.getUTCHours()).padStart(2, '0')
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${hours}:${minutes}`
}


/** `<time dateTime>`에 넣는 ISO 시각("2026-10-29T02:00:00.000Z"). 시각이 아니면 "" — toISOString은 던져서 그리던 화면을 멈춘다 */
export function toIsoTime(ms: number): string {
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/**
 * 지난 때를 "방금"·"12분 전"·"3시간 전"·"2일 전"으로. 일주일이 넘으면 날짜("10월 21일")로 적는다.
 * 네이버 뉴스처럼 서버가 "몇 분 전"을 지어 주지 않는 기사에 쓴다. 읽지 못한 때(NaN)면 ""(그 칸을 비운다)
 */
export function timeAgo(ms: number, now: number = Date.now()): string {
  if (!Number.isFinite(ms)) return ''
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days <= 7) return `${days}일 전`
  return toKoreanDate(toYmd(new Date(ms)), new Date(now))
}

/**
 * 한국 시각으로 지금 — 날짜("20261031"), 요일(0 일요일 ~ 6 토요일), 자정부터 지난 분.
 * 장 상태·증권사 조회 기간은 보는 사람의 시간대가 아니라 한국 시간으로 정한다
 */
export function kstNow(now: number = Date.now()): { ymd: string; day: number; minutes: number } {
  const kst = new Date(now + KST_OFFSET_MS)
  const ymd = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`
  return { ymd, day: kst.getUTCDay(), minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes() }
}

/** 날짜의 요일(0 일요일 ~ 6 토요일). 여덟 자리가 아니면 NaN */
export function weekdayOf(ymd: string): number {
  if (!isYmd(ymd)) return Number.NaN
  return new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))).getUTCDay()
}

/** "20261031"에서 days만큼 옮긴 날. 여덟 자리가 아니면 "" */
export function shiftYmd(ymd: string, days: number): string {
  if (!isYmd(ymd)) return ''
  const moved = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))) + days * 86_400_000
  return kstNow(moved - KST_OFFSET_MS).ymd
}

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

/** "20261102" → "11월 2일(월)". 다음 개장일처럼 요일이 중요한 날짜에 쓴다. 여덟 자리가 아니면 "" */
export function toKoreanDateWithDay(ymd: string): string {
  const date = toKoreanDate(ymd)
  return date === '' ? '' : `${date}(${WEEKDAY_NAMES[weekdayOf(ymd)]})`
}
