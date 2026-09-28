import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import SectionBoundary from './SectionBoundary'
import { isLoggedIn } from '../utils/auth'
import { loginPathFrom } from '../utils/navigation'
import styles from './MypageLayout.module.css'

const MENU = [
  { to: '/mypage/personality', label: '투자유형 보기' },
  { to: '/mypage/likes', label: '관심종목' },
  { to: '/mypage/profile', label: '내 정보 확인' },
]

/**
 * 마이페이지 세 화면이 함께 쓰는 껍데기. 사이드바 + 오른쪽 내용(Outlet).
 *
 * 사이드바 생김새는 AI 주가분석 화면과 거의 같지만 컴포넌트를 공용화하지 않았다.
 * 그쪽 목록은 서버에서 오는 대화 세션이라 개수가 계속 변하고, 이쪽은 고정 셋에
 * 현재 경로로 선택을 판단한다. 억지로 합치면 양쪽 조건이 한 파일에 뒤엉킨다.
 *
 * 로그아웃 버튼이 여기 있는 이유: 마이페이지 세 화면 어디서나 닿고, 머리글은
 * 좁은 폭에서 이미 꽉 차 있어 항목을 더 넣을 자리가 없다.
 */
export default function MypageLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  /*
   * 세 경로 모두 로그인이 필요하다. 렌더 전에 막아야 아래 화면들이
   * 토큰 없이 API를 부르고 실패 화면을 잠깐 보여주는 일이 없다.
   *
   * 여기는 일부러 구독하지 않는다(useIsLoggedIn 아님). 구독하면 토큰이 사라지는 순간
   * 로그인 화면으로 밀어내는데, 탈퇴와 로그아웃은 홈으로 가야 하므로 서로 싸운다.
   * 도중에 토큰이 만료되는 경우는 어차피 다음 요청의 401을 client.ts가 받아 처리한다.
   */
  if (!isLoggedIn()) {
    // 로그인하면 이 마이페이지 자리로 돌아온다
    return <Navigate to={loginPathFrom(pathname)} replace />
  }

  /**
   * logout()은 던지지 않는다 — 서버 호출이 실패해도 finally에서 토큰을 지운다.
   * 그래서 실패 안내가 없다. 나가겠다고 누른 사람을 로그인 상태로 두는 편이 더 위험하다.
   *
   * 탈퇴와 같이 홈으로 보낸다. replace는 방금까지 있던 마이페이지를 기록에 남기지 않는다
   * (더 뒤의 마이페이지 기록으로 돌아가더라도 위의 로그인 검사가 /login으로 보낸다).
   * 머리글이 '로그인'으로 돌아가는 건 clearTokens가 알아서 알린다.
   */
  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)

    await logout()
    navigate('/', { replace: true })
  }

  return (
    <>
      <h1 className={styles.title}>마이페이지</h1>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.head}>
            <h2 className={styles.headTitle}>마이페이지</h2>
          </div>

          <ul className={styles.list}>
            {MENU.map((item) => (
              <li key={item.to}>
                {/* NavLink가 현재 경로를 알아서 판단한다 */}
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? `${styles.item} ${styles.itemOn}` : styles.item
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* 이동이 아니라 동작이라 목록 <ul> 밖에 둔다 */}
          <button
            type="button"
            className={styles.logout}
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </aside>

        <section className={styles.content}>
          {/*
            안쪽 화면이 그리다 멈춰도 사이드바·로그아웃은 남는다. 탭을 옮기면 오류 상태가 풀리고,
            다시 시도하면 안쪽 화면이 새로 마운트되며 스스로 다시 불러온다.
          */}
          <SectionBoundary resetKey={pathname}>
            <Outlet />
          </SectionBoundary>
        </section>
      </div>
    </>
  )
}
