import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { API_ORIGIN } from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { SocialType } from '../types/member'
import { rememberReturnPath } from '../utils/auth'
import { readLastLoginProvider } from '../utils/lastLogin'
import { toReturnPath } from '../utils/navigation'
import styles from './LoginPage.module.css'

/** 소셜 로그인 단추. 국내에서 많이 쓰는 순(카카오 → 네이버 → Google)이고, 글자는 누르면 일어나는 일 그대로다 */
const PROVIDERS: { id: string; type: SocialType; label: string; icon: string; className: string }[] = [
  { id: 'kakao', type: 'KAKAO', label: '카카오로 로그인', icon: '/social/kakao.svg', className: styles.kakao },
  { id: 'naver', type: 'NAVER', label: '네이버로 로그인', icon: '/social/naver.svg', className: styles.naver },
  { id: 'google', type: 'GOOGLE', label: 'Google로 로그인', icon: '/social/google.svg', className: styles.google },
]

/**
 * 로그인하면 이어지는 순서. 정말 차례가 있다 — 첫 로그인 회원은 성향테스트부터 하고(OAuthCallbackPage),
 * 백테스트는 그 성향에 맞는 전략을 미리 고르고, AI는 그 성향을 알고 답한다
 */
const STEPS = [
  { title: '투자성향 테스트', description: '처음 로그인하면 10문항으로 내 성향부터 찾아요' },
  { title: '주식 백테스트', description: '성향에 맞는 전략을 지난 주가에 적용해 점수로 봐요' },
  { title: 'AI 주가분석', description: '궁금한 종목을 AI에게 말로 물어봐요' },
]

export default function LoginPage() {
  useDocumentTitle('로그인')
  /*
   * 콜백 페이지가 토큰을 못 받으면 이 state를 달아 되돌려보낸다.
   * 주소에 안 붙으므로 헤더의 '로그인'으로 새로 들어오면 안내가 따라오지 않는다.
   * (새로고침은 브라우저가 state를 들고 있어서 그대로 남는다)
   */
  const location = useLocation()
  const state = location.state as { loginFailed?: boolean } | null
  const hasLoginFailed = state?.loginFailed === true
  /** 로그인 뒤 돌아갈 자리(`?next=`). 로그인 화면으로 보낸 쪽이 달아 준다(loginPathFrom) */
  const returnPath = toReturnPath(new URLSearchParams(location.search).get('next'))
  /** 이 브라우저에서 지난번에 로그인한 곳. 그 단추에 "최근 사용"을 붙인다(utils/lastLogin) */
  const [lastProvider] = useState(readLastLoginProvider)

  /*
   * fetch를 쓰면 안 된다. 이 주소는 백엔드가 302로 네이버·카카오·구글 로그인 화면에
   * 넘겨주는 자리이고, 사용자가 그 화면을 직접 보고 아이디를 입력해야 한다.
   * fetch는 배경에서 도는 통신이라 화면을 옮기지 못하므로 주소창 자체를 이동시킨다.
   *
   * 로그인을 마친 백엔드는 `/oauth2/callback#accessToken=…`(실패면 `/oauth2/error?error=…`)으로 되돌려보낸다
   * (JUBY-BE dev `7e5b023`, 2026-09-28). 되돌아올 주소는 백엔드 설정(`FRONTEND_URL`)이 정한다 — 이 화면이 아니다.
   */
  function handleSocialLogin(provider: string) {
    // 바깥 화면을 거쳐 페이지가 새로 뜨므로 돌아갈 자리를 적어 두고 떠난다. 콜백이 꺼내 쓴다
    rememberReturnPath(returnPath)
    // 주소창 이동이라 프록시를 탈 수 없다. 백엔드 주소로 곧장 간다(client.ts의 API_ORIGIN)
    window.location.href = `${API_ORIGIN}/oauth2/authorization/${provider}`
  }

  /*
   * 2026-11-02 다시 디자인(사용자 "너무나 별론데… 최신 환경에 맞춰서 아예 다시"). 가운데 한 줄에 제목·안내·글자가 든 소셜 단추 셋을 두고,
   * 아래에 로그인하면 이어지는 세 칸을 둔다. 예전엔 아이콘만 있는 동그라미 셋이 오른쪽 큰 회색 면에 떠 있었다
   */
  return (
    <div className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <h1 id="login-title" className={styles.title}>
          로그인
        </h1>
        <p className={styles.lead}>따로 가입할 필요 없이, 쓰던 계정으로 바로 시작해요.</p>

        {hasLoginFailed && (
          <p className={styles.error} role="alert">
            로그인을 마치지 못했어요. 쓰려던 계정의 단추를 다시 눌러 주세요.
          </p>
        )}

        <ul className={styles.providers}>
          {PROVIDERS.map((provider) => (
            <li key={provider.id}>
              <button type="button" className={provider.className} onClick={() => handleSocialLogin(provider.id)}>
                <img className={styles.icon} src={provider.icon} alt="" width={20} height={20} />
                <span className={styles.label}>{provider.label}</span>
                {/* 앞 공백은 화면에 안 보이고 읽어 주는 이름을 "네이버로 로그인 최근 사용"으로 띄운다 */}
                {lastProvider === provider.type && <span className={styles.lastUsed}> 최근 사용</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.notes}>
          {returnPath !== null && returnPath !== '/' && <p>로그인하면 보던 화면으로 돌아가요.</p>}
          <p>처음 가입한 곳과 다른 계정으로 로그인하면 JUBY 계정이 새로 만들어져요.</p>
        </div>
      </section>

      <section className={styles.next} aria-labelledby="login-next-title">
        <h2 id="login-next-title" className={styles.nextTitle}>
          로그인하면 이렇게 시작해요
        </h2>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.stepText}>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
