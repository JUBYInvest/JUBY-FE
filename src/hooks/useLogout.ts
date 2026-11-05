import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'

/**
 * 로그아웃 단추의 상태와 동작. 마이페이지 사이드바(MypageLayout)와 내 정보의 계정 관리(MypageProfilePage)가 같이 쓴다.
 *
 * logout()은 던지지 않는다 — 서버 호출이 실패해도 토큰은 지운다. 그래서 실패 안내가 없다. 나가겠다고 누른 사람을 로그인 상태로
 * 두는 편이 더 위험하다. 끝나면 탈퇴와 같이 홈으로 보낸다. replace는 방금까지 있던 마이페이지를 기록에 남기지 않는다
 * (더 뒤의 마이페이지 기록으로 돌아가더라도 MypageLayout의 로그인 검사가 /login으로 보낸다).
 * 머리글이 '로그인'으로 돌아가는 건 clearTokens가 알아서 알린다.
 */
export function useLogout(): { isLoggingOut: boolean; logOut: () => void } {
  const navigate = useNavigate()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function run() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    await logout()
    navigate('/', { replace: true })
  }

  return { isLoggingOut, logOut: () => void run() }
}
