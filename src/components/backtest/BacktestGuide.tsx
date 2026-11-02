import { useId } from 'react'
import { INVEST_TYPES, periodLabel } from '../../utils/backtest'
import styles from '../../pages/BacktestPage.module.css'

/*
 * 오른쪽 가이드(2026-10-31 pages/BacktestPage.tsx에서 나눔) — 읽는 글이 아니라 고르는 도구다. 스타일은 화면의 모듈을 그대로 쓴다.
 */


interface GuideProps {
  investType: number | null
  savedPersonality: string | null
  onSelect: (investType: number) => void
}

/**
 * 전략 설명을 왼쪽 선택칸과 따로 두면 아무도 안 읽는다. 목록을 그대로 **버튼**으로 만들어,
 * 설명을 읽다가 마음에 들면 그 자리에서 고르게 한다.
 *
 * 다섯 개를 모두 펼치면 글이 너무 길어 훑기 어렵다. 고른 것만 펼쳐서 매수·매도 조건까지
 * 보이고 나머지는 한 줄 요약으로 접어 둔다.
 */
export default function BacktestGuide({ investType, savedPersonality, onSelect }: GuideProps) {
  const idBase = useId()
  return (
    <aside className={styles.guide}>
      <h2 className={styles.guideTitle}>JUBY의 백테스트 가이드</h2>

      <div className={styles.guideCard}>
        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>백테스트가 뭔가요?</h3>
          <p className={styles.guideBody}>
            투자 전략을 과거 주가에 그대로 적용해 <b>가상으로</b> 사고팔아 보는
            거예요. 실제 돈 없이 수익률과 최대 손실을 미리 확인할 수 있어요.
          </p>
        </section>

        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>
            전략 고르기
            <span className={styles.guideTip}>눌러서 선택</span>
          </h3>

          <ul className={styles.strategyList}>
            {INVEST_TYPES.map((item) => {
              const isActive = item.investType === investType
              const isRecommended =
                savedPersonality !== null &&
                item.personality === savedPersonality
              /*
               * 이름은 전략 이름 하나다. 단추 안 글 전체가 이름이 되면 "위험도 1단계 (5단계 중) RSI 역추세 전략 너무 많이 팔려…"처럼
               * 길어 무엇을 고르는지 늦게 들렸다. 위험도·맞음 표시·요약은 설명으로 읽힌다
               */
              const id = (part: string) => `${idBase}-${part}-${item.investType}`

              return (
                <li key={item.investType}>
                  <button
                    type="button"
                    className={
                      isActive ? styles.strategyOn : styles.strategyOff
                    }
                    aria-pressed={isActive}
                    aria-labelledby={id('name')}
                    aria-describedby={[id('risk'), isRecommended ? id('fit') : '', id('desc')].filter(Boolean).join(' ')}
                    onClick={() => onSelect(item.investType)}
                  >
                    <span className={styles.strategyTop}>
                      <RiskDots level={item.investType} id={id('risk')} />
                      {isRecommended && (
                        <span id={id('fit')} className={styles.badge}>
                          나에게 맞음
                        </span>
                      )}
                    </span>

                    <span id={id('name')} className={styles.strategyName}>
                      {item.strategyName}
                    </span>
                    <span id={id('desc')} className={styles.strategyDesc}>
                      {item.strategySummary}
                    </span>

                    {/* 고른 전략만 자세히 편다 */}
                    {isActive && (
                      <span className={styles.detail}>
                        <span className={styles.detailRow}>
                          <b className={styles.buy}>매수</b>
                          {item.entryRule}
                        </span>
                        <span className={styles.detailRow}>
                          <b className={styles.sell}>매도</b>
                          {item.exitRule}
                        </span>
                        <span className={styles.detailRow}>
                          <b className={styles.term}>기간</b>
                          {periodLabel(item.minPeriod)} 이상
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>점수는 어떻게 나오나요?</h3>
          <p className={styles.guideBody}>
            네 가지를 각각 100점으로 매긴 뒤, 전략마다 다른 비중으로 합쳐
            <b> 적합도</b>를 냅니다.
          </p>
          <dl className={styles.axisGuide}>
            <dt>안정성</dt>
            <dd>얼마나 안 깨졌나 (최대낙폭·변동성)</dd>
            <dt>수익성</dt>
            <dd>얼마나 벌었나 (누적·연평균 수익률)</dd>
            <dt>효율성</dt>
            <dd>위험 대비 얼마나 벌었나 (샤프비율)</dd>
            <dt>성장성</dt>
            <dd>지금 뜨고 있나 (모멘텀·거래량)</dd>
          </dl>
        </section>
      </div>
    </aside>
  )
}

/** 위험도를 점 다섯 개로. 전략 번호가 곧 위험도 순서다(1 안정 → 5 공격) */
function RiskDots({ level, id }: { level: number; id: string }) {
  return (
    <span id={id} className={styles.dots} role="img" aria-label={`위험도 ${level}단계 (5단계 중)`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <i
          key={step}
          className={step <= level ? styles.dotOn : styles.dotOff}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}
