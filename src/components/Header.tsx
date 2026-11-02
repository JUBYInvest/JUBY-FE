import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Link, NavLink, useLocation, useNavigationType } from 'react-router-dom'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { PAGE_MOTION, prefersReducedMotion } from '../utils/motion'
import { loginPathFrom } from '../utils/navigation'
import { isRouteChunkLoading, subscribeRouteChunk } from '../utils/routeLoading'
import styles from './Header.module.css'

/**
 * 모든 화면이 같이 쓰는 머리글. 로고 바로 옆에 서비스 메뉴, 오른쪽 끝에 계정 메뉴를 한 줄로 놓는다.
 *
 * 로그인 여부는 구독해서 본다. 로그인·로그아웃·탈퇴 직후에도 여기가 알아서 바뀌므로
 * 부르는 쪽이 페이지를 통째로 새로 받을 필요가 없다.
 *
 * 메뉴를 서비스와 계정 두 벌로 나눈 건 좁은 화면 때문이다. 다 한 줄에 안 들어가
 * 계정(마이페이지·로그인)은 로고 옆으로 올리고 나머지를 아랫줄에 둔다(아랫줄은 옆으로 민다). 두 벌에 이름을 달아
 * 보조기기가 "탐색"을 두 번 읽지 않게 하고, 메뉴 링크는 NavLink라 지금 화면에
 * aria-current="page"가 붙는다. 그 메뉴만 굵은 흰 글자에 아래 연초록 막대다.
 *
 * 메뉴를 옮기면 막대가 앞 메뉴에서 누른 메뉴로 미끄러져 간다(2026-11-03, 본문이 떠오르는 것과 같은 때·같은 곡선 — utils/motion.ts).
 * 막대는 링크마다 그리는 `::before`라, 새 메뉴의 막대를 앞 메뉴 자리·폭에서 출발시켜 제자리로 옮긴다(Web Animations의 pseudoElement).
 * 같은 줄(서비스 메뉴끼리) 안에서만 옮긴다 — 좁은 화면은 계정 메뉴가 윗줄이라 줄을 건너 옆으로만 움직이면 엉뚱하다.
 * 뒤로·앞으로 가기, 움직임을 줄인 설정, pseudoElement를 모르는 브라우저에서는 막대가 그 자리에 바로 선다.
 *
 * 다음 화면의 묶음을 받는 동안에는 띠 아래 끝에 연초록 줄이 흐른다(150ms가 지나야 보인다 — 받아 둔 묶음은 그 전에 온다).
 * 화면 이동은 묶음이 올 때까지 앞 화면을 그대로 두므로, 눌렀는데 아무 일도 없는 것처럼 보이던 사이를 이 줄이 메운다(utils/routeLoading.ts).
 */
export default function Header() {
  const loggedIn = useIsLoggedIn()
  // 로그인하면 지금 보던 화면으로 돌아오게 자리를 달아 간다
  const { pathname, search } = useLocation()
  const navigationType = useNavigationType()
  const headerRef = useRef<HTMLElement>(null)
  const activeRef = useRef<HTMLAnchorElement | null>(null)
  const chunkLoading = useSyncExternalStore(subscribeRouteChunk, isRouteChunkLoading)

  // 그리기 전에 건다 — 새 자리의 막대가 한 번 보였다가 뒤로 튀지 않게
  useLayoutEffect(() => {
    const current = headerRef.current?.querySelector<HTMLAnchorElement>('nav a[aria-current="page"]') ?? null
    const previous = activeRef.current
    activeRef.current = current
    if (current === null || previous === null || previous === current || !previous.isConnected) return
    if (previous.closest('nav') !== current.closest('nav')) return
    if (navigationType === 'POP' || prefersReducedMotion() || typeof current.animate !== 'function') return
    const from = previous.getBoundingClientRect()
    const to = current.getBoundingClientRect()
    // 막대는 링크 좌우 안쪽 여백만큼 들어가 있다(Header.module.css). 두 링크의 여백이 같아 폭 차이가 곧 막대 폭 차이다
    const inset = Number.parseFloat(getComputedStyle(current, '::before').left) || 0
    const toWidth = to.width - inset * 2
    if (toWidth <= 0) return
    const scale = (from.width - inset * 2) / toWidth
    try {
      current.animate(
        [{ transform: `translateX(${from.left - to.left}px) scaleX(${scale})` }, { transform: 'none' }],
        { duration: PAGE_MOTION.duration, easing: PAGE_MOTION.easing, pseudoElement: '::before' },
      )
    } catch {
      // pseudoElement를 모르는 브라우저 — 막대가 새 자리에 바로 선다
    }
    // 주소가 바뀔 때만 건다. navigationType은 그때의 값을 읽기만 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <header ref={headerRef} className={styles.header}>
      <Link to="/" className={styles.logo}>
        JUBY
      </Link>

      <nav className={`${styles.menu} ${styles.service}`} aria-label="서비스">
        <MenuLink to="/" label="홈" />
        <MenuLink to="/likes" label="주식 모아보기" />
        <MenuLink to="/backtest" label="주식 백테스트" />
        <MenuLink to="/ai" label="AI 주가분석" />
        <MenuLink to="/guide" label="사용설명서" />
      </nav>

      <nav className={`${styles.menu} ${styles.account}`} aria-label="계정">
        {loggedIn ? (
          <MenuLink to="/mypage" label="마이페이지" />
        ) : (
          <MenuLink to={loginPathFrom(pathname + search)} label="로그인" />
        )}
      </nav>

      {chunkLoading && <span className={styles.progress} role="status" aria-label="화면을 불러오는 중" />}
    </header>
  )
}

/**
 * 지금 화면이면 글자가 굵어져 폭이 늘어난다. 그대로 두면 화면을 옮길 때마다 옆 메뉴가 1~2px씩 밀리므로
 * 굵은 글자 폭을 미리 잡아 둔다 — `data-label`을 CSS(`.menu a::after`)가 안 보이게 한 번 더 쓴다.
 * 홈은 다른 화면(`/backtest` 등)에서 켜지지 않게 `end`를 준다.
 */
function MenuLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} end={to === '/'} data-label={label}>
      {label}
    </NavLink>
  )
}
