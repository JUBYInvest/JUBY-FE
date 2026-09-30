import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { needsOnboarding } from '../api/member'
import { saveTokens, takeReturnPath, toUsableToken } from '../utils/auth'
import { loginPathFrom, toReturnPath } from '../utils/navigation'
import styles from './OAuthCallbackPage.module.css'

interface Props {
  /** 백엔드 실패 핸들러가 보내는 자리(`/oauth2/error?error=…`)면 참. 토큰을 찾지 않고 곧바로 실패로 보낸다 */
  failed?: boolean
}

/**
 * 소셜 로그인을 마친 백엔드가 되돌려보내는 자리. 사용자에게 보여줄 화면이 아니라 토큰을 옮겨 담고 바로 떠나는 중간 지점이다.
 *
 * 성공이면 `/oauth2/callback#accessToken=<AT>`로 온다(주소 해시라 서버 기록에 남지 않는다). refresh token은 백엔드가
 * HttpOnly 쿠키로 따로 둬서 자바스크립트가 읽을 수 없다 — 찾지도 저장하지도 않는다. 실패면 `/oauth2/error?error=<코드>`다.
 */
/** 첫 로그인 회원을 보내는 성향테스트 주소. 가려던 자리가 홈이 아니면 `?next=`로 달아 검사를 마친 뒤 그리로 간다 */
function onboardingPath(destination: string): string {
  return destination === '/' ? '/personality-test' : `/personality-test?next=${encodeURIComponent(destination)}`
}

export default function OAuthCallbackPage({ failed = false }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  /*
   * 한 번만 처리한다. 개발 서버(StrictMode)는 effect를 두 번 돌리는데, 두 번째는 첫 번째가 꺼내 지운 돌아갈 자리를
   * 못 찾아 홈으로 덮어썼다. 로컬 백엔드는 로그인 뒤 개발 서버 주소로 보낸다.
   */
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true

    // 로그인 화면이 적어 둔 돌아갈 자리. 한 번 꺼내면 지워진다. 다시 한 번 규칙에 맞는지 본다
    const returnPath = toReturnPath(takeReturnPath())

    // 빠진 것뿐 아니라 빈 값·공백·"null" 글자도 없는 것으로 본다(toUsableToken)
    const accessToken = failed
      ? null
      : toUsableToken(new URLSearchParams(location.hash.slice(1)).get('accessToken'))

    if (accessToken === null) {
      // 실패 사유는 화면에 쓰지 않는다(소셜 쪽 오류 코드가 그대로 온다)
      if (failed) console.warn('소셜 로그인 실패', new URLSearchParams(location.search).get('error'))
      // replace를 주면 뒤로 가기로 이 빈 콜백에 다시 돌아오지 않는다. 돌아갈 자리는 다시 달아 둔다
      navigate(loginPathFrom(returnPath ?? '/'), { replace: true, state: { loginFailed: true } })
      return
    }

    saveTokens(accessToken)

    /*
     * 토큰을 담았다고 헤더에 알리는 건 saveTokens가 한다. 그래서 여기서는
     * 화면만 옮기면 된다 — 주소가 토큰을 달고 있으니 replace로 기록에서 지운다.
     * 로그인 화면으로 오기 전 자리가 있으면 그리로, 없으면 홈으로 간다.
     *
     * 성향테스트를 아직 안 한 회원(onboarded=false)은 검사부터 한다(사용자 결정 2026-09-30). 마치면 가려던 자리로
     * 돌아간다(`?next=`, PersonalityResultPage). 온보딩 여부를 못 받으면 그냥 가려던 자리로 간다 — 검사는 권하는 것일 뿐이다.
     * 묻는 동안은 "로그인 중"이 그대로 보인다.
     */
    const destination = returnPath ?? '/'
    void needsOnboarding()
      .catch((error: unknown) => {
        console.warn('온보딩 여부 조회 실패', error)
        return false
      })
      .then((needed) => {
        const toTest = needed && !destination.startsWith('/personality-test')
        navigate(toTest ? onboardingPath(destination) : destination, { replace: true })
      })
  }, [failed, location.hash, location.search, navigate])

  return <p className={styles.message}>로그인 중</p>
}
