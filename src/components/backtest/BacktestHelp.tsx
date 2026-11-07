import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { resultSteps, splitBold } from '../../utils/guideExcerpt'
import styles from '../../pages/BacktestPage.module.css'

interface HelpProps {
  /** 결과가 나왔는가. 나오기 전엔 백테스트가 무엇인지, 나온 뒤엔 결과 읽는 순서와 점수 매기는 법 */
  showResult: boolean
}

/** "**굵게**"가 섞인 사용설명서 글 조각 */
function BoldText({ line }: { line: string }) {
  return splitBold(line).map((part, index) => (part.bold ? <b key={index}>{part.text}</b> : <span key={index}>{part.text}</span>))
}

function MoreLink({ anchor, children }: { anchor: string | null; children: ReactNode }) {
  return (
    <Link to={anchor === null ? '/guide/backtest' : `/guide/backtest#${anchor}`} className={styles.helpLink}>
      {children}
    </Link>
  )
}

/**
 * '돌릴 조합' 아래 도움말. 고르는 동안은 백테스트가 무엇인지 한 묶음, 결과가 나오면 결과 읽는 법 두 묶음(사용설명서 3장에서 떼어 온다 — utils/guideExcerpt).
 * 전략·기간 설명은 '조건 고르기'에 한 번만 적고 여기서 되풀이하지 않는다
 */
export default function BacktestHelp({ showResult }: HelpProps) {
  return (
    <div className={styles.guide}>
      {showResult ? (
        <ResultHelp />
      ) : (
        <section className={styles.guideSection}>
          <h3 className={styles.guideHeading}>백테스트가 뭔가요?</h3>
          <p className={styles.guideBody}>
            투자 전략을 과거 주가에 그대로 적용해 <b>가상으로</b> 사고팔아 보는 거예요. 실제 돈 없이 수익률과 최대 손실을 미리 확인할 수 있어요.
          </p>
          <MoreLink anchor={null}>사용설명서 3장 처음부터 보기</MoreLink>
        </section>
      )}
    </div>
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
