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
