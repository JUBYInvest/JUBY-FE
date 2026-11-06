import { Link } from 'react-router-dom'
import LikeAddButton from '../LikeAddButton'
import { toStockHandoff } from '../../hooks/useStockHandoff'
import type { CompareMiss, Ranked } from '../../hooks/useBacktestRun'
import type { BacktestPreset } from '../../types/backtest'
import type { StockInfo } from '../../types/stock'
import {
  AXES,
  AXIS_LABEL,
  calculateAxisScores,
  findInvestType,
  isHeldToEnd,
  periodLabel,
  scoreVerdict,
  toPercent,
} from '../../utils/backtest'
import { toKoreanDate } from '../../utils/date'
import { isFiniteNumber, rateTone } from '../../utils/format'
import { PERSONALITY_INFO } from '../../utils/personality'
import { toPreviewState } from '../../utils/stockPreview'
import styles from '../../pages/BacktestPage.module.css'

/*
 * 백테스트 결과 — 결론(내 성향 ↔ 종목 성향) · 고른 전략의 성적 · 왜 그 성향인가 · 이어서 할 일.
 * 값은 hooks/useBacktestRun이 받고 여기는 그리기만 한다. 스타일은 화면의 모듈(BacktestPage.module.css)을 그대로 쓴다.
 */

/** 끝까지 들고 있던 매수가 빠진 지표(수익률·거래횟수)의 설명. 임시 — isHeldToEnd 참고 */
const HELD_DESC = '끝까지 팔지 않은 매수는 빠진 값이에요'
interface ResultProps {
  preset: BacktestPreset
  stock: StockInfo
  /** 다섯 전략의 적합도를 높은 순으로. 첫 번째가 이 종목의 성향이다. 비어 있을 수 있다 */
  ranking: Ranked[]
  /** 다섯 중 못 받은 것 */
  missed: CompareMiss
  savedPersonality: string | null
  onRetry: () => void
}

export default function BacktestResult({
  preset,
  stock,
  ranking,
  missed,
  savedPersonality,
  onRetry,
}: ResultProps) {
  const info = findInvestType(preset.investType)
  if (info === null) return null
  const { stockName } = stock

  /*
   * 1등. 화면에 적는 점수(소수 첫째 자리)가 같으면 공동 1위다.
   * 순서는 정렬 그대로(점수, 같으면 성향 번호)
   */
  const topScore = ranking[0]?.score.toFixed(1) ?? null
  const isTop = (item: Ranked) => item.score.toFixed(1) === topScore
  const best = ranking[0] ?? null
  const topInfos = ranking
    .filter(isTop)
    .flatMap((item) => findInvestType(item.investType) ?? [])
  const isJoint = topInfos.length > 1
  const topNames = topInfos.map((item) => item.personality).join('·')
  /*
   * 다섯 중 일부를 못 받았으면 1등은 "받은 것 중" 1등일 뿐이다. 결론을 그 범위로 한정한다
   */
  const comparedPart = missed.count > 0 ? ranking.length : null

  const { result } = preset
  const axisScores = calculateAxisScores(result)
  const verdict = scoreVerdict(result.finalScore)
  /** 종목이 나와 같은 성향으로 판정됐는가(공동 1위 중 하나여도 같다) */
  const isSame =
    savedPersonality !== null &&
    topInfos.some((item) => item.personality === savedPersonality)
  /** 내 성향에 딸린 전략을 그대로 돌렸는가 (다른 전략으로 바꿔 볼 수 있다) */
  const usedOwnStrategy = savedPersonality === info.personality

  /*
   * 지표를 표로 늘어놓으면 숫자는 보이는데 뜻이 안 보인다. JUBY는 초보자용이라
   * 용어 자체가 벽이다("샤프비율 1.69"를 읽고 좋은지 나쁜지 알 수 있는 사람은 적다).
   * 그래서 값마다 한 줄 해설을 붙이고, 어려운 말은 쉬운 이름을 앞세우고 원래 용어를 괄호에 둔다.
   */
  /*
   * 낱개 지표는 비어 올 수 있다(api/backtest.ts toScoring이 null로 넘긴다). 값이 있을 때만 숫자·색을 쓰고 아니면 "-"다.
   * null >= 0은 참이라 그대로 두면 "-"가 빨간색으로 칠해지고, null.toFixed에서 결과 구역이 멈춘다.
   * 화면에 "0.00%"로 보이는 값은 보합이라 색을 주지 않는다(다른 화면의 등락과 같은 규칙, utils/format isFlatRate) —
   * 안 그러면 끝까지 들고 있던 결과(수익률 0)가 오름 빨강으로 칠해진다. 비율은 소수라 백분율로 바꿔 본다
   */
  const toneOf = (value: number | null): 'up' | 'down' | undefined => {
    const tone = rateTone(isFiniteNumber(value) ? value * 100 : null)
    return tone === 'flat' ? undefined : tone
  }
  const positionCount = result.growth.positionCount
  const hasPositionCount = Number.isInteger(positionCount)
  /*
   * 임시(백엔드가 끝에 청산하면 지운다): 사서 끝까지 들고 있으면 서버가 그 매수를 수익률·거래횟수에서 빼
   * "거래 0회·수익률 0%"로 준다. 그 세 값에 빠진 게 있다고 적고, 거래 0회 경고 대신 따로 알린다
   */
  const heldToEnd = isHeldToEnd(result)

  const metrics: {
    label: string
    value: string
    tone?: 'up' | 'down'
    desc: string
  }[] = [
    {
      label: '누적수익률',
      value: toPercent(result.profit.totalReturn),
      tone: toneOf(result.profit.totalReturn),
      desc: heldToEnd ? HELD_DESC : '이 기간에 전략을 그대로 따랐다면 이만큼 벌었어요',
    },
    {
      label: '연평균수익률',
      value: toPercent(result.profit.annualReturn),
      tone: toneOf(result.profit.annualReturn),
      desc: heldToEnd ? HELD_DESC : '1년치로 환산하면 이 정도 속도예요',
    },
    {
      label: '최대낙폭 (MDD)',
      value: toPercent(result.stable.mdd),
      desc: '가장 많이 물렸을 때 고점에서 이만큼 떨어졌어요',
    },
    {
      label: '위험 대비 수익 (샤프비율)',
      value: isFiniteNumber(result.effect.sharpeRatio)
        ? result.effect.sharpeRatio.toFixed(2)
        : '-',
      desc: '1을 넘으면 감수한 위험에 비해 잘 번 편이에요',
    },
    {
      label: '오르내림 (변동성)',
      value: toPercent(result.stable.volatility),
      desc: '클수록 가격이 심하게 출렁였어요',
    },
    {
      label: '거래횟수',
      value: hasPositionCount ? `${positionCount}회` : '-',
      desc: heldToEnd ? HELD_DESC : '이 기간에 전략이 사고판 횟수예요',
    },
  ]

  return (
    <section className={styles.result}>
      <div className={styles.resultHead}>
        <h2 className={styles.resultTitle}>백테스트 결과</h2>

        <button type="button" className={styles.retry} onClick={onRetry}>
          백테스트 다시하기
        </button>
      </div>

      {/*
        읽는 사람이 가장 먼저 알아야 할 한 줄.
        "나는 이런 사람 → 이 전략으로 봤더니 → 이 종목은 이런 사람에게 맞더라"
        세 마디를 순서대로 잇는다. 다섯 성향 비교가 없으면 앞 두 마디만 한다.
      */}
      <div className={styles.compare}>
        <p className={styles.story}>
          {savedPersonality === null ? (
            <>
              <b>{info.strategyName}</b>으로 분석했어요.
            </>
          ) : (
            <>
              나는 <b>{savedPersonality}</b>,{' '}
              {usedOwnStrategy ? (
                <>
                  여기에 맞는 <b>{info.strategyName}</b>으로 분석했어요.
                </>
              ) : (
                <>
                  하지만 <b>{info.personality}</b>용인{' '}
                  <b>{info.strategyName}</b>으로 분석했어요.
                </>
              )}
            </>
          )}
          {topInfos.length > 0 && (
            <>
              {/*
                종목명 바로 뒤에 은·는처럼 받침 따라 바뀌는 조사를 두지 않는다. 글자로는 못 가린다 —
                NAVER는 "는", LS ELECTRIC·KODEX 200은 "은"처럼 읽는 소리로 갈린다. 성향 이름은 모두 '형'으로 끝나 "이에요"가 맞다
              */}
              <br />그 결과{' '}
              {comparedPart !== null && `불러온 ${comparedPart}개 성향 중에서 `}
              {stockName}에 {isJoint ? '똑같이 ' : ''}가장 잘 맞는 성향은{' '}
              <b className={isSame ? styles.good : styles.bad}>{topNames}</b>
              {isJoint ? '이에요(공동 1위).' : '이에요.'}
            </>
          )}
        </p>

        {topInfos.length > 0 && best !== null && (
          <div className={styles.matchRow}>
            <div className={styles.matchSide}>
              <span className={styles.matchLabel}>내 투자성향</span>
              <strong className={styles.matchValue}>
                {savedPersonality ?? '아직 없어요'}
              </strong>
              <span className={styles.matchFrom}>투자성향테스트 결과</span>
            </div>

            <span className={styles.matchSign} aria-hidden="true">
              {isSame ? '=' : '↔'}
            </span>

            <div className={styles.matchSide}>
              <span className={styles.matchLabel}>{stockName}의 투자성향</span>
              <strong className={styles.matchValue}>{topNames}</strong>
              <span className={styles.matchFrom}>
                적합도 {best.score.toFixed(1)}점으로 {isJoint ? '공동 1위' : '가장 높음'}
                {comparedPart !== null && ` (불러온 ${comparedPart}개 중)`}
              </span>
            </div>
          </div>
        )}

        {savedPersonality !== null && topInfos.length > 0 && !isSame && (
          <p className={styles.matchText}>
            성향이 서로 달라요. 내 성향대로 간다면 {stockName}보다 더 맞는
            종목이 있을 수 있어요.
          </p>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          {info.strategyName}으로 본 {stockName}
          <span className={styles.cardNote}>{periodLabel(preset.period)}</span>
        </h3>

        <div className={styles.scoreRow}>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>적합도</span>
            <span className={styles.score}>
              {result.finalScore.toFixed(1)}
              <span className={styles.scoreMax}>/ 100</span>
            </span>
            <span
              className={`${styles.scoreVerdict} ${styles[verdict.tone]}`}
            >
              {verdict.short}
            </span>
          </div>

          {/*
            축 점수는 서버가 주지 않아 원시 지표로 되계산한 값이다.
            가중치를 함께 적어 두면 "왜 이 총점인지"가 표만 보고도 읽힌다.
          */}
          <ul className={styles.axes}>
            {AXES.map((axis) => (
              <li key={axis}>
                <div className={styles.axisHead}>
                  <span className={styles.axisName}>{AXIS_LABEL[axis]}</span>
                  <span className={styles.axisWeight}>
                    비중 {Math.round(info.weights[axis] * 100)}%
                  </span>
                  {/* 지표가 빠진 축은 점수를 모른다. 0이 아니라 "-"로 적고 막대는 비운다 */}
                  <span className={styles.axisScore}>
                    {axisScores[axis]?.toFixed(0) ?? '-'}
                  </span>
                </div>
                <div className={styles.bar} aria-hidden="true">
                  <div
                    className={styles.barFill}
                    style={{ width: `${axisScores[axis] ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 위 4축에 붙은 '비중 %'가 왜 그 값인지를 바로 아래에서 설명한다 */}
        <ul className={styles.notes}>
          <li>
            <b>{info.personality}</b>은 이런 스타일이에요.
            <span className={styles.noteBody}>
              {PERSONALITY_INFO[info.personality].description}
            </span>
          </li>
          <li>
            그래서 <b>{info.focusMetrics}</b>에 특히 주목해요.
            <span className={styles.noteBody}>
              적합도를 매길 때 {AXIS_LABEL.stable}에{' '}
              {Math.round(info.weights.stable * 100)}%, {AXIS_LABEL.profit}에{' '}
              {Math.round(info.weights.profit * 100)}% 비중을 둡니다.
            </span>
          </li>
        </ul>

        {/*
          표 대신 낱장 카드로 편다. 표는 가로로 길어 좁은 화면에서 밀어 봐야 하고,
          칸이 좁아 해설을 넣을 자리가 없다. 카드는 화면 폭에 따라 3·2·1열로 접힌다.
        */}
        <ul className={styles.metrics}>
          {metrics.map((metric) => (
            <li key={metric.label} className={styles.metric}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <strong
                className={
                  metric.tone === undefined
                    ? styles.metricValue
                    : `${styles.metricValue} ${styles[metric.tone]}`
                }
              >
                {metric.value}
              </strong>
              <span className={styles.metricDesc}>{metric.desc}</span>
            </li>
          ))}
        </ul>

        {/*
          거래가 한 번도 안 걸리면 손익이 0이라 낙폭도 변동성도 0이 되고,
          안정성 점수만 100점으로 치솟는다. 점수만 보면 '아주 안정적인 종목'처럼 읽히지만
          실제로는 이 전략이 이 종목에서 신호를 한 번도 못 잡은 것이다. 먼저 알린다.
        */}
        {hasPositionCount && positionCount === 0 && !heldToEnd && (
          <p className={styles.warn}>
            이 기간에는 매매 신호가 한 번도 나오지 않았어요. 손익이 없어 안정성
            점수가 높게 잡히니, 적합도보다 <b>거래횟수 0회</b>를 먼저 봐주세요.
          </p>
        )}
        {/*
          임시 안내. 산 뒤 기간이 끝날 때까지 파는 신호가 없으면 서버가 그 매수를 셈에서 빼
          "매매 신호가 없었다"와 같은 숫자를 준다. 그 경고를 띄우면 틀린 말이라 이 안내로 바꾼다
        */}
        {heldToEnd && (
          <p className={styles.warn}>
            이 기간에 산 주식을 끝까지 팔지 않고 들고 있었어요. 지금은 팔지 않은 매수가
            수익률·거래횟수에 들어가지 않아 <b>수익률 0%·거래 0회</b>로 보이고, 적합도도 그
            값으로 매겨졌어요. 낙폭·변동성은 들고 있던 동안의 값이에요.
          </p>
        )}
      </div>

      {/*
        카드마다 맡은 말이 하나씩이다.
        ① 결론(내 성향 ↔ 종목 성향) ② 고른 전략의 성적 ③ 왜 그 성향으로 판정됐는가.
        한 카드에 다 넣으면 스크롤만 길고 무엇을 먼저 봐야 할지 알 수 없다.
      */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          {stockName}에 맞는 성향
          <span className={styles.cardNote}>1년 기준으로 다섯 전략을 비교</span>
        </h3>

        {ranking.length === 0 ? (
          <p className={styles.warn}>
            {missed.allDataShort
              ? '1년치 일봉이 모자라 비교할 수 없어요.'
              : '비교 결과를 불러오지 못했어요.'}
          </p>
        ) : (
          <>
            <ul className={isJoint ? `${styles.rankList} ${styles.joint}` : styles.rankList}>
              {ranking.map((item) => {
                const rankInfo = findInvestType(item.investType)
                if (rankInfo === null) return null

                return (
                  <li key={item.investType} className={styles.rank}>
                    <span className={styles.rankName}>
                      {isTop(item) && (
                        <b className={styles.crown}>{isJoint ? '공동 1위' : '최고'}</b>
                      )}
                      {rankInfo.personality}
                    </span>
                    <div className={styles.bar}>
                      <div
                        className={isTop(item) ? styles.barFillTop : styles.barFillRest}
                        style={{ width: `${item.score}%` }}
                      />
                    </div>
                    <span className={styles.rankScore}>{item.score.toFixed(1)}</span>
                  </li>
                )
              })}
            </ul>
            {/* 빠진 전략이 있으면 위 순위의 1등이 진짜 1등이 아닐 수 있다 */}
            {missed.count > 0 && (
              <p className={styles.warn}>{missed.count}개 전략은 불러오지 못했어요.</p>
            )}
          </>
        )}

        <p className={styles.meta}>{describeSource(preset)}</p>
      </div>

      {/* 결과를 본 뒤 그 종목으로 이어 갈 곳. 상세의 바로 가기와 같은 이름을 쓴다 */}
      <div className={styles.next}>
        <h3 className={styles.nextTitle}>이 종목으로 이어서</h3>
        <div className={styles.nextActions}>
          {/* 이름을 실어 상세가 응답 전에 이름 자리를 채운다(CLAUDE.md "종목 상세는 기다림을 줄이고 가린다") */}
          <Link to={`/stocks/${stock.stockCode}`} state={toPreviewState(stock)} className={styles.nextLink}>
            종목 상세 보기
          </Link>
          <Link to="/ai" state={toStockHandoff(stock)} className={styles.nextLink}>
            AI에게 물어보기
          </Link>
          {/* 종목을 바꿔 다시 실행하면 담기 상태를 처음부터 본다 */}
          <LikeAddButton key={stock.stockCode} stock={stock} />
        </div>
      </div>
    </section>
  )
}

/**
 * 결과가 어디서 왔는지 한 줄. 프리셋은 계산에 쓰인 날짜를, 즉석 실행은 날짜를 모르니(응답에 없다) 규칙만 적는다.
 * 즉석 실행도 종료일은 그 종목의 마지막 일봉이라 프리셋과 같은 기준이다.
 */
function describeSource(preset: BacktestPreset): string {
  if (preset.source === 'live') {
    return '미리 계산된 결과가 없어 지금 바로 계산했어요 · 이 종목의 마지막 일봉까지 ' + periodLabel(preset.period)
  }
  // 날짜는 YYYYMMDD로 온다(api/backtest.ts). 다른 화면처럼 "10월 28일"로 적는다
  const [start, end] = [toKoreanDate(preset.startDate), toKoreanDate(preset.endDate)]
  const range = start !== '' && end !== '' ? `${start} ~ ${end} 일봉 기준 · ` : ''
  return `${range}매일 새벽 4시에 다시 계산돼요`
}
