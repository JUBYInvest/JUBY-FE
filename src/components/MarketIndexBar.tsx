import { useEffect, useState } from 'react'
import { INDEX_REFRESH_MS, isMarketHours, loadMarketIndices, readCachedIndices } from '../api/market'
import { loadMarketCalendar, marketStatus } from '../api/marketCalendar'
import { toKoreanDateTime, toKoreanDateWithDay } from '../utils/date'
import { formatChangeRate, formatPoint, formatPointChange, rateTone } from '../utils/format'
import type { MarketIndex, MarketIndices, MarketStatus } from '../types/market'
import styles from './MarketIndexBar.module.css'

/**
 * 화면 아래에 붙는 국내 지수 띠(코스피·코스닥). 토스증권 아래 띠를 본떴다(2026-10-29 사용자 요청).
 *
 * App의 Layout에 한 번 놓여 화면을 옮겨도 다시 그려지지 않는다 — 옮길 때마다 서버에 묻지 않는다.
 * 처음 한 번 묻고, 장중(평일 9:00~15:35)이면서 탭이 보일 때만 1분마다 다시 묻는다. 무엇을 언제 묻는지는 api/market.ts가 정한다.
 * 보여줄 값이 없으면(못 받았고 지난 값도 없음) 띠를 그리지 않는다.
 *
 * 맨 앞에 장 상태(장 시작 전·장 중·장 마감·오늘 휴장)와 다음 개장일을 적는다(2026-10-31). 초보자는 지금 가격이 움직이는 때인지,
 * 오늘 본 값이 언제 바뀌는지를 모른다. 휴장일은 로그인했을 때 증권사 휴장일 조회로 받아 둔다(api/marketCalendar.ts).
 * 모르면(비로그인 평일) 장 상태를 적지 않는다. 600px 이하는 자리가 없어 적지 않는다(지수가 먼저다).
 */
export default function MarketIndexBar() {
  const [data, setData] = useState<MarketIndices | null>(readCachedIndices)
  const [settled, setSettled] = useState(false)
  /** 장 상태를 다시 읽는 때. 1분마다, 그리고 휴장일을 받은 뒤 바꾼다 */
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let isStale = false
    const refresh = () => {
      void loadMarketIndices().then((next) => {
        if (isStale) return
        setSettled(true)
        // 못 받았으면 지난 값이 온다. 그것도 없으면 지금 보이는 값을 지우지 않는다
        if (next !== null) setData(next)
      })
    }

    refresh()
    void loadMarketCalendar().then(() => {
      if (!isStale) setNow(Date.now())
    })
    const timer = setInterval(() => {
      setNow(Date.now())
      if (document.visibilityState === 'visible' && isMarketHours()) refresh()
    }, INDEX_REFRESH_MS)
    return () => {
      isStale = true
      clearInterval(timer)
    }
  }, [])

  if (data === null) {
    // 처음 받는 동안은 띠 자리만 잡아 둔다. 못 받았으면 띠째 뺀다
    return settled ? null : (
      <div className={styles.bar} aria-hidden="true">
        <div className={styles.inner} />
      </div>
    )
  }

  const asOf = toKoreanDateTime(data.receivedAt)
  const status = marketStatus(now)
  return (
    <aside className={styles.bar} aria-label="국내 지수">
      <div className={styles.inner}>
        {status !== null && <StatusText status={status} />}
        <p className={styles.label}>국내 지수</p>
        <ul className={styles.list}>
          {data.indices.map((index) => (
            <IndexItem key={index.code} index={index} />
          ))}
        </ul>
        {data.isSample ? (
          // 백엔드 지수 API가 나오기 전의 예시 값이라는 표시(2026-11-03 사용자 — "예시 값 · 실제 지수 아님"에서 바꿨다)
          <p className={styles.sample}>(목업본)</p>
        ) : (
          asOf !== '' && <p className={styles.asOf}>{asOf} 기준</p>
        )}
      </div>
    </aside>
  )
}

const PHASE_LABEL: Record<MarketStatus['phase'], string> = {
  beforeOpen: '장 시작 전',
  open: '장 중',
  closed: '장 마감',
  dayOff: '오늘 휴장',
}

/** "장 중 15:30 마감", "장 마감 다음 개장 11월 3일(월)". 다음 개장일을 모르면 상태만 적는다 */
function StatusText({ status }: { status: MarketStatus }) {
  const next =
    status.phase === 'open'
      ? '15:30 마감'
      : status.phase === 'beforeOpen'
        ? '9:00 개장'
        : status.nextOpen !== null && toKoreanDateWithDay(status.nextOpen) !== ''
          ? `다음 개장 ${toKoreanDateWithDay(status.nextOpen)}`
          : ''
  return (
    <p className={styles.status}>
      <strong className={styles.phase}>{PHASE_LABEL[status.phase]}</strong>
      {next !== '' && <span className={styles.next}>{next}</span>}
    </p>
  )
}

function IndexItem({ index }: { index: MarketIndex }) {
  return (
    <li className={styles.item}>
      <span className={styles.name}>{index.name}</span>
      <span className={styles.value}>{formatPoint(index.value)}</span>
      {(index.change !== null || index.changeRate !== null) && (
        <span className={toneClass(index)}>
          {index.change !== null && <span className={styles.change}>{formatPointChange(index.change)}</span>}
          {index.changeRate !== null && <span className={styles.rate}>{formatChangeRate(index.changeRate)}</span>}
        </span>
      )}
    </li>
  )
}

/** 오르면 빨강, 내리면 파랑, 보합은 색 없음(utils/format rateTone). 대비율이 없으면 대비(포인트)의 부호로 가른다 */
function toneClass(index: MarketIndex): string {
  return `${styles.tone} ${styles[rateTone(index.changeRate ?? index.change)]}`
}
