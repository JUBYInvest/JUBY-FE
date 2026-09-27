import { useCallback, useEffect, useState } from 'react'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../components/Modal'
import { ApiError } from '../api/client'
import { deleteMember, getMemberInfo, updateMemberInfo } from '../api/member'
import { clearTokens } from '../utils/auth'
import { toDashedYmd, toYmd } from '../utils/date'
import { formatBirth } from '../utils/format'
import type { MemberInfo, ProfileImageUrl } from '../types/member'
import styles from './MypageProfilePage.module.css'

/**
 * 프로필 사진 주소. 지금은 언제나 null이라 기본 아이콘이 나간다.
 *
 * 백엔드 Member 엔티티에 이미지 필드가 없어서 저장된 값 자체가 없다.
 * 필드가 생기면 이 상수를 memberInfo의 값으로 바꾸기만 하면 아래 화면은 그대로 붙는다.
 */
const PROFILE_IMAGE_URL: ProfileImageUrl = null

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; member: MemberInfo }
  | { kind: 'error' }

/** 저장된 사진이 없을 때 쓰는 기본 아이콘 */
function DefaultAvatar() {
  return (
    <svg className={styles.avatar} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id="mypageAvatarClip">
          <circle cx="60" cy="60" r="58" />
        </clipPath>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="58"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* 머리와 어깨가 원 밖으로 나가지 않도록 원 모양으로 잘라낸다 */}
      <g clipPath="url(#mypageAvatarClip)" fill="currentColor">
        <circle cx="60" cy="48" r="20" />
        <ellipse cx="60" cy="112" rx="34" ry="30" />
      </g>
    </svg>
  )
}

export default function MypageProfilePage() {
  useDocumentTitle('내 정보')
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  /** "YYYY-MM-DD" 또는 빈 문자열(없음). date input이 이 형식을 그대로 쓴다 */
  const [editBirth, setEditBirth] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(() => {
    setState({ kind: 'loading' })

    getMemberInfo()
      .then((member) => setState({ kind: 'ready', member }))
      .catch((error: unknown) => {
        console.warn('회원 정보 조회 실패', error)
        setState({ kind: 'error' })
      })
  }, [])

  useEffect(load, [load])

  async function handleDelete() {
    setIsDeleting(true)
    setDeleteError('')

    try {
      await deleteMember()
      /*
       * 탈퇴했으니 로그인 화면이 아니라 홈으로 보낸다. replace를 주면 뒤로 가기로
       * 없어진 계정의 마이페이지에 되돌아가지 않는다.
       * 헤더가 '로그인'으로 돌아가는 건 clearTokens가 알아서 알린다.
       */
      clearTokens()
      navigate('/', { replace: true })
    } catch (error: unknown) {
      console.warn('회원 탈퇴 실패', error)
      // 실패했으면 토큰은 그대로 둔다. 지웠는데 계정이 남으면 로그인만 풀린 꼴이 된다
      setDeleteError('탈퇴하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setIsDeleting(false)
    }
  }

  function closeDelete() {
    if (isDeleting) return
    setIsDeleteOpen(false)
    setDeleteError('')
  }

  function openEdit(member: MemberInfo) {
    setEditName(member.name)
    setEditBirth(member.birth ?? '')
    setSaveError('')
    setIsEditOpen(true)
  }

  function closeEdit() {
    if (isSaving) return
    setIsEditOpen(false)
  }

  /**
   * 이름 2~4자, 생일은 오늘 이전 — 서버가 검사하고 어긋나면 400을 준다.
   * 이름은 화면에서 먼저 거르고(생일은 입력칸의 min·max가 막는다), 400이 오면 서버 message 대신
   * 두 규칙을 적은 고정 문구를 보여준다(아래 catch).
   */
  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return

    const name = editName.trim()
    if (name.length < 2 || name.length > 4) {
      setSaveError('이름은 2~4자여야 합니다.')
      return
    }

    setIsSaving(true)
    setSaveError('')

    try {
      await updateMemberInfo({ name, birth: editBirth === '' ? null : editBirth })
      setIsEditOpen(false)
      load()
    } catch (error: unknown) {
      console.warn('회원 정보 수정 실패', error)
      /*
       * 400은 서버 검사에 걸린 것이다. 서버가 준 message는 쓰지 않는다 — 검사 문구가 아닌
       * 개발자용 문구가 섞여 올 수 있다. 서버가 거는 규칙은 둘뿐이라 그걸 적는다.
       */
      setSaveError(
        error instanceof ApiError && error.status === 400
          ? '저장할 수 없는 값이에요. 이름은 2~4자, 생년월일은 오늘 이전이어야 해요.'
          : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (state.kind === 'loading') {
    return <div className={styles.skeleton} aria-label="불러오는 중" />
  }

  if (state.kind === 'error') {
    return (
      <div className={styles.message}>
        <p className={styles.messageText}>회원 정보를 불러오지 못했습니다.</p>
        {/*
          토큰이 만료됐으면 서버가 401을 주고 client.ts가 로그인 화면으로 보낸다.
          여기까지 왔다면 401이 아닌 다른 실패(서버 오류, 네트워크)다.
        */}
        <p className={styles.hint}>
          잠시 후 다시 시도해 주세요. 문제가 계속되면 다시 로그인해 보세요.
        </p>
        <button type="button" className={styles.primary} onClick={load}>
          다시 시도
        </button>
      </div>
    )
  }

  const { member } = state
  const birth = formatBirth(member.birth)

  return (
    <>
      <div className={styles.profile}>
        {PROFILE_IMAGE_URL === null ? (
          <DefaultAvatar />
        ) : (
          <img className={styles.avatar} src={PROFILE_IMAGE_URL} alt="" />
        )}

        <p className={styles.name}>{member.name}</p>
        {/* 소셜에서 생년월일을 못 받은 계정이 있다. 그때는 줄을 지우지 않고 없다고 적는다 */}
        <p className={styles.field}>{birth ?? '생년월일 정보 없음'}</p>
        <p className={styles.field}>{member.email}</p>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.muted}
            onClick={() => openEdit(member)}
          >
            정보 수정하기
          </button>
          <button
            type="button"
            className={styles.outline}
            onClick={() => setIsDeleteOpen(true)}
          >
            회원 탈퇴하기
          </button>
        </div>
      </div>

      {/* 이름·생일만 고칠 수 있다. 이메일과 가입 경로는 소셜 계정에 딸린 값이라 서버가 안 받는다 */}
      <Modal isOpen={isEditOpen} onClose={closeEdit} label="내 정보 수정">
        <form className={styles.form} onSubmit={(event) => void handleSave(event)}>
          <p className={styles.modalTitle}>내 정보 수정</p>

          <label className={styles.formLabel} htmlFor="edit-name">
            이름
          </label>
          <input
            id="edit-name"
            className={styles.formInput}
            type="text"
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            minLength={2}
            maxLength={4}
            required
            disabled={isSaving}
          />
          <p className={styles.formHelp}>2~4자</p>

          <label className={styles.formLabel} htmlFor="edit-birth">
            생년월일
          </label>
          <input
            id="edit-birth"
            className={styles.formInput}
            type="date"
            value={editBirth}
            onChange={(event) => setEditBirth(event.target.value)}
            // 오늘 이후는 서버가 거절한다. 달력에서 애초에 못 고르게 한다.
            // 하한이 없으면 0203년·1800년 같은 값도 그대로 저장됐다
            // 오늘은 이 기기의 날짜다. toISOString()은 UTC라 한국 새벽 0~9시엔 어제가 상한이 됐다
            min="1900-01-01"
            max={toDashedYmd(toYmd(new Date()))}
            disabled={isSaving}
          />
          <p className={styles.formHelp}>비워 두면 정보 없음으로 저장돼요</p>

          {saveError !== '' && (
            <p className={styles.modalError} role="alert">
              {saveError}
            </p>
          )}

          <div className={styles.modalButtons}>
            <button type="submit" className={styles.primary} disabled={isSaving}>
              {isSaving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              className={styles.cancel}
              onClick={closeEdit}
              disabled={isSaving}
            >
              취소
            </button>
          </div>
        </form>
      </Modal>

      {/* 탈퇴는 되돌릴 수 없다. 버튼 하나로 바로 지우지 않는다 */}
      <Modal isOpen={isDeleteOpen} onClose={closeDelete} label="회원 탈퇴 확인">
        <p className={styles.modalTitle}>정말 탈퇴하시겠습니까?</p>
        <p className={styles.modalText}>
          계정과 투자성향 정보가 모두 삭제되며 복구할 수 없습니다.
        </p>

        {deleteError !== '' && (
          <p className={styles.modalError} role="alert">
            {deleteError}
          </p>
        )}

        <div className={styles.modalButtons}>
          <button
            type="button"
            className={styles.danger}
            onClick={() => void handleDelete()}
            disabled={isDeleting}
          >
            {isDeleting ? '처리 중…' : '탈퇴하기'}
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={closeDelete}
            disabled={isDeleting}
          >
            취소
          </button>
        </div>
      </Modal>
    </>
  )
}
