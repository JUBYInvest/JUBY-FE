import { Link, NavLink } from 'react-router-dom'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import styles from './Header.module.css'

/**
 * 모든 화면이 같이 쓰는 머리글.
 *
 * 로그인 여부는 구독해서 본다. 로그인·로그아웃·탈퇴 직후에도 여기가 알아서 바뀌므로
 * 부르는 쪽이 페이지를 통째로 새로 받을 필요가 없다.
 *
 * 메뉴 두 벌은 이름을 달아 보조기기가 "탐색"을 두 번 읽지 않게 하고, 메뉴 링크는 NavLink라
 * 지금 화면에 aria-current="page"가 붙는다(모양은 바꾸지 않았다).
 */
export default function Header() {
  const loggedIn = useIsLoggedIn()

  return (
    <header className={styles.header}>
      <nav className={styles.menu} aria-label="서비스">
        <NavLink to="/backtest">주식 백테스트</NavLink>
        <NavLink to="/ai">AI 주가분석</NavLink>
      </nav>

      <Link to="/" className={styles.logo}>
        JUBY
      </Link>

      <nav className={`${styles.menu} ${styles.right}`} aria-label="계정">
        <NavLink to="/guide">사용설명서</NavLink>
        {loggedIn ? (
          <NavLink to="/mypage">마이페이지</NavLink>
        ) : (
          <NavLink to="/login">로그인</NavLink>
        )}
      </nav>
    </header>
  )
}
