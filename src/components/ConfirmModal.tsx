import type { ReactNode } from 'react'
import Modal from './Modal'
import styles from './ConfirmModal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 창 이름(읽어 주는 프로그램이 읽는다) */
  label: string
  /** "이 글을 지울까요?"처럼 묻는 말 */
  title: string
  /** 무엇이 사라지는지 한두 줄 */
  children: ReactNode
  /** 확정 단추 글("지우기"·"탈퇴하기") */
  confirmLabel: string
  /** 처리하는 동안 확정 단추 글("지우는 중…") */
  busyLabel: string
  busy: boolean
  onConfirm: () => void
  /** 실패했을 때 상자 안에 적을 말. 없으면 null */
  error?: string | null
}

/**
 * 되돌릴 수 없는 일(AI 대화 지우기·커뮤니티 글 지우기·회원 탈퇴)을 단추 하나로 바로 하지 않고 한 번 묻는 상자.
 * 처리하는 동안은 두 단추를 다 잠근다 — 연타하면 요청이 두 번 나가고(둘째가 404로 "못 지웠어요"), 취소를 눌러 닫아도 요청은 끝까지 간다
 */
export default function ConfirmModal({ isOpen, onClose, label, title, children, confirmLabel, busyLabel, busy, onConfirm, error = null }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} label={label}>
      <p className={styles.title}>{title}</p>
      <p className={styles.text}>{children}</p>
      {error !== null && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.buttons}>
        <button type="button" className={styles.confirm} onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
          취소
        </button>
      </div>
    </Modal>
  )
}
