import { clearTokens, getAccessToken, isLoggedIn, saveTokens, toUsableToken } from '../utils/auth'
import { goTo, loginPathFrom } from '../utils/navigation'

/**
 * 공통 fetch 래퍼. baseURL과 토큰 헤더를 여기서만 관리한다.
 * 개발 중에는 빈 문자열 → vite.config.ts의 프록시가 백엔드로 넘긴다(CORS 우회).
 *
 * 인증이 필요한 API(/api/members/**, /api/open-ai/**)는 토큰이 없거나 만료되면
 * 서버가 401 JSON을 준다. 토큰을 실어 보낸 요청이면 한 번 재발급해 다시 보내고, 그래도 안 되면
 * 여기서 한 번에 처리해 로그인 화면으로 보낸다.
 */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * 백엔드 주소. 프록시를 거치지 않고 브라우저가 곧장 찾아가는 두 곳이 쓴다 — 소셜 로그인 이동(LoginPage)과 토큰 재발급.
 * 값이 없으면(`.env`가 없는 배포 빌드) 운영 백엔드다. 빈 문자열을 넣으면 그대로 쓰여 상대 주소가 되니 넣지 않는다.
 */
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? 'https://api.juby.store'

interface ApiResponse<T> {
  isSuccess: boolean
  code: string
  message: string
  result: T
}

function authHeaders(token: string | null): Record<string, string> {
  return token === null ? {} : { Authorization: `Bearer ${token}` }
}

/**
 * 백엔드 호출 차단 스위치. **지금은 꺼져 있다.**
 *
 * 2026-08~09에 켜 뒀던 이유: 홈 한 번에 증권사(KIS) 중계 요청이 108건 나가
 * 계정이 정지될 수 있다는 경고를 받았다. 2026-09-18에 홈을 `GET /api/stocks`
 * (DB만 읽음, 1건)로 갈아타면서 그 원인이 사라져 다시 열었다.
 * 남은 KIS 호출은 종목 상세의 현재가 1회, 홈 카드 3장의 현재가 3회뿐이다.
 *
 * 다시 켜야 할 일이 생기면 여기 한 곳만 true로 바꾸면 된다. 이 파일의 fetch가
 * 앱 전체에서 유일한 통신 창구라 호출부를 하나씩 막을 필요가 없다.
 */
const API_DISABLED = false

/**
 * 응답을 이만큼 기다려도 안 오면 실패로 친다.
 *
 * fetch는 기본적으로 기다리는 시간에 제한이 없다. 백엔드가 멈춰 서면(응답도 거절도 안 하면)
 * 화면은 로딩 자리 그대로 영원히 앉아 있고, 실패했을 때 쓰라고 만들어 둔 대체 값도
 * 영영 쓰이지 않는다. 실제로 서버가 죽었을 때 홈이 통째로 '-'가 되는 걸 이 방식으로 겪었다.
 *
 * 12초는 가장 느린 요청(일봉 1.5~2.4초)에 맞춘 값이다. 빠른 API를 부르는 쪽은
 * timeoutMs로 훨씬 짧게 잡는다 — 56ms짜리를 12초씩 기다릴 이유가 없다.
 * AI 질문만은 거꾸로 제한을 두지 않는다(ai.ts). 원래 오래 걸리는 요청이라 무응답과 가를 수 없다.
 */
const DEFAULT_TIMEOUT = 12_000

/**
 * 서버가 통째로 응답을 멈췄을 때 요청마다 제한 시간을 다 채우지 않게 하는 차단기.
 *
 * 서버가 죽는 방식이 두 가지인데 체감이 전혀 다르다. 연결을 거절(RST)하면 fetch가
 * 즉시 실패하지만, 들어온 연결을 그냥 삼키면(SYN 드롭) 제한 시간까지 매달린다.
 * 실제로 겪은 건 후자였고, 그때 홈 카드 한 장이 실패를 확정하는 데만 36초가 걸렸다.
 * 재시도까지 겹치면 102종목 표는 몇 분씩 회색으로 남는다.
 *
 * 연달아 무응답이면 서버가 아픈 것이지 이 요청만의 문제가 아니다.
 * 잠시 아예 보내지 않고 즉시 실패시켜서, 화면이 대체 값으로 빨리 넘어가게 한다.
 *
 * 응답이 오기만 하면(500이어도) 서버는 살아 있는 것이므로 바로 되돌린다.
 * 호출 제한으로 인한 500은 재시도로 복구되는 정상 흐름이라 차단기를 건드리면 안 된다.
 * 그래서 문턱이 두 번으로 낮아도 괜찮다 — 여기 걸리는 건 '아예 안 오는' 경우뿐이고,
 * 56ms짜리 요청이 3.5초를 두 번 연달아 넘겼다면 다시 물어도 답은 같다.
 */
const BREAKER_THRESHOLD = 2
const BREAKER_COOLDOWN = 15_000

let deadStreak = 0
let breakerUntil = 0

/**
 * 식은 뒤에는 저절로 한 건이 통과한다. 그게 성공하면 아래 resetBreaker가 풀고,
 * 또 실패하면 여기서 다시 잠긴다. 따로 상태를 둘 필요가 없다.
 */
function tripBreaker(): void {
  deadStreak += 1
  if (deadStreak >= BREAKER_THRESHOLD) {
    breakerUntil = Date.now() + BREAKER_COOLDOWN
  }
}

function resetBreaker(): void {
  deadStreak = 0
  breakerUntil = 0
}

/**
 * 서버가 실패를 알려온 경우.
 *
 * 상태코드와 서버 코드("STOCK404_1")를 함께 실어, 부르는 쪽이 "없는 종목"과
 * "서버 오류"를 가려 다른 화면을 보여줄 수 있게 한다.
 * 네트워크 단절·시간 초과처럼 서버에 닿지 못한 경우는 이 타입이 아니라 그냥 Error다.
 */
export class ApiError extends Error {
  readonly status: number
  /** 서버 에러 코드. 본문이 없거나 JSON이 아니면 null */
  readonly code: string | null

  constructor(message: string, status: number, code: string | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * 200인데 쓸 수 있는 응답이 아닐 때의 문구. 서버가 준 글이 아니라 고정 문구다.
 * 본문이 비었거나 { isSuccess, result } 래퍼가 아니거나, 화면이 반드시 쓰는 값이 비어 있는 경우다.
 */
const MALFORMED_MESSAGE = '서버 응답을 읽을 수 없습니다.'

/**
 * 응답 모양이 어긋났다는 ApiError. src/api/*.ts가 받은 값을 검사하다 쓴다.
 *
 * 그냥 두면 화면이 null.필드를 읽다 그리는 도중에 던지고, 그건 오류 경계까지 올라가
 * 화면 전체를 "화면을 표시하지 못했어요"로 바꾼다. 여기서 ApiError로 바꿔 던지면
 * 화면이 이미 가진 "불러오지 못했어요 + 다시 시도" 경로를 탄다.
 */
export function malformedResponse(): ApiError {
  return new ApiError(MALFORMED_MESSAGE, 200, null)
}

/**
 * 응답 값을 거르지 않고 화면 타입으로 넘긴다. 타입만 맞출 뿐 값은 그대로다.
 *
 * 스웨거 응답 스키마엔 필수 표시가 없어 src/api/*.ts의 응답 인터페이스는 필드를 전부 비어 올 수 있게
 * (`?: T | null`) 적는다. 화면 타입으로 옮길 때 걸러 낸 곳은 그 검사로 타입이 좁혀지고, 걸러 내지 않은 곳만
 * 이걸 쓴다 — **이 호출이 곧 빈 값을 화면(포맷 함수 등)에 맡겼거나 아직 막지 않은 자리다**
 * (docs/수정-결과-2026-09-27.md "F-15에서 드러난 자리").
 */
export function unchecked<T>(value: T | null | undefined): T {
  return value as T
}

function isApiResponse(body: unknown): body is ApiResponse<unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { isSuccess?: unknown }).isSuccess === 'boolean'
  )
}

interface RequestOptions {
  /**
   * 401을 받아도 로그인 화면으로 보내지 않는다.
   * 로그아웃처럼 어차피 나가는 길이라 튕겨낼 이유가 없는 요청에만 쓴다.
   */
  ignoreUnauthorized?: boolean
  /**
   * 이 요청만 다른 제한 시간을 쓴다(ms). null이면 제한 없이 백엔드가 답할 때까지 기다린다 —
   * 원래 오래 걸리는 요청(AI 질문)용이다. 연결이 끊기는 실패는 그대로 곧바로 온다.
   */
  timeoutMs?: number | null
  /**
   * 일부러 짧게 끊는 요청이면 false. 그 시간 초과를 "서버 무응답"으로 세지 않는다(위 차단기). 연결 실패는 그대로 센다.
   * 증권사 토큰 심기(api/stock.ts)가 3초에 끊는데, 증권사가 느린 날 이어지는 상세까지 시간을 넘기면 두 번 연달아로 세어
   * 15초 동안 시세표·뉴스처럼 DB만 읽는 요청까지 막혔다. 서버는 살아 있고 증권사만 느린 것이다.
   */
  countsTowardBreaker?: boolean
}

/**
 * 토큰이 만료되면 서버가 401을 준다. 화면마다 처리하면 다 흩어지므로 여기서 한 번에 끝낸다.
 * client.ts는 컴포넌트가 아니라 navigate()를 직접 쓸 수 없어 `goTo()`를 거친다.
 * 헤더는 clearTokens()가 알려 주므로 페이지를 새로 받을 필요가 없다.
 */
/**
 * 재발급을 기다리는 시간. 로그아웃(3초)처럼 짧게 끊는 요청 앞에서도 돌기 때문에 기본 12초보다 짧게 둔다.
 * 넘기면 재발급 실패로 보고 지금까지처럼 로그인 화면으로 간다.
 */
const REISSUE_TIMEOUT = 5_000

/** 진행 중인 재발급. 동시에 여러 요청이 401을 받아도 재발급은 한 번만 보낸다 */
let reissuing: Promise<string | null> | null = null

/**
 * access token을 다시 받는다(`POST /api/auth/reissue`). 새 토큰을 담고 돌려준다. 못 받으면 null.
 *
 * refresh token은 백엔드가 소셜 로그인 때 **자기 주소에** 심어 둔 HttpOnly 쿠키다(`Path=/api/auth`, `SameSite=None; Secure`,
 * JUBY-BE dev `ea18fec`). 프록시(`/api` → 백엔드)로 부르면 요청 주소가 프론트라 브라우저가 그 쿠키를 싣지 않는다. 그래서 이것만
 * 백엔드를 곧장, 쿠키를 실어(`credentials: 'include'`) 부른다 — 백엔드 CORS가 허용 출처에 한해 자격 증명을 받는다.
 * 다른 사이트 쿠키를 막는 브라우저(사파리 — 2026-09-30 WebKit으로 확인)는 프론트가 백엔드와 같은 사이트(`juby.store` 아래)여야 실린다. 그 전에는
 * 여기서 실패하고 예전처럼 로그인 화면으로 간다.
 *
 * 백엔드는 재발급할 때마다 refresh token을 바꾼다. 같은 토큰으로 두 번 보내면 뒤의 것은 실패하므로 한 번만 보낸다.
 * 이 요청은 차단기와 상관없다 — 원래 요청이 방금 401을 받았으니 서버는 살아 있다.
 */
function reissueAccessToken(): Promise<string | null> {
  reissuing ??= requestReissue().finally(() => {
    reissuing = null
  })
  return reissuing
}

async function requestReissue(): Promise<string | null> {
  try {
    const response = await fetch(`${API_ORIGIN}/api/auth/reissue`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(REISSUE_TIMEOUT),
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (!isApiResponse(body) || !body.isSuccess) return null
    const result = body.result as { accessToken?: unknown } | null
    const raw = typeof result === 'object' && result !== null ? result.accessToken : null
    const token = toUsableToken(typeof raw === 'string' ? raw : null)
    if (token === null) return null
    saveTokens(token)
    return token
  } catch (error: unknown) {
    console.warn('토큰 재발급 실패', error)
    return null
  }
}

/**
 * 401을 받은 요청을 다시 보낼 토큰. 없으면 null(로그인 화면으로 간다).
 *
 * 보낸 뒤에 토큰이 바뀌었으면(다른 요청이나 다른 탭이 이미 재발급했다) 재발급 없이 그걸 쓴다. 재발급이 실패해도 한 번 더 본다 —
 * 두 탭이 같은 refresh token으로 동시에 재발급하면 늦은 쪽은 실패하는데, 그 사이 앞선 탭이 새 토큰을 담아 뒀을 수 있다.
 */
async function tokenForRetry(sentToken: string): Promise<string | null> {
  const current = getAccessToken()
  if (current !== null && current !== sentToken) return current
  const renewed = await reissueAccessToken()
  if (renewed !== null) return renewed
  const latest = getAccessToken()
  return latest !== null && latest !== sentToken ? latest : null
}

function redirectToLogin(): void {
  // 이미 로그인 화면이면 보낼 곳이 없다. 여기서 401이 또 나면 무한히 새로고침한다
  if (window.location.pathname === '/login') {
    return
  }
  // 토큰 없이 보낸 요청의 401은 '만료'가 아니다. 둘러보던 사람을 끌고 가면 안 된다
  if (!isLoggedIn()) {
    return
  }

  clearTokens()
  // 다시 로그인하면 보던 자리로 돌아온다
  goTo(loginPathFrom(window.location.pathname + window.location.search))
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options?: RequestOptions,
  /** 401 뒤 새 토큰으로 다시 보낸 요청이면 true. 재발급은 요청마다 한 번뿐이다 */
  isRetry = false,
): Promise<T> {
  /*
   * 무엇보다 먼저 확인한다. 아래 어떤 경로로도 fetch에 닿지 못하게 여기서 끊는다.
   * 증권사 계정 보호를 위한 조치라 실수로 새어 나가면 안 된다.
   */
  if (API_DISABLED) {
    throw new Error(
      `백엔드 호출이 차단되어 있습니다 (src/api/client.ts의 API_DISABLED) ${path}`,
    )
  }

  // 방금 전까지 연달아 무응답이었다. 보내봐야 제한 시간만 태운다
  if (Date.now() < breakerUntil) {
    throw new Error(`서버 무응답 상태 ${path}`)
  }

  // ?? 로 쓰면 null(제한 없음)까지 기본값으로 바뀐다
  const timeoutMs =
    options?.timeoutMs === undefined ? DEFAULT_TIMEOUT : options.timeoutMs
  // 실어 보낸 토큰. 401이 왔을 때 그 사이 다른 요청이 재발급했는지 가르는 데 쓴다
  const sentToken = getAccessToken()
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      // 토큰 헤더는 항상 붙이고, 호출부가 더 넣고 싶은 헤더는 뒤에 합친다
      headers: { ...authHeaders(sentToken), ...init?.headers },
      signal: timeoutMs === null ? undefined : AbortSignal.timeout(timeoutMs),
    })
  } catch (error: unknown) {
    // 제한 시간 초과든 연결 실패든 '서버에 닿지 못했다'는 점은 같다. 일부러 짧게 끊은 요청의 시간 초과만 빼고 센다
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    if (!(timedOut && options?.countsTowardBreaker === false)) tripBreaker()
    /*
     * 제한 시간을 넘기면 TimeoutError로 온다. 부르는 쪽은 '왜 실패했는지'가 아니라
     * '실패했다'만 알면 되므로, 서버가 안 뜬 경우와 같은 모양의 에러로 맞춰 던진다.
     */
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(`응답 없음 (${timeoutMs}ms 초과) ${path}`)
    }
    throw error
  }

  // 상태 코드가 무엇이든 응답이 왔다는 건 서버가 살아 있다는 뜻이다
  resetBreaker()

  /*
   * 토큰을 실어 보냈는데 401이면 대개 30분짜리 access token이 만료된 것이다. 새 토큰을 받아 같은 요청을 한 번 다시 보낸다
   * — 예전엔 곧장 토큰을 지우고 로그인 화면으로 보내 30분마다 로그인이 풀렸다. ignoreUnauthorized 요청(로그아웃·공개 화면의
   * 내 성향)도 다시 보낸다. 만료된 토큰으로 로그아웃하면 서버가 refresh token을 못 지운다.
   * 토큰 없이 보낸 요청의 401은 만료가 아니라 재발급할 게 없다.
   */
  if (response.status === 401 && sentToken !== null && !isRetry) {
    const retryToken = await tokenForRetry(sentToken)
    if (retryToken !== null) return requestJson<T>(path, init, options, true)
  }

  if (response.status === 401 && options?.ignoreUnauthorized !== true) {
    redirectToLogin()
  }

  /*
   * 본문은 한 번만 읽을 수 있으니 문자열로 받아 둔다.
   *
   * 실패 응답에도 서버가 { isSuccess: false, message } 를 담아 준다
   * (ApiResponse.onFailure, 401은 CustomEntryPoint). 상태코드만 보고 버리면
   * "해당 종목이 존재하지 않습니다" 같은 서버 설명이 "요청 실패 (404)"로 뭉개진다.
   *
   * 반대로 게이트웨이 오류 페이지(HTML)나 빈 본문처럼 JSON이 아닌 응답도 온다.
   * 그때 response.json()이 던지는 SyntaxError를 그대로 흘리면 부르는 쪽은
   * "Unexpected token <" 를 보게 되므로, 파싱 실패는 상태코드 문장으로 바꿔 던진다.
   */
  const text = await response.text()
  let body: unknown = null

  if (text !== '') {
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(
        response.ok
          ? `응답을 읽을 수 없습니다 (${response.status}) ${path}`
          : `요청 실패 (${response.status}) ${path}`,
      )
    }
  }

  if (!response.ok) {
    throw new ApiError(
      serverField(body, 'message') ?? `요청 실패 (${response.status})`,
      response.status,
      serverField(body, 'code'),
    )
  }

  /*
   * 성공인데 본문이 비었거나 래퍼가 아니다. 그대로 넘기면 unwrap이 null.isSuccess를 읽다
   * TypeError로 던지고, 래퍼 없는 JSON은 message ""·code undefined인 ApiError가 됐다.
   */
  if (!isApiResponse(body)) {
    throw new ApiError(MALFORMED_MESSAGE, response.status, null)
  }

  return body as T
}

/** 실패 응답 본문에서 문자열 필드 하나를 꺼낸다. 없으면 null */
function serverField(body: unknown, key: 'message' | 'code'): string | null {
  if (typeof body !== 'object' || body === null) return null
  const value = (body as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** { isSuccess, result } 래퍼를 벗긴다. 실패 코드는 서버가 준 message로 던진다 */
function unwrap<T>(body: ApiResponse<T>): T {
  if (!body.isSuccess) {
    throw new ApiError(body.message, 200, body.code)
  }
  return body.result
}

/**
 * { isSuccess, result } 래퍼를 벗겨 result만 반환한다.
 * 2026-08-11부터 모든 컨트롤러가 이 래퍼를 쓴다. 래퍼 없는 응답은 더 이상 없다.
 */
export async function get<T>(path: string, options?: RequestOptions): Promise<T> {
  return unwrap(await requestJson<ApiResponse<T>>(path, undefined, options))
}

/** 서버 자원을 지운다. 본문 없이 경로만 보낸다 */
export async function remove<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  return unwrap(
    await requestJson<ApiResponse<T>>(path, { method: 'DELETE' }, options),
  )
}

/**
 * 서버에 값을 보낼 때 쓴다. GET과 다른 점은 두 가지뿐이다.
 * 보낼 내용을 JSON 문자열로 바꾸고, 그게 JSON이라고 Content-Type으로 알려준다.
 */
export async function post<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return sendJson<T>('POST', path, body, options)
}

/** 일부만 고친다(내 정보 수정). 보내는 방식은 post와 같고 method만 다르다 */
export async function patch<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return sendJson<T>('PATCH', path, body, options)
}

async function sendJson<T>(
  method: 'POST' | 'PATCH',
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return unwrap(
    await requestJson<ApiResponse<T>>(
      path,
      {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      options,
    ),
  )
}
