import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { saveTokens, takeReturnPath, toUsableToken } from '../utils/auth'
import { loginPathFrom, toReturnPath } from '../utils/navigation'
import styles from './OAuthCallbackPage.module.css'

/**
 * 소셜 로그인을 마친 백엔드가 토큰을 주소 뒤에 달아 되돌려보내는 자리.
 * 사용자에게 보여줄 화면이 아니라 토큰을 옮겨 담고 바로 떠나는 중간 지점이다.
 */
export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    // 빠진 것뿐 아니라 빈 값·공백·"null" 글자도 없는 것으로 본다(toUsableToken)
    const accessToken = toUsableToken(searchParams.get('accessToken'))
    const refreshToken = toUsableToken(searchParams.get('refreshToken'))

    // 로그인 화면이 적어 둔 돌아갈 자리. 한 번 꺼내면 지워진다. 다시 한 번 규칙에 맞는지 본다
    const returnPath = toReturnPath(takeReturnPath())

    if (accessToken === null || refreshToken === null) {
      // replace를 주면 뒤로 가기로 이 빈 콜백에 다시 돌아오지 않는다. 돌아갈 자리는 다시 달아 둔다
      navigate(loginPathFrom(returnPath ?? '/'), { replace: true, state: { loginFailed: true } })
      return
    }

    saveTokens(accessToken, refreshToken)

    /*
     * 토큰을 담았다고 헤더에 알리는 건 saveTokens가 한다. 그래서 여기서는
     * 화면만 옮기면 된다 — 주소가 토큰을 달고 있으니 replace로 기록에서 지운다.
     * 로그인 화면으로 오기 전 자리가 있으면 그리로, 없으면 홈으로 간다.
     */
    navigate(returnPath ?? '/', { replace: true })
  }, [searchParams, navigate])

  return <p className={styles.message}>로그인 중</p>
}
