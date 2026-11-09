import { useState, type FormEvent } from 'react'
import Modal from './Modal'
import { ApiError } from '../api/client'
import { isNicknameAvailable, NICKNAME_PATTERN, saveNickname } from '../api/member'
import styles from './NicknameModal.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** 저장했다. 부른 쪽이 하던 일(글쓰기·댓글)을 이어 간다 */
  onSaved: (nickname: string) => void
}

/**
 * 커뮤니티 닉네임 정하기 — 글·댓글을 쓰기 전에 닉네임이 없으면 뜬다.
 * 규칙(한글·영문·숫자 2~10자)은 여기서 먼저 보고, 중복 확인(`/nickname/check`) 뒤 저장한다. 그 사이 남이 가져가면 저장이 409다
 */
export default function NicknameModal({ isOpen, onClose, onSaved }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const nickname = value.trim()
    if (!NICKNAME_PATTERN.test(nickname)) {
      setError('한글·영문·숫자로 2~10자를 적어 주세요. 띄어쓰기와 특수문자는 쓸 수 없어요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (!(await isNicknameAvailable(nickname))) {
        setError('이미 사용 중인 닉네임이에요')
        return
      }
      await saveNickname(nickname)
      onSaved(nickname)
    } catch (caught: unknown) {
      console.warn('닉네임 저장 실패', caught)
      setError(caught instanceof ApiError && caught.code === 'MEMBER409_2' ? '이미 사용 중인 닉네임이에요' : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} label="닉네임 정하기">
      <form onSubmit={(event) => void submit(event)}>
        <p className={styles.title}>커뮤니티 닉네임을 정해 주세요</p>
        <p className={styles.text}>글과 댓글에 이 이름이 보여요. 한글·영문·숫자 2~10자예요.</p>
        <label className={styles.srOnly} htmlFor="nickname-input">
          닉네임
        </label>
        <input
          id="nickname-input"
          className={styles.input}
          type="text"
          maxLength={10}
          autoComplete="off"
          value={value}
          placeholder="예: 용감한개미"
          aria-invalid={error !== ''}
          aria-describedby={error !== '' ? 'nickname-error' : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {error !== '' && (
          <p id="nickname-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.buttons}>
          <button type="submit" className={styles.primary} disabled={saving || value.trim() === ''}>
            {saving ? '저장하는 중…' : '저장하고 계속하기'}
          </button>
          <button type="button" className={styles.secondary} onClick={onClose}>
            닫기
          </button>
        </div>
      </form>
    </Modal>
  )
}
