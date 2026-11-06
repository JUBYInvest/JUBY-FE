import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { findInvestType, periodLabel } from '../../utils/backtest'
import { faqAnswer, resultSteps, splitBold, strategyExcerpt } from '../../utils/guideExcerpt'
import styles from '../../pages/BacktestPage.module.css'

/** 지금 하는 단계(입력칸에 포커스가 들어오면 바뀐다). 도움말이 그 단계 글을 보인다 */
export type BacktestStep = 'stock' | 'strategy' | 'period' | 'result'

interface HelpProps {
  step: BacktestStep
  investType: number | null
}

/** "**굵게**"가 섞인 사용설명서 글 조각 */
function BoldText({ line }: { line: string }) {
  return splitBold(line).map((part, index) => (part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))
}

/** 사용설명서 한 줄(문단) */
function GuideLine({ line }: { line: string }) {
  return (
    <p className={styles.guideBody}>
      <BoldText line={line} />
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
 * 오른쪽 날개 도움말. 지금 하는 단계(종목 → 전략 → 기간 → 결과)에 맞는 글만 보인다 — 한꺼번에 쌓으면 길어서 아무도 끝까지 안 읽는다.
 * 전략·기간·결과 글은 사용설명서 3장에서 그대로 떼어 오고(utils/guideExcerpt), 끝에 그 꼭지로 가는 링크를 둔다
 */
export default function BacktestHelp({ step, investType }: HelpProps) {
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

        {step === 'strategy' &&
          (chosen !== null ? (
            <StrategyHelp name={chosen.strategyName} />
          ) : (
            // 아직 안 골랐다(비로그인으로 상세에서 왔거나 로그아웃으로 추천을 거뒀다) — 칸이 제목만 남아 비어 보이지 않게
            <section className={styles.guideSection}>
              <h3 className={styles.guideHeading}>전략 고르기</h3>
              <p className={styles.guideBody}>전략 카드를 고르면 그 전략의 아이디어와 특징이 여기에 나와요.</p>
            </section>
          ))}

        {step === 'period' && <PeriodHelp strategyName={chosen?.strategyName ?? null} minPeriod={chosen?.minPeriod ?? null} />}

        {step === 'result' && <ResultHelp />}
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
                <BoldText line={item} />
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
