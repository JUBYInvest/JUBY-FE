import { Link, Navigate, useLocation } from 'react-router-dom'
import PersonalityCard from '../components/PersonalityCard'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { toBacktestHandoff } from '../hooks/useStockHandoff'
import { findByPersonality } from '../utils/backtest'
import type { PersonalityResult } from '../types/personality'
import { toReturnPath } from '../utils/navigation'
import { isPersonalityType } from '../utils/personality'
import styles from './PersonalityResultPage.module.css'

/** 검사를 마친 뒤 돌아갈 곳. 들어온 문(?from=)에 따라 달라진다 */
function doneRoute(search: string): string {
  const params = new URLSearchParams(search)
  const from = params.get('from')
  if (from === 'mypage') return '/mypage/personality'
  // AI 주가분석의 '투자성향 변경하기'로 들어온 경우. 하던 자리로 돌려보낸다
  if (from === 'ai') return '/ai'
  // 첫 로그인 뒤 검사로 보내진 경우(OAuthCallbackPage). 가려던 자리로 간다. 이 사이트 안 경로만 받는다(toReturnPath)
  return toReturnPath(params.get('next')) ?? '/'
}

export default function PersonalityResultPage() {
  useDocumentTitle('투자성향 결과')
  const location = useLocation()
  const result = (location.state as { result?: PersonalityResult } | null)?.result

  /*
   * 결과는 문항 화면이 navigate로 들고 온다. 주소창에 직접 쳐서 들어오면 보여줄 게 없다.
   * replace를 쓰는 이유는 뒤로 가기를 눌렀을 때 다시 여기로 튕겨 오지 않게 하기 위해서다.
   */
  if (result === undefined) {
    return (
      <Navigate
        to={{ pathname: '/personality-test', search: location.search }}
        replace
      />
    )
  }

  // 이 성향에 맞는 전략. 모르는 성향 이름이면 단추를 두지 않는다
  const strategy = isPersonalityType(result.type) ? findByPersonality(result.type) : null

  return (
    <div className={styles.page}>
      {/* 다 채운 진행 막대는 두지 않는다 — 제목 먹 선 바로 아래 초록 줄 하나로만 보여 선이 두 겹으로 읽혔다(2026-11-03) */}
      <h1 className={styles.title}>나의 투자성향 테스트</h1>

      <PersonalityCard
        type={result.type}
        description={result.description}
        imageUrl={result.imageUrl}
      >
        <Link to={doneRoute(location.search)} className={styles.done}>
          완료
        </Link>
        {/* 결과를 본 다음 할 일. 마이페이지의 같은 단추와 같은 이름이다 — 그 전략을 골라 둔 채 백테스트로 간다 */}
        {strategy !== null && (
          <Link
            to="/backtest"
            state={toBacktestHandoff(null, { investType: strategy.investType, period: null })}
            className={styles.next}
          >
            내 전략으로 백테스트
          </Link>
        )}
        {/* 다시 풀 때도 들어온 문을 유지해야 끝나고 같은 자리로 돌아간다 */}
        <Link
          to={{ pathname: '/personality-test', search: location.search }}
          className={styles.retry}
        >
          검사 다시하기
        </Link>
      </PersonalityCard>
    </div>
  )
}
