/**
 * 컴포넌트가 아닌 곳에서 화면을 옮기기 위한 다리. 지금은 `client.ts`의 401 처리만 쓴다.
 *
 * react-router의 navigate는 컴포넌트 안에서만 얻을 수 있다. 그래서 App이 그려질 때
 * 여기에 맡겨 두고, 바깥에서는 `goTo()`로 부른다. 맡겨진 게 없으면(아직 안 그려졌거나
 * 라우터 밖이면) 주소창을 통째로 바꾸는 예전 방식으로 물러선다 — 못 옮기는 것보다 낫다.
 */
type Navigate = (path: string) => void

let navigate: Navigate | null = null

/** App이 자기 navigate를 맡긴다. 떠날 때 null로 되돌린다 */
export function setNavigator(next: Navigate | null): void {
  navigate = next
}

export function goTo(path: string): void {
  if (navigate === null) {
    window.location.href = path
    return
  }
  navigate(path)
}

/**
 * 로그인 뒤 돌려보낼 수 있는 주소인가. 쓸 수 있으면 그 경로(주소 뒤 조건 포함), 아니면 null.
 *
 * 이 사이트 안의 경로만 받는다 — `//evil.com`·`https://…`처럼 바깥으로 나가는 값은 버린다(남의 사이트로
 * 넘겨주는 통로가 되면 안 된다). 로그인·콜백 화면도 버린다. 돌아가 봐야 또 로그인이다.
 */
export function toReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin) return null
    /*
     * 풀어 낸 경로도 `//`로 시작하면 안 된다. `/.//evil.com`·`/a/..//evil.com`은 같은 출처로 풀리지만 경로가
     * `//evil.com`이 된다. 이 값을 navigate에 넣으면 React Router가 pushState 실패 뒤 location.assign으로 넘겨 바깥으로 나간다.
     */
    if (url.pathname.startsWith('//')) return null
    if (url.pathname === '/login' || url.pathname.startsWith('/oauth')) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/**
 * 지금 자리를 달고 로그인 화면으로 가는 주소(`/login?next=…`). 로그인하면 그 자리로 돌아온다
 * (사용자 결정 2026-09-27 — 예전엔 늘 홈으로 갔다). 홈이거나 돌아갈 수 없는 자리면 그냥 `/login`,
 * 이미 로그인 화면이면 그 주소를 그대로 둔다(달고 온 자리를 잃지 않게).
 */
export function loginPathFrom(path: string): string {
  if (path === '/login' || path.startsWith('/login?')) return path
  const next = toReturnPath(path)
  return next === null || next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
}
