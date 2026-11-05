import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import SectionBoundary from './SectionBoundary'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useLogout } from '../hooks/useLogout'
import { isLoggedIn } from '../utils/auth'
import { loginPathFrom } from '../utils/navigation'
import styles from './MypageLayout.module.css'
import tabs from './tabs.module.css'

/** end: 하위 주소에서는 켜지지 않는다 — '/mypage'는 모든 마이페이지 주소의 앞부분이다 */
/** 메뉴가 밑줄 탭 한 줄로 접히는 폭 */
const NARROW = '(max-width: 900px)'

const MENU = [
  { to: '/mypage', label: '한눈에 보기', end: true },
  { to: '/mypage/personality', label: '투자유형 보기', end: false },
  { to: '/mypage/profile', label: '내 정보 확인', end: false },
]

/**
 * 마이페이지 세 화면이 함께 쓰는 껍데기 — 메뉴 + 오른쪽 내용(Outlet).
 * 넓은 화면의 메뉴는 옆 열 줄이고, 900px 이하에서는 가는 선 위 밑줄 탭 한 줄이다(공용 tabs.module.css를 그대로 쓴다).
 * 로그아웃은 메뉴 끝에 둔다 — 마이페이지 어디서나 닿고, 머리글은 좁은 폭에서 자리가 없다.
 */
export default function MypageLayout() {
  const { pathname } = useLocation()
  const { isLoggingOut, logOut } = useLogout()
  const narrow = useMediaQuery(NARROW)

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

  return (
    <>
      <h1 className={styles.title}>마이페이지</h1>

      <div className={styles.layout}>
        {/* 제목이 바로 위에 있어 메뉴 머리에 '마이페이지'를 또 적지 않는다 */}
        <aside className={styles.sidebar} aria-label="마이페이지 메뉴">
          <ul className={styles.list}>
            {MENU.map((item) => (
              <li key={item.to}>
                {/* NavLink가 현재 경로를 알아서 판단한다 */}
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (narrow ? (isActive ? tabs.tabActive : tabs.tab) : isActive ? styles.itemOn : styles.item)}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* 이동이 아니라 동작이라 목록 <ul> 밖에 둔다. 동작은 hooks/useLogout */}
          <button
            type="button"
            className={styles.logout}
            onClick={logOut}
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
