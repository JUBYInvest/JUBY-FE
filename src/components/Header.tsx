import { Link, NavLink, useLocation } from 'react-router-dom'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { loginPathFrom } from '../utils/navigation'
import styles from './Header.module.css'

/**
 * 모든 화면이 같이 쓰는 머리글. 로고는 왼쪽, 메뉴는 오른쪽에 한 줄로 놓는다.
 *
 * 로그인 여부는 구독해서 본다. 로그인·로그아웃·탈퇴 직후에도 여기가 알아서 바뀌므로
 * 부르는 쪽이 페이지를 통째로 새로 받을 필요가 없다.
 *
 * 메뉴를 서비스와 계정 두 벌로 나눈 건 좁은 화면 때문이다. 다섯 개가 한 줄에 안 들어가
 * 계정(마이페이지·로그인)은 로고 옆으로 올리고 나머지를 아랫줄에 둔다. 두 벌에 이름을 달아
 * 보조기기가 "탐색"을 두 번 읽지 않게 하고, 메뉴 링크는 NavLink라 지금 화면에
 * aria-current="page"가 붙는다. 그 메뉴만 굵은 검정, 나머지는 회색으로 그린다.
 */
export default function Header() {
  const loggedIn = useIsLoggedIn()
  // 로그인하면 지금 보던 화면으로 돌아오게 자리를 달아 간다
  const { pathname, search } = useLocation()

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo}>
        JUBY
      </Link>

      <nav className={`${styles.menu} ${styles.service}`} aria-label="서비스">
        <MenuLink to="/" label="홈" className={styles.home} />
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
    </header>
  )
}

/**
 * 지금 화면이면 글자가 굵어져 폭이 늘어난다. 그대로 두면 화면을 옮길 때마다 옆 메뉴가 1~2px씩 밀리므로
 * 굵은 글자 폭을 미리 잡아 둔다 — `data-label`을 CSS(`.menu a::after`)가 안 보이게 한 번 더 쓴다.
 * 홈은 다른 화면(`/backtest` 등)에서 켜지지 않게 `end`를 준다.
 */
function MenuLink({ to, label, className }: { to: string; label: string; className?: string }) {
  return (
    <NavLink to={to} end={to === '/'} className={className} data-label={label}>
      {label}
    </NavLink>
  )
}
