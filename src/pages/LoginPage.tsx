import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { API_ORIGIN } from '../api/client'
import { LOGIN_STEPS } from '../content/loginSteps'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { SocialType } from '../types/member'
import { rememberReturnPath } from '../utils/auth'
import { readLastLoginProvider } from '../utils/lastLogin'
import { toReturnPath } from '../utils/navigation'
import { SOCIAL_PROVIDERS } from '../utils/social'
import styles from './LoginPage.module.css'

/** 소셜 단추의 모양. 단추 순서·글자·아이콘·주소는 utils/social 한 표를 따른다(카카오 → 네이버 → Google) */
const PROVIDER_CLASS: Record<SocialType, string> = { KAKAO: styles.kakao, NAVER: styles.naver, GOOGLE: styles.google }

/** "최근 사용" 표시. 단추 이름이 아니라 설명으로 읽힌다(aria-describedby) — 이름은 누르면 일어나는 일 그대로 둔다 */
const LAST_USED_ID = 'login-last-used'

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
  function handleSocialLogin(path: string) {
    // 바깥 화면을 거쳐 페이지가 새로 뜨므로 돌아갈 자리를 적어 두고 떠난다. 콜백이 꺼내 쓴다
    rememberReturnPath(returnPath)
    // 주소창 이동이라 프록시를 탈 수 없다. 백엔드 주소로 곧장 간다(client.ts의 API_ORIGIN)
    window.location.href = `${API_ORIGIN}/oauth2/authorization/${path}`
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
          {SOCIAL_PROVIDERS.map((provider) => {
            const isLast = lastProvider === provider.type
            return (
              <li key={provider.type}>
                <button
                  type="button"
                  className={PROVIDER_CLASS[provider.type]}
                  aria-describedby={isLast ? LAST_USED_ID : undefined}
                  onClick={() => handleSocialLogin(provider.path)}
                >
                  {/* 배치는 안쪽 줄이 맡는다(LoginPage.module.css .inner) — 단추 자체에는 공통 단추 모양만 */}
                  <span className={styles.inner}>
                    <img className={styles.icon} src={provider.icon} alt="" width={20} height={20} />
                    <span className={styles.label}>{provider.name}로 로그인</span>
                  </span>
                  {isLast && (
                    <span id={LAST_USED_ID} className={styles.lastUsed} aria-hidden="true">
                      최근 사용
                    </span>
                  )}
                </button>
              </li>
            )
          })}
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
          {LOGIN_STEPS.map((step, index) => (
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
