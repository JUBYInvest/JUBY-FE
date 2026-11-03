import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { INVEST_TYPES, findInvestType, periodLabel } from '../../utils/backtest'
import { faqAnswer, resultSteps, splitBold, strategyExcerpt } from '../../utils/guideExcerpt'
import styles from '../../pages/BacktestPage.module.css'

/** 지금 하는 단계. 왼쪽 단계 줄(BacktestSteps)과 오른쪽 도움말이 같이 따른다 */
export type BacktestStep = 'stock' | 'strategy' | 'period' | 'result'

interface HelpProps {
  step: BacktestStep
  investType: number | null
  savedPersonality: string | null
  onSelect: (investType: number) => void
}

/** "**굵게**"가 섞인 사용설명서 한 줄 */
function GuideLine({ line }: { line: string }) {
  return (
    <p className={styles.guideBody}>
      {splitBold(line).map((part, index) => (part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))}
    </p>
  )
}

function MoreLink({ anchor, children }: { anchor: string | null; children: ReactNode }) {
  return (
    <Link to={anchor === null ? '/guide/backtest' : `/guide/backtest#${anchor}`} className={styles.helpLink}>
      {children}
    </Link>
  )
}

/**
 * 오른쪽 날개 도움말(2026-11-03 사용자 "메인 화면이 가로로 너무 길어 보여서, 사용설명서의 백테스트 부분을 일부 차용하여 날개 형식으로").
 * 지금 하는 단계(종목 → 전략 → 기간 → 결과)에 맞는 글만 보인다 — 다섯 묶음을 한꺼번에 쌓던 "JUBY의 백테스트 가이드"는 길어서 아무도 끝까지 안 읽었다.
 * 전략·기간·결과 글은 사용설명서 3장에서 그대로 떼어 오고(utils/guideExcerpt), 끝에 그 꼭지로 가는 링크를 둔다.
 * 전략 단계에서는 목록을 그대로 단추로 둬 읽다가 그 자리에서 고른다(예전 가이드와 같다)
 */
export default function BacktestHelp({ step, investType, savedPersonality, onSelect }: HelpProps) {
  const chosen = investType === null ? null : findInvestType(investType)
  return (
    <aside className={styles.help} aria-labelledby="backtest-help-title">
      <div className={styles.helpHead}>
        <h2 id="backtest-help-title" className={styles.helpTitle}>
          도움말
        </h2>
        <Link to="/guide/backtest" className={styles.helpMore}>
          사용설명서
        </Link>
      </div>

      <div className={styles.helpBody}>
        {step === 'stock' && (
          <section className={styles.guideSection}>
            <h3 className={styles.guideHeading}>백테스트가 뭔가요?</h3>
            <p className={styles.guideBody}>
              투자 전략을 과거 주가에 그대로 적용해 <b>가상으로</b> 사고팔아 보는
              거예요. 실제 돈 없이 수익률과 최대 손실을 미리 확인할 수 있어요.
            </p>
            <MoreLink anchor={null}>사용설명서 3장 처음부터 보기</MoreLink>
          </section>
        )}

        {step === 'strategy' && chosen !== null && <StrategyHelp name={chosen.strategyName} />}

        {step === 'period' && <PeriodHelp strategyName={chosen?.strategyName ?? null} minPeriod={chosen?.minPeriod ?? null} />}

        {step === 'result' && <ResultHelp />}

        {(step === 'strategy' || step === 'stock') && (
          <StrategyPicker investType={investType} savedPersonality={savedPersonality} onSelect={onSelect} />
        )}
      </div>
    </aside>
  )
}

/** 고른 전략의 아이디어·특징(사용설명서 3장 1절) */
function StrategyHelp({ name }: { name: string }) {
  const excerpt = strategyExcerpt(name)
  if (excerpt.idea === null && excerpt.trait === null) return null
  return (
    <section className={styles.guideSection}>
      <h3 className={styles.guideHeading}>{name}</h3>
      {excerpt.idea !== null && <GuideLine line={excerpt.idea} />}
      {excerpt.trait !== null && <GuideLine line={excerpt.trait} />}
      <MoreLink anchor={excerpt.anchor}>전략별 매매 규칙 자세히 보기</MoreLink>
    </section>
  )
}

/** 기간 — 고른 전략이 쓰는 봉 수와 자주 묻는 질문 "데이터가 부족합니다" */
function PeriodHelp({ strategyName, minPeriod }: { strategyName: string | null; minPeriod: Parameters<typeof periodLabel>[0] | null }) {
  const faq = faqAnswer('데이터가 부족')
  return (
    <section className={styles.guideSection}>
      <h3 className={styles.guideHeading}>기간 고르기</h3>
      {strategyName !== null && minPeriod !== null && (
        <p className={styles.guideBody}>
          {strategyName}은 지표를 계산하는 데 봉이 필요해서 <b>{periodLabel(minPeriod)}</b> 이상만 고를 수 있어요.
        </p>
      )}
      {faq !== null && (
        <>
          <p className={styles.helpQuestion}>{faq.question}</p>
          <GuideLine line={faq.answer} />
          <MoreLink anchor={faq.anchor}>자주 묻는 질문 더 보기</MoreLink>
        </>
      )}
    </section>
  )
}

/** 결과 — 사용설명서 3장 "결과는 이 순서로 확인하세요" + 점수 매기는 법 */
function ResultHelp() {
  const order = resultSteps()
  return (
    <>
      {order.items.length > 0 && (
        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>결과는 이 순서로 확인하세요</h3>
          <ol className={styles.helpSteps}>
            {order.items.map((item) => (
              <li key={item}>
                {splitBold(item).map((part, index) => (part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))}
              </li>
            ))}
          </ol>
          <MoreLink anchor={order.anchor}>결과 지표 읽는 법 자세히 보기</MoreLink>
        </section>
      )}
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
    </>
  )
}

interface PickerProps {
  investType: number | null
  savedPersonality: string | null
  onSelect: (investType: number) => void
}

/**
 * 전략 설명을 왼쪽 선택칸과 따로 두면 아무도 안 읽는다. 목록을 그대로 **버튼**으로 만들어,
 * 설명을 읽다가 마음에 들면 그 자리에서 고르게 한다.
 * 다섯 개를 모두 펼치면 글이 너무 길어 훑기 어렵다. 고른 것만 펼쳐서 매수·매도 조건까지 보이고 나머지는 한 줄 요약으로 접어 둔다.
 */
function StrategyPicker({ investType, savedPersonality, onSelect }: PickerProps) {
  const idBase = useId()
  return (
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
