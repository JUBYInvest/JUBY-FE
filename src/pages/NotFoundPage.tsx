import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import styles from './NotFoundPage.module.css'

/**
 * App.tsx의 path="*". 어느 라우트에도 걸리지 않은 주소가 전부 여기로 온다.
 *
 * 예전에는 '기능 준비중입니다'라고 답했다. 머리글 메뉴가 모두 실제 화면으로
 * 이어지는 지금 여기 닿는 주소는 오타이거나 옛 주소라서, 곧 생길 것처럼 말하면
 * 없는 문을 계속 두드리게 만든다. 만들다 만 화면이 다시 생기면 그때 그 경로에만
 * 안내를 붙인다 — 남는 주소 전부에 붙일 말이 아니다.
 *
 * 주소창에 보이는 건 여전히 200이다. 정적 호스팅이 상태코드를 줄 수 없어서인데,
 * 사람에게는 이 화면이, 크롤러에게는 200이 간다.
 */
export default function NotFoundPage() {
  useDocumentTitle('페이지를 찾을 수 없음')

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>없는 주소예요</h1>
      <p className={styles.description}>
        주소를 잘못 입력했거나 지금은 사라진 페이지예요. 홈에서 다시 찾아보세요.
      </p>

      <Link to="/" className={styles.home}>
        홈으로 돌아가기
      </Link>
    </div>
  )
}
