import { ApiError, get } from './client'
import { isLoggedIn } from '../utils/auth'
import { isSkipping, isStampWithin, readStamp, writeStamp } from '../utils/cache'
import { kstNow } from '../utils/date'

/*
 * 증권사(KIS) 호출 예산 — 사용자가 누르지 않은 증권사 호출을 언제 써도 되는지, 상세를 실패한 뒤 언제 다시 부를지.
 * **모두 임시다.** 백엔드가 상세의 토큰 저장(docs/남은-일.md 백엔드 10번)을 고치면 이 파일을 통째로 걷는다 —
 * 상세(api/stock.ts)·카드 그래프(api/home.ts)·지수 띠(api/market.ts)·휴장일(api/marketCalendar.ts)은 여기 함수만 부른다.
 * 탭 여러 개가 같은 서버 한도를 나눠 쓰므로 때는 모두 localStorage에 둔다(utils/cache.ts writeStamp).
 */

/** 증권사 경유 요청이 실패한 뒤 쉴 길이 — 401(로그인 토큰이 죽음)·그 밖 4xx(막힌 경로)·서버 오류(5xx·못 닿음) */
export interface FailureSkip {
  unauthorized: number
  client: number
  server: number
}

/** 실패에 맞는 쉼(ms) */
export function skipAfter(error: unknown, skip: FailureSkip): number {
  const status = error instanceof ApiError ? error.status : 0
  if (status === 401) return skip.unauthorized
  return status >= 400 && status < 500 ? skip.client : skip.server
}

/*
 * 상세를 실패한 뒤 다시 부를 간격. **임시다 — 백엔드가 docs/남은-일.md 백엔드 10번을 고치면 이 장치를 걷는다.**
 *
 * 서버에 증권사 토큰이 없으면(주말) 상세가 1분에 1건만 성공한다. 앞 요청 뒤 1분 안에 보내면 다른 종목이든 같은 종목이든 500이고,
 * 곧바로 다시 부르는 재시도도 같은 1분 안이라 반드시 실패한다. 70초 간격이면 늘 성공한다.
 * 백엔드 소스로 보면 증권사 토큰이 DB에 살아 있으면(평일 16시 일봉 배치가 받아 둔다) 한도가 없고, 토큰이 끝난
 * 주말에는 상세가 새 토큰을 저장하지 못해 요청마다 발급을 받으려다 증권사의 "1분에 1회 발급"에 걸린다.
 *
 * 그래서 처음에는 곧바로 보낸다 — 서버가 멀쩡하면 기다릴 까닭이 없다. 실패한 뒤 다시 부를 때만, 이 브라우저가
 * 마지막으로 보낸 때에서 DETAIL_GAP_MS가 지나기를 기다린다(그 안에 부르면 또 실패한다). 요청이 서버에 닿는 시각은
 * 보낸 시각과 조금씩 달라 1분에 몇 초를 더 둔다. 기다리는 동안 화면이 남은 시간을 적는다(StockChartPage).
 * 탭 여러 개도 같은 서버 한도를 나눠 쓰므로 보낸 때를 localStorage에 둔다(utils/cache.ts writeStamp).
 */
const DETAIL_GAP_MS = 65 * 1000
const DETAIL_SENT_KEY = 'stockDetailSentAt'

/** 상세(또는 심기)를 보냈다 — 실패해도 서버 한도는 쓴 것으로 본다 */
export function markDetailSent(): void {
  writeStamp(DETAIL_SENT_KEY, Date.now())
}

/**
 * 상세를 지금 보내도 되면 0, 아니면 기다릴 ms.
 * 시계를 되돌려 보낸 때가 미래로 남아도 DETAIL_GAP_MS보다 오래 기다리지는 않는다.
 */
export function detailWaitMs(): number {
  const wait = readStamp(DETAIL_SENT_KEY) + DETAIL_GAP_MS - Date.now()
  return Math.min(Math.max(wait, 0), DETAIL_GAP_MS)
}

/*
 * 증권사 토큰 심기. **임시다 — 위 "실패한 뒤 다시 부를 간격"과 함께 걷는다.**
 *
 * 상세가 1분에 1건만 되는 까닭은 서버가 새로 받은 증권사 토큰을 저장하지 못해서다(읽기 전용 트랜잭션 안에서
 * 받는다). 그런데 /api/market/** 은 읽기 전용이 아니라 거기서 받은 토큰은 저장된다. 그래서 로그인한 사용자가
 * 상세를 열기 전에 GET /api/market/{code}/price 를 한 번 부르면, 그 뒤 24시간 동안은 **모든 사용자**의 상세가
 * 저장된 토큰을 써서 발급 없이 바로 된다. 평일 16시 일봉 배치가 하는 일을 프론트가 대신 하는 셈이다.
 * docs/남은-일.md 백엔드 7번("프론트는 /api/market 을 부르지 않는다")을 깨는 우회다.
 *
 * - 로그인해야 부를 수 있다(/api/market 은 인증 경로). 비로그인은 심지 못하고 위 간격만 지킨다.
 * - 되면 6시간 동안 다시 심지 않는다(토큰은 24시간 가고 평일 16시에 배치가 갈아 끼운다). 탭끼리 나누려고 localStorage(utils/cache.ts).
 * - 4xx면 6시간 쉰다 — 백엔드가 7번대로 이 경로를 막으면(403) 저절로 꺼지고 위 간격으로 돌아간다.
 *   401(남아 있는 로그인 토큰이 죽음)은 10분만 쉰다. 다시 로그인하면 그 뒤 곧 심는다.
 * - 5xx·서버에 못 닿음은 65초만 쉰다. 누가 1분 안에 발급을 받아 간 뒤일 수 있어서다. 상세가 실패해 기다렸다
 *   다시 부를 때(StockChartPage) 다시 심는다.
 * - 심는 요청도 토큰 발급 한 번을 쓸 수 있으므로 보낸 때로 센다(markDetailSent).
 * - 응답 본문은 보지 않는다. 토큰이 저장됐는지는 알 수 없고, 그 뒤 상세가 되는지로만 드러난다.
 */
const PRIME_OK_KEY = 'kisTokenPrimedAt'
const PRIME_SKIP_KEY = 'kisTokenPrimeSkipUntil'
const PRIME_OK_AGE = 6 * 60 * 60 * 1000
const PRIME_SKIP: FailureSkip = { unauthorized: 10 * 60 * 1000, client: 6 * 60 * 60 * 1000, server: DETAIL_GAP_MS }
/**
 * 심기를 기다리는 한도. 상세가 이 뒤에 나가므로 길면 그대로 딜레이가 된다(기본 12초).
 * 끊어도 서버는 하던 일을 마치므로 토큰은 대개 저장된다 — 끊는 건 브라우저가 기다리는 것뿐이다.
 */
const PRIME_TIMEOUT = 3_000
let primeInFlight: Promise<void> | null = null

/** 6시간 안에 이 브라우저가 토큰을 심었는가. 시계를 되돌려 미래 값이 남아도 정해진 길이보다 오래 믿지 않는다 */
function isKisTokenPrimed(now: number = Date.now()): boolean {
  return isStampWithin(PRIME_OK_KEY, PRIME_OK_AGE, now)
}

/**
 * 심어 둔 표시를 지운다. 상세가 서버 오류를 내면 부른다 — 심을 때 남이 받아 둔 곧 끝날 토큰을 그대로 썼으면
 * 표시는 6시간인데 토큰은 먼저 끝난다. 그대로 두면 남은 시간 내내 심기를 건너뛰어 다시 1분에 1건이 된다.
 */
export function forgetKisTokenPrime(): void {
  writeStamp(PRIME_OK_KEY, 0)
}

/**
 * 상세를 부르기 전에 한 번(홈에 와도 한 번 — 상세를 누를 때 이걸 기다리지 않게).
 * 던지지 않는다 — 못 심어도 상세는 그대로 부른다.
 */
export function primeKisToken(stockCode: string): Promise<void> {
  if (!isLoggedIn()) return Promise.resolve()
  const now = Date.now()
  if (isKisTokenPrimed(now)) return Promise.resolve()
  if (isSkipping(PRIME_SKIP_KEY, PRIME_SKIP.client, now)) return Promise.resolve()
  // 이미 심는 중이면 같이 기다린다(개발 모드 StrictMode의 두 번 도는 effect)
  if (primeInFlight !== null) return primeInFlight

  primeInFlight = (async () => {
    markDetailSent()
    try {
      await get<unknown>(`/api/market/${encodeURIComponent(stockCode)}/price`, {
        ignoreUnauthorized: true,
        timeoutMs: PRIME_TIMEOUT,
        // 3초에 일부러 끊는 것이라 서버 무응답으로 세지 않는다(client.ts 차단기)
        countsTowardBreaker: false,
      })
      writeStamp(PRIME_OK_KEY, Date.now())
      // 토큰이 저장됐으니 "방금 서버 오류가 났다"는 표시는 더 맞지 않다
      writeStamp(KIS_LIMITED_KEY, 0)
    } catch (error: unknown) {
      const skip = skipAfter(error, PRIME_SKIP)
      writeStamp(PRIME_SKIP_KEY, Date.now() + skip)
      console.warn(`증권사 토큰을 심지 못했습니다. ${Math.round(skip / 1000)}초 뒤에 다시 시도합니다`, error)
    } finally {
      primeInFlight = null
    }
  })()
  return primeInFlight
}

/*
 * 사용자가 누르지 않은 증권사 호출(홈 카드 그래프)을 지금 써도 되는가. **임시다 — 위 두 장치와 함께 걷는다.**
 *
 * 서버에 저장된 토큰이 없으면 상세 한 건이 서버 전체의 "토큰 발급 1분 1회"를 써 버린다. 그러면 바로 뒤에
 * 사용자가 누른 종목이 1분 넘게 기다린다. 카드 그래프 하나 빠지는 것보다 그 딜레이가 훨씬 나쁘다.
 * 그래서 토큰이 서버에 있을 때만 쓴다.
 * - 이 브라우저가 6시간 안에 심었다(isKisTokenPrimed) → 있다.
 * - 한국 시간으로 토큰이 끝나 있는 때가 아니고(kisTokenLikelyExpired), 30분 안에 증권사 경유 요청이 서버 오류를
 *   낸 적도 없다 → 있을 것이다. 틀려도 30분 표시가 남아 그다음부터는 쓰지 않는다.
 */
const KIS_LIMITED_KEY = 'kisLimitedAt'
const KIS_LIMITED_AGE = 30 * 60 * 1000

/** 증권사 경유 요청(상세)이 서버 오류를 냈다 — 30분 동안 카드 그래프는 증권사를 쓰지 않는다 */
export function markKisLimited(): void {
  writeStamp(KIS_LIMITED_KEY, Date.now())
}

/**
 * 서버에 저장된 토큰이 끝나 있을 것 같은 때(한국 시간).
 * 평일 16시 일봉 배치(DailyPriceScheduler — 휴장일 조회가 실전 토큰을 받아 저장한다. 공휴일도 평일이면 돈다)가 받은
 * 토큰은 24시간 가고, 서버는 끝나기 10분 전부터 못 쓰는 토큰으로 본다(TokenService.isValid). 그래서
 * 토 15시 45분 ~ 월 16시 5분, 그리고 평일 15시 45분 ~ 16시 5분에는 토큰이 없다.
 */
function kisTokenLikelyExpired(now: number = Date.now()): boolean {
  const { day, minutes } = kstNow(now)
  const from = 15 * 60 + 45
  const until = 16 * 60 + 5
  if (day === 0) return true
  if (day === 6) return minutes >= from
  if (day === 1) return minutes < until
  return minutes >= from && minutes < until
}

export function canSpendKisCall(now: number = Date.now()): boolean {
  if (isKisTokenPrimed(now)) return true
  return !kisTokenLikelyExpired(now) && !isStampWithin(KIS_LIMITED_KEY, KIS_LIMITED_AGE, now)
}
