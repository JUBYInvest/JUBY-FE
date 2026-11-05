/**
 * 토큰을 다루는 유일한 곳.
 * localStorage는 XSS에 취약해서 언젠가 HttpOnly 쿠키로 옮길 수 있는데,
 * 접근이 이 파일에만 있으면 그때 이 파일만 고치면 된다.
 *
 * 브라우저에 두는 건 access token 하나다. refresh token은 백엔드가 로그인 때 HttpOnly 쿠키(`Path=/api/auth`)로
 * 따로 두고 자바스크립트는 읽을 수 없다.
 *
 * 로그인 여부가 바뀌면 구독자에게 알린다(subscribeAuth). 그래서 로그인·탈퇴·토큰 만료에
 * 페이지를 새로 받지 않아도 헤더가 바뀐다.
 */
const ACCESS_TOKEN_KEY = 'accessToken'
/** 예전(쿠키로 옮기기 전)에 저장해 둔 refresh token 키. 더 쓰지 않고 지우기만 한다 */
const LEGACY_REFRESH_TOKEN_KEY = 'refreshToken'

/**
 * localStorage를 못 쓸 때 대신 토큰을 담아 두는 곳.
 *
 * 브라우저 설정에서 사이트 데이터를 막으면 `window.localStorage`에 손대는 순간
 * SecurityError가 난다(저장 공간이 꽉 차면 쓰기만 실패하기도 한다). 그 예외를 여기서
 * 흘려보내면 `isLoggedIn()`이 던지고, 그걸 **렌더 중에** 읽는 Header가 그리다 멈춘다.
 * 머리글은 ErrorBoundary 밖이라 오류 화면조차 못 뜨고 화면이 통째로 하얘진다.
 *
 * 그래서 막혔으면 여기 담는다. 새로고침하면 사라지지만 적어도 그 탭에서는 로그인해서
 * 쓸 수 있다. cache.ts도 같은 이유로 실패를 삼키지만, 그쪽 값은 없는 셈 쳐도 되는
 * 것들이라 따로 담아 두지 않는다.
 */
const fallback = new Map<string, string>()

/**
 * 토큰으로 쓸 수 있는 값을 다듬어 돌려준다. 못 쓰면 null.
 *
 * 앞뒤 공백을 자르고, 빈 값과 "null"·"undefined" 글자는 없는 것으로 본다. 안 그러면 콜백 주소에
 * 빈 값이 달려 올 때 그대로 저장돼 머리글이 로그인 상태로 바뀌고, 요청에
 * "Bearer null"이 실린다. 콜백(저장 전)과 읽는 자리(이미 저장된 값) 모두 이 규칙을 쓴다.
 */
export function toUsableToken(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return null
  return trimmed
}

function readToken(key: string): string | null {
  /*
   * 담아 둔 게 있으면 그게 최신이다. 읽기는 되는데 쓰기만 실패한 경우
   * localStorage에는 한물간 값이 남아 있을 수 있다.
   */
  const held = fallback.get(key)
  if (held !== undefined) return toUsableToken(held)

  try {
    return toUsableToken(localStorage.getItem(key))
  } catch {
    return null
  }
}

function writeToken(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
    // 제대로 들어갔으면 예전에 담아 둔 값은 더 볼 일이 없다
    fallback.delete(key)
  } catch {
    fallback.set(key, value)
  }
}

function removeToken(key: string): void {
  fallback.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // 애초에 저장된 적이 없다. 위에서 담아 둔 것만 지우면 끝이다
  }
}

/** 로그인 여부가 바뀌면 다시 그려야 하는 화면들 */
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * 로그인 여부 변화를 구독한다. `useIsLoggedIn`이 이걸 쓴다.
 * 돌려주는 함수를 부르면 구독이 끊긴다.
 */
export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/*
 * 다른 탭에서 로그인하거나 나가면 이 탭도 따라 바뀐다.
 * storage 이벤트는 값을 바꾼 탭 자신에게는 오지 않으므로 위 notify와 겹치지 않는다.
 * key가 null인 경우는 localStorage 전체를 비운 것이다.
 */
window.addEventListener('storage', (event) => {
  if (event.key === ACCESS_TOKEN_KEY || event.key === null) notify()
})

/** 로그인 콜백이 받은 access token을 담는다. refresh token은 서버 쿠키라 받지 않는다 */
export function saveTokens(accessToken: string): void {
  writeToken(ACCESS_TOKEN_KEY, accessToken)
  notify()
}

export function clearTokens(): void {
  removeToken(ACCESS_TOKEN_KEY)
  // 예전 로그인이 남긴 값이 있으면 같이 지운다
  removeToken(LEGACY_REFRESH_TOKEN_KEY)
  notify()
}

/** 요청 헤더에 실을 토큰. client.ts가 쓴다 */
export function getAccessToken(): string | null {
  return readToken(ACCESS_TOKEN_KEY)
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null
}

/**
 * 지금 로그인한 계정의 번호. access token(JWT)의 subject다 — 백엔드 `JwtUtil`이 회원 번호를 적는다.
 * 토큰이 없거나 JWT 모양이 아니면 null. 계정에 딸린 브라우저 저장값(최근 본 백테스트, `utils/recentBacktests.ts`)의 주인을
 * 가르는 데 쓴다 — 로그아웃 없이 다른 계정으로 로그인해도 앞 사람의 기록이 보이지 않게.
 * 서명은 검사하지 않는다. 누구인지 가르는 용도일 뿐이고 권한은 서버가 본다.
 */
export function getAccountId(): string | null {
  const token = getAccessToken()
  if (token === null) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof payload !== 'object' || payload === null) return null
    const subject = (payload as Record<string, unknown>).sub
    return typeof subject === 'string' && subject !== '' ? subject : null
  } catch {
    return null
  }
}

/*
 * 로그인 뒤 돌아갈 자리. 소셜 로그인은 백엔드·네이버 등 바깥 화면을 거쳐 페이지가 새로 뜨므로 메모리에 둘 수 없어
 * sessionStorage에 둔다(탭마다 따로, 탭을 닫으면 사라짐). 저장소를 못 쓰면 없는 셈 친다 — 홈으로 갈 뿐이다.
 */
const RETURN_PATH_KEY = 'loginReturnPath'

/** 소셜 로그인 버튼을 누를 때 부른다. null이면 예전에 적어 둔 자리를 지운다 */
export function rememberReturnPath(path: string | null): void {
  try {
    if (path === null) window.sessionStorage.removeItem(RETURN_PATH_KEY)
    else window.sessionStorage.setItem(RETURN_PATH_KEY, path)
  } catch {
    // 사이트 데이터가 막힌 브라우저. 돌아갈 자리 없이 홈으로 간다
  }
}

/** 콜백이 한 번 꺼내 쓴다. 꺼내면 지운다(다음 로그인에 남지 않게) */
export function takeReturnPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(RETURN_PATH_KEY)
    window.sessionStorage.removeItem(RETURN_PATH_KEY)
    return path
  } catch {
    return null
  }
}
