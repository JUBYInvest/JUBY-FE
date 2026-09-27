import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PersonalityCard from '../components/PersonalityCard'
import { getMyPersonality } from '../api/member'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { describePersonality } from '../utils/personality'
import type { PersonalityInfo } from '../types/member'
import styles from './MypagePersonalityPage.module.css'

/** 검사를 마치면 PersonalityResultPage의 doneRoute가 from=mypage를 보고 여기로 돌려보낸다 */
const TEST_URL = '/personality-test?from=mypage'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; info: PersonalityInfo }
  /** 아직 검사하지 않은 회원 */
  | { kind: 'none' }
  | { kind: 'error' }

export default function MypagePersonalityPage() {
  useDocumentTitle('투자유형 보기')
  const [state, setState] = useState<State>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })

    getMyPersonality()
      .then((info) =>
        setState(info === null ? { kind: 'none' } : { kind: 'ready', info }),
      )
      .catch((error: unknown) => {
        console.warn('투자성향 조회 실패', error)
        setState({ kind: 'error' })
      })
  }, [])

  useEffect(load, [load])

  if (state.kind === 'loading') {
    return <div className={styles.skeleton} aria-label="불러오는 중" />
  }

  if (state.kind === 'error') {
    return (
      <div className={styles.message}>
        <p className={styles.messageText}>투자성향을 불러오지 못했습니다.</p>
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

  if (state.kind === 'none') {
    return (
      <div className={styles.message}>
        <p className={styles.messageText}>아직 투자성향 검사를 하지 않았습니다</p>
        <p className={styles.hint}>
          몇 분이면 끝나요. 검사하고 나면 여기에 결과가 남습니다.
        </p>
        <a className={styles.primary} href={TEST_URL}>
          검사하러 가기
        </a>
      </div>
    )
  }

  const { info } = state
  /*
   * 서버 값이 먼저다. personality 테이블이 비어 있으면 빈 문자열이 오므로 로컬 문구로 받친다.
   * 모르는 성향 이름이어도 저장된 성향이므로 "아직 검사 안 함"으로 바꾸지 않고 이름 그대로 보인다
   */
  const { description, imageUrl } = describePersonality(
    info.investPersonality,
    info.description,
    info.personalityImg,
  )

  return (
    <PersonalityCard
      type={info.investPersonality}
      description={description}
      imageUrl={imageUrl}
    >
      <Link to={TEST_URL} className={styles.retest}>
        검사 다시하기
      </Link>
    </PersonalityCard>
  )
}
