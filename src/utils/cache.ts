/**
 * 화면을 빨리 띄우려고 잠깐 저장해두는 값.
 * 토큰은 utils/auth.ts가 따로 맡는다. 여기 담기는 건 언제 사라져도 되는 것들뿐이라
 * 읽기·쓰기 어느 쪽이 실패해도 그냥 없는 셈 치고 넘어간다.
 */
interface Entry<T> {
  savedAt: number
  value: T
}

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null

    const entry: unknown = JSON.parse(raw)
    /*
     * 모양부터 확인한다. 예전 버전이 다른 모양으로 저장했거나 사람이 손댄 값이면
     * savedAt이 없는데, 그때 Date.now() - undefined 는 NaN이라 "> maxAgeMs"가
     * 거짓이 되어 만료 검사를 그냥 통과했다. 모양이 다르면 없는 셈 친다.
     */
    if (typeof entry !== 'object' || entry === null) return null
    if (!('savedAt' in entry) || !('value' in entry)) return null
    const { savedAt, value } = entry as Entry<T>
    if (typeof savedAt !== 'number' || Date.now() - savedAt > maxAgeMs) {
      return null
    }

    return value
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, value: T): void {
  const entry: Entry<T> = { savedAt: Date.now(), value }

  try {
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
  }
}

/*
 * TTL 없이 값 하나를 담는 칸. 위 readCache와 같이 실패는 "없는 셈" 친다.
 *
 * localStorage를 못 쓰는 브라우저(사이트 데이터 차단, 저장 공간 꽉 참)에서도 그 탭 안에서는 기억하도록 메모리에도 둔다.
 * 읽을 때는 localStorage에 값이 있으면 그걸 믿는다 — 다른 탭이 고쳐 쓴 값(예: 0으로 지움)이 이 탭의 메모리보다 최신이다.
 * 메모리는 localStorage를 읽지 못했거나 그 키가 없을 때만 쓴다.
 */
const held = new Map<string, string>()

function readRaw(key: string): string | null {
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) return stored
  } catch {
  }
  return held.get(key) ?? null
}

function writeRaw(key: string, value: string): void {
  held.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
  }
}

/**
 * 때(ms) 하나. 증권사 호출 간격·토큰 심기·서버 오류 표시가 쓴다(api/stock.ts).
 * 없거나 숫자가 아니면 0이다. 0을 쓰면 "없음"으로 지운 것과 같다.
 */
export function readStamp(key: string): number {
  const value = Number(readRaw(key))
  return Number.isFinite(value) ? value : 0
}

export function writeStamp(key: string, value: number): void {
  writeRaw(key, String(value))
}

/** JSON 값 하나. 모양은 읽는 쪽이 검사한다(api/cardSeries.ts). 읽지 못하면 null */
export function readJson(key: string): unknown {
  const raw = readRaw(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value))
  } catch {
  }
}
