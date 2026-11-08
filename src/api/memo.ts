import { getAccountId } from '../utils/auth'

/**
 * 같은 탭에서 잠깐 다시 쓰는 값(상세 1분, 뉴스 10분, 거래대금 순위 1분, 임시 차트 5분, 공용 조회 1분). 메모리에만 두므로 새로고침하면 비고, 실패는 담지 않는다.
 * 담을 때 만료된 항목을 걷는다 — 오래 열어 둔 탭에서 종목마다 전체 일봉이 쌓이지 않게.
 */
export interface Memo<T> {
  savedAt: number
  value: T
}

/** 담은 지 maxAge가 안 됐는가. 시계를 되돌려 미래에 담은 것처럼 보이면 믿지 않는다(utils/cache.ts isStampWithin과 같은 생각) */
function isFresh(entry: Memo<unknown>, maxAge: number, now: number): boolean {
  const age = now - entry.savedAt
  return age >= 0 && age < maxAge
}

/** 담은 지 maxAge 안이면 그 값, 지났으면 지우고 null */
export function readMemo<T>(memo: Map<string, Memo<T>>, key: string, maxAge: number): T | null {
  const entry = memo.get(key)
  if (entry === undefined) return null
  if (!isFresh(entry, maxAge, Date.now())) {
    memo.delete(key)
    return null
  }
  return entry.value
}

/** 담고, 같은 메모에서 maxAge가 지난 항목을 지운다 */
export function writeMemo<T>(memo: Map<string, Memo<T>>, key: string, value: T, maxAge: number): void {
  const now = Date.now()
  for (const [oldKey, entry] of memo) {
    if (!isFresh(entry, maxAge, now)) memo.delete(oldKey)
  }
  memo.set(key, { savedAt: now, value })
}

/** 열쇠마다 받는 중이거나 받아 둔 요청 */
const requests = new Map<string, { at: number; promise: Promise<unknown> }>()

/**
 * 여러 화면이 같이 쓰는 조회를 한 번만 보낸다 — 홈·백테스트·커뮤니티의 시세표, 관심종목·마이페이지의 관심종목 목록처럼.
 * 같은 열쇠로 maxAge 안에 다시 부르면 같은 요청(받는 중이면 그 요청)을 돌려준다. 실패는 담지 않는다.
 * 값을 바꾸는 요청 뒤에는 forget으로 지운다. 회원마다 다른 값은 열쇠에 계정을 넣는다(memberKey).
 */
export function shared<T>(key: string, maxAge: number, load: () => Promise<T>): Promise<T> {
  const hit = requests.get(key)
  if (hit !== undefined && Date.now() - hit.at < maxAge) return hit.promise as Promise<T>
  const promise = load()
  requests.set(key, { at: Date.now(), promise })
  promise.catch(() => {
    if (requests.get(key)?.promise === promise) requests.delete(key)
  })
  return promise
}

/** 이름이 이것으로 시작하는 열쇠를 모두 지운다(계정이 붙은 열쇠까지) */
export function forget(...names: string[]): void {
  for (const key of [...requests.keys()]) {
    if (names.some((name) => key === name || key.startsWith(`${name}:`))) requests.delete(key)
  }
}

/** 회원마다 다른 값의 열쇠 — 로그인·로그아웃하면 다른 열쇠가 된다 */
export function memberKey(name: string): string {
  return `${name}:${getAccountId() ?? 'guest'}`
}
