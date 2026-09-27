import { useEffect, useState } from 'react'
import { getMyPersonalityOnPublicPage } from '../api/member'

/**
 * 로그인 없이도 쓰는 화면(AI·백테스트)이 보여주는 내 성향.
 *
 * "없음"과 "못 불러옴"을 가른다. 예전엔 모든 실패를 없음으로 삼켜, 성향이 있는 회원이 서버 500을 만나면
 * "투자성향 검사하기"를 보고 다시 검사하러 가 멀쩡한 성향을 덮어쓸 수 있었다.
 * 불러오는 중도 따로 둔다 — 그 짧은 사이에 "아직 안 하셨어요"가 비치지 않게.
 */
type MyPersonality =
  /** 비로그인. 부르지 않는다 */
  | { kind: 'idle' }
  | { kind: 'loading' }
  /** 검사하지 않은 회원(404 MEMBER404_2) 또는 토큰 만료(401 — 토큰을 지운다) */
  | { kind: 'none' }
  /** 500·끊김 등. 다시 시도할 수 있다 */
  | { kind: 'error' }
  | { kind: 'found'; name: string }

export function useMyPersonality(enabled: boolean): {
  personality: MyPersonality
  retry: () => void
} {
  const [personality, setPersonality] = useState<MyPersonality>(
    enabled ? { kind: 'loading' } : { kind: 'idle' },
  )
  /** '다시 시도'가 올린다. 아래 effect를 한 번 더 돌린다 */
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    // 로그아웃하면(다른 탭 포함) 받아 둔 성향을 비운다
    if (!enabled) {
      setPersonality({ kind: 'idle' })
      return
    }
    let isStale = false
    setPersonality({ kind: 'loading' })

    getMyPersonalityOnPublicPage()
      .then((info) => {
        if (isStale) return
        setPersonality(
          info === null ? { kind: 'none' } : { kind: 'found', name: info.investPersonality },
        )
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.warn('투자성향 조회 실패', error)
        setPersonality({ kind: 'error' })
      })

    return () => {
      isStale = true
    }
  }, [enabled, retryCount])

  return { personality, retry: () => setRetryCount((count) => count + 1) }
}
