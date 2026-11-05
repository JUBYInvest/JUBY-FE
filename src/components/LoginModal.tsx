import { Link, useLocation } from 'react-router-dom'
import Modal from './Modal'
import { loginPathFrom } from '../utils/navigation'
import styles from './LoginModal.module.css'

/** 로그인해야 하는 동작(하트)을 비로그인이 눌렀을 때. 로그인하면 지금 화면으로 돌아온다 — 홈 시세표와 종목 상세가 같이 쓴다 */
export default function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { pathname, search } = useLocation()
  return (
    <Modal isOpen={isOpen} onClose={onClose} label="로그인 안내">
      <p className={styles.message}>로그인하면 쓸 수 있는 기능이에요</p>
      <div className={styles.buttons}>
        <Link to={loginPathFrom(pathname + search)} className={styles.primary}>
          로그인
        </Link>
        <button type="button" className={styles.secondary} onClick={onClose}>
          닫기
        </button>
      </div>
    </Modal>
  )
}
