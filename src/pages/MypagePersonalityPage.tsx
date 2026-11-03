import { useState } from 'react'
import { Link } from 'react-router-dom'
import PersonalityScale from '../components/PersonalityScale'
import { getMyPersonality } from '../api/member'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLoad } from '../hooks/useLoad'
import { toBacktestHandoff } from '../hooks/useStockHandoff'
import { AXES, AXIS_LABEL, findByPersonality, periodLabel } from '../utils/backtest'
import { PERSONALITY_INFO, describePersonality, isPersonalityType } from '../utils/personality'
import type { PersonalityInfo } from '../types/member'
import type { PersonalityType } from '../types/personality'
import styles from './MypagePersonalityPage.module.css'

/** 검사를 마치면 PersonalityResultPage의 doneRoute가 from=mypage를 보고 여기로 돌려보낸다 */
const TEST_URL = '/personality-test?from=mypage'

/**
 * 투자유형(2026-10-30 보강). 위는 내 성향, 아래는 다섯 성향 둘러보기 — 눈금에서 성향을 고르면 그 성향의 전략·사고파는 때·
 * 고를 수 있는 기간·점수 비중을 보여 주고 "이 전략으로 백테스트"로 보낸다. 값은 백테스트 화면이 쓰는 표(utils/backtest.ts) 그대로다.
 *
 * **성향을 검사 없이 바꾸는 단추는 없다.** 서버에 `PATCH /api/members/me/personality`가 있지만 성향 이름이 아니라 DB 행 번호를 받고,
 * 그 번호는 코드가 아닌 DB에 직접 넣은 자동 번호라 화면이 알 수 없다(CLAUDE.md "아직 mock인 곳", docs/남은-일.md 백엔드 8).
 * 추측해 보내면 다른 성향이 조용히 저장될 수 있다. 서버가 이름이나 1~5 번호로 받으면 둘러보기 칸에 저장 단추를 붙인다.
 */
export default function MypagePersonalityPage() {
  useDocumentTitle('투자유형 보기')
  // 아직 검사하지 않은 회원은 value가 null이다(api/member.ts getMyPersonality — 404 MEMBER404_2는 실패가 아니다)
  const [state, load] = useLoad(getMyPersonality, '투자성향')

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

  if (state.value === null) {
    return (
      <>
        <div className={styles.message}>
          <p className={styles.messageText}>아직 투자성향 검사를 하지 않았습니다</p>
          <p className={styles.hint}>
            10문항이면 끝나요. 검사하면 여기에 결과가 남고, 백테스트가 나에게 맞는 전략을 골라 둬요.
          </p>
          {/*
            앱 안에서 옮긴다. <a href>는 앱을 통째로 다시 받아, 사이트 데이터를 막은 브라우저에서는 메모리에만 있던
            토큰이 사라져 로그인이 풀린 채 검사하게 됐다(결과가 저장되지 않는다)
          */}
          <Link className={styles.primary} to={TEST_URL}>
            검사하러 가기
          </Link>
        </div>
        <Browse mine={null} />
      </>
    )
  }

  const info: PersonalityInfo = state.value
  /*
   * 서버 값이 먼저다. personality 테이블이 비어 있으면 빈 문자열이 오므로 로컬 문구로 받친다.
   * 모르는 성향 이름이어도 저장된 성향이므로 "아직 검사 안 함"으로 바꾸지 않고 이름 그대로 보인다
   */
  const { description, imageUrl } = describePersonality(
    info.investPersonality,
    info.description,
    info.personalityImg,
  )
  const mine = isPersonalityType(info.investPersonality) ? info.investPersonality : null
  const strategy = mine === null ? null : findByPersonality(mine)

  return (
    <>
      <section className={styles.mine} aria-labelledby="mine-title">
        {/* 성향 이름이 바로 옆 글자로 나오므로 이미지에는 설명을 붙이지 않는다 */}
        {imageUrl !== '' && <img className={styles.image} src={imageUrl} alt="" />}
        <div className={styles.mineText}>
          <p className={styles.eyebrow}>내 투자성향</p>
          <h2 id="mine-title" className={styles.type}>
            {info.investPersonality}
          </h2>
          <p className={styles.description}>{description}</p>
          <div className={styles.actions}>
            {strategy !== null && (
              <Link
                to="/backtest"
                state={toBacktestHandoff(null, { investType: strategy.investType, period: null })}
                className={styles.primary}
              >
                내 전략으로 백테스트
              </Link>
            )}
            <Link to={TEST_URL} className={styles.secondary}>
              검사 다시하기
            </Link>
          </div>
        </div>
      </section>

      <Browse mine={mine} />
    </>
  )
}

/** 다섯 성향 둘러보기. 처음엔 내 성향(없으면 안정형)을 펼친다 */
function Browse({ mine }: { mine: PersonalityType | null }) {
  const [selected, setSelected] = useState<PersonalityType>(mine ?? '안정형')
  const strategy = findByPersonality(selected)
  if (strategy === null) return null
  const isMine = selected === mine

  return (
    <section className={styles.browse} aria-labelledby="browse-title">
      <div className={styles.sectionHead}>
        <h2 id="browse-title" className={styles.sectionTitle}>
          다섯 성향 둘러보기
        </h2>
        <span className={styles.sectionNote}>성향마다 백테스트가 쓰는 전략이 달라요</span>
      </div>

      <PersonalityScale mine={mine} selected={selected} onSelect={setSelected} />

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>
          {selected}
          {isMine && <span className={styles.mineTag}>내 성향</span>}
        </h3>
        <p className={styles.panelDescription}>{PERSONALITY_INFO[selected].description}</p>

        <div className={styles.panelBody}>
          <dl className={styles.facts}>
            <div>
              <dt>맞는 전략</dt>
              <dd>
                <b>{strategy.strategyName}</b>
                <span className={styles.factSub}>{strategy.strategySummary}</span>
              </dd>
            </div>
            <div>
              <dt>사는 때</dt>
              <dd>{strategy.entryRule}</dd>
            </div>
            <div>
              <dt>파는 때</dt>
              <dd>{strategy.exitRule}</dd>
            </div>
            <div>
              <dt>고를 수 있는 기간</dt>
              <dd>{periodLabel(strategy.minPeriod)} 이상</dd>
            </div>
            <div>
              <dt>눈여겨보는 지표</dt>
              <dd>{strategy.focusMetrics}</dd>
            </div>
          </dl>

          {/*
            비중은 넷을 더해 100%다(백엔드 ScoreCalculator.calculateTotalScore의 성향별 가중치와 같은 표 — utils/backtest INVEST_TYPES).
            그래서 막대 넷을 따로 두지 않고 100% 막대 하나를 넷으로 나눈다(2026-11-03 사용자 "그래프가 25%가 아닌 거처럼 나오는데" —
            따로 둔 막대는 25%가 칸의 4분의 1이라도 무엇의 25%인지 안 읽혔다). 위험중립형은 네 칸이 같고, 안정형은 안정성 칸이 가장 넓다
          */}
          <div>
            <p className={styles.weightsTitle}>점수를 매길 때 보는 비중</p>
            <div className={styles.weightBar} aria-hidden="true">
              {AXES.map((axis) => (
                <span
                  key={axis}
                  className={styles.weightPart}
                  data-axis={axis}
                  style={{ flexGrow: strategy.weights[axis] }}
                />
              ))}
            </div>
            <ul className={styles.weightList}>
              {AXES.map((axis) => (
                <li key={axis} className={styles.weight}>
                  <span className={styles.weightKey} data-axis={axis} aria-hidden="true" />
                  <span className={styles.weightName}>{AXIS_LABEL[axis]}</span>
                  <span className={styles.weightValue}>{Math.round(strategy.weights[axis] * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 내 성향이면 위 칸에 같은 단추('내 전략으로 백테스트')가 이미 있다 */}
        {!isMine && (
          <div className={styles.actions}>
            <Link
              to="/backtest"
              state={toBacktestHandoff(null, { investType: strategy.investType, period: null })}
              className={styles.secondary}
            >
              이 전략으로 백테스트
            </Link>
            {/* 검사 전이면 위 안내가 이미 검사를 권한다 */}
            {mine !== null && (
              <p className={styles.changeNote}>
                내 성향을 {selected}으로 바꾸려면 검사를 다시 해 주세요.{' '}
                <Link to={TEST_URL} className={styles.inlineLink}>
                  검사 다시하기
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
