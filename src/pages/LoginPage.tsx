import { useLocation } from 'react-router-dom'
import { API_ORIGIN } from '../api/client'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { rememberReturnPath } from '../utils/auth'
import { toReturnPath } from '../utils/navigation'
import styles from './LoginPage.module.css'


const PROVIDERS = [
  {
    id: 'naver',
    name: '네이버',
    icon: '/social/naver.svg',
    className: `${styles.social} ${styles.naver}`,
  },
  {
    id: 'kakao',
    name: '카카오',
    icon: '/social/kakao.svg',
    className: `${styles.social} ${styles.kakao}`,
  },
  {
    id: 'google',
    name: '구글',
    icon: '/social/google.svg',
    className: `${styles.social} ${styles.google}`,
  },
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

  return (
    <>
      <div className={styles.titleBar}>
        <h1 className={styles.title}>로그인</h1>
      </div>

      <div className={styles.body}>
        <div className={styles.band}>
          <h2 className={styles.headline}>
            초보자를 위한 주식 비서,
            <br />
            JUBY의 세계로!
          </h2>

          <p className={styles.caption}>Create Your Own JUBY!</p>

          {hasLoginFailed && (
            <p className={styles.error} role="alert">
              로그인에 실패했습니다. 다시 시도해주세요.
            </p>
          )}

          <div className={styles.buttons}>
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={provider.className}
                onClick={() => handleSocialLogin(provider.id)}
                aria-label={`${provider.name} 계정으로 로그인`}
              >
                <img
                  className={styles.icon}
                  src={provider.icon}
                  alt=""
                  width={22}
                  height={22}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
