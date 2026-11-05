import { useState } from 'react'
import { getMemberInfo } from '../api/member'
import LoginModal from '../components/LoginModal'
import NicknameModal from '../components/NicknameModal'
import { useIsLoggedIn } from './useIsLoggedIn'

/**
 * 커뮤니티에서 쓰기 전 확인 — 비로그인이면 로그인 안내, 닉네임이 없으면 닉네임 창을 띄우고, 다 되면 하던 일을 이어 간다.
 * `nicknameNow()`는 서버가 403 COMMUNITY403_1(닉네임 없음)을 줬을 때 곧바로 닉네임 창을 연다.
 * 화면은 돌려준 `modals`를 한 번 그린다
 */
export function useWriteGate() {
  const loggedIn = useIsLoggedIn()
  const [loginOpen, setLoginOpen] = useState(false)
  const [pending, setPending] = useState<(() => void) | null>(null)

  const ask = (next: () => void) => setPending(() => next)

  const ensure = (next: () => void) => {
    if (!loggedIn) {
      setLoginOpen(true)
      return
    }
    getMemberInfo()
      .then((member) => (member.nickname === null ? ask(next) : next()))
      // 회원 정보를 못 받았으면 그냥 이어 간다 — 닉네임이 없으면 서버가 403으로 알려 준다
      .catch(() => next())
  }

  /** 로그인만 확인한다(좋아요 — 닉네임은 없어도 된다) */
  const requireLogin = (next: () => void) => {
    if (loggedIn) next()
    else setLoginOpen(true)
  }

  const modals = (
    <>
      <LoginModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
      <NicknameModal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onSaved={() => {
          const next = pending
          setPending(null)
          next?.()
        }}
      />
    </>
  )

  return { ensure, requireLogin, nicknameNow: ask, modals, loggedIn }
}
