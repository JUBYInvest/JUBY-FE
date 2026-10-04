const EMPTY = '-'

/*
 * 화면에 숫자로 적을 수 있는 값인가. null만 거르면 모자란다 — 서버가 필드를 빼고 보내면
 * undefined가, 계산이 어긋나면 NaN·Infinity가 온다. undefined.toFixed()에서 던지면
 * 표 한 줄 때문에 화면 전체가 오류 화면으로 넘어간다. 문자열 숫자도 받지 않는다
 * (서버는 숫자로 준다. 문자열이 왔다면 모양이 어긋난 것이라 값을 믿지 않는다).
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * 보합(변동 없음)인지. 오름의 빨강도 내림의 파랑도 쓰지 않아야 하는 경우다.
 *
 * 화면에 찍히는 자릿수로 판단한다. 23만원짜리가 1원 올라 0.0004%가 되면
 * "+0.00%"로 보이는데, 눈에 변동이 없는 걸 빨갛게 칠할 이유가 없다.
 * 그래서 소수 자릿수를 formatChangeRate와 똑같이 받는다.
 */
export function isFlatRate(
  rate: number | null | undefined,
  fractionDigits = 2,
): boolean {
  if (!isFiniteNumber(rate)) return false
  return Number(rate.toFixed(fractionDigits)) === 0
}

/** 1.01 → "+1.01%", -2.12 → "-2.12%", 0 → "0.00%" */
export function formatChangeRate(
  rate: number | null | undefined,
  fractionDigits = 2,
): string {
  if (!isFiniteNumber(rate)) return EMPTY
  // 보합을 그냥 toFixed하면 -0.004가 "-0.00%"가 된다. 부호를 떼고 0으로 적는다
  if (isFlatRate(rate, fractionDigits)) return `${(0).toFixed(fractionDigits)}%`

  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(fractionDigits)}%`
}

/**
 * 세 자리 콤마. `toLocaleString('ko-KR')`과 같은 결과인데, 그건 부를 때마다 포맷터를 새로 만든다.
 * 시세표 100행 × 여러 칸, 상세 차트의 눈금·십자선(마우스를 움직일 때마다)이 이걸 부르므로 하나를 만들어 같이 쓴다.
 */
const KO_NUMBER = new Intl.NumberFormat('ko-KR')

export function formatNumber(value: number): string {
  return KO_NUMBER.format(value)
}

/** 181200 → "181,200원" */
export function formatPrice(price: number | null | undefined): string {
  if (!isFiniteNumber(price)) return EMPTY
  return `${formatNumber(price)}원`
}

/**
 * 12345678 → "1,235만주", 5432 → "5,432주"
 *
 * 거래량은 몇천 주에서 수천만 주까지 벌어진다. 원래 숫자를 다 적으면 칸을 넘기므로
 * 만 단위가 넘으면 축약하고, 그 아래는 자릿수를 살려 0으로 뭉개지지 않게 둔다.
 */
export function formatVolume(volume: number | null | undefined): string {
  if (!isFiniteNumber(volume)) return EMPTY
  if (volume < 10_000) return `${formatNumber(volume)}주`
  return `${formatNumber(Math.round(volume / 10_000))}만주`
}

/**
 * 거래대금(원). 35,676,835,800 → "357억", 1,234,567,890,123 → "1.2조"
 *
 * 홈 표는 거래량이 아니라 거래대금을 받는다(백엔드 daily_price.trading_value).
 * 억 단위가 대부분이라 억으로 줄이고, 조를 넘는 대형주는 소수 한 자리로 적는다.
 */
export function formatTradingValue(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EMPTY
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}조`
  }
  if (value >= 100_000_000) {
    return `${formatNumber(Math.round(value / 100_000_000))}억`
  }
  return `${formatNumber(Math.round(value / 10_000))}만원`
}

/**
 * "2002-05-07" → "2002년 05월 07일"
 *
 * 생년월일은 없을 수 있다. 백엔드 parseBirth()가 소셜에서 못 받으면 null을 저장하는데,
 * 구글은 기본 스코프에 생일이 없어 실제로 자주 그렇다. 없으면 null을 그대로 돌려주고
 * 화면이 그 줄을 어떻게 다룰지 정한다.
 */
export function formatBirth(birth: string | null | undefined): string | null {
  if (typeof birth !== 'string') return null

  const [year, month, day] = birth.split('-')
  // 서버가 다른 형식을 주기 시작하면 엉뚱한 문자열을 조립하느니 없는 것으로 둔다
  if (year === undefined || month === undefined || day === undefined) return null

  return `${year}년 ${month}월 ${day}일`
}
