import { useEffect, useRef, useState } from 'react'
import { INDEX_REFRESH_MS, isMarketHours, loadMarketIndices, readCachedIndices } from '../api/market'
import { loadMarketCalendar, marketStatus, sessionClock } from '../api/marketCalendar'
import { useRealtime, type LiveIndex } from '../api/realtime'
import { toKoreanDateTime, toKoreanDateWithDay } from '../utils/date'
import { formatChangeRate, formatPoint, rateTone } from '../utils/format'
import type { MarketIndex, MarketIndices, MarketStatus } from '../types/market'
import styles from './MarketIndexBar.module.css'

/**
 * 화면 아래에 붙는 국내 지수 띠(코스피·코스닥). App의 Layout에 한 번 놓여 화면을 옮겨도 다시 묻지 않는다.
 * 처음 한 번 REST로 받고, 장중에는 실시간 연결(api/realtime.ts)의 값으로 바꿔 그린다. 실시간 연결이 없으면 장중에 1분마다 다시 묻는다.
 * 보여줄 값이 없으면(못 받았고 지난 값도 없음 — 비로그인은 지수 API가 401이다) 띠를 그리지 않는다.
 *
 * 맨 앞에 장 상태(장 시작 전·장 중·장 마감·오늘 휴장)와 오늘 장 진행 막대를 둔다 — 초보자는 지금 가격이 움직이는 때인지 모른다.
 * 휴장일은 로그인했을 때 받아 둔다(api/marketCalendar.ts). 모르면 장 상태를 적지 않는다. 600px 이하는 지수가 먼저라 적지 않고,
 * 900px 이하는 막대 대신 띠 위 끝의 가는 줄로 진행을 보인다.
 */
export default function MarketIndexBar() {
  const [data, setData] = useState<MarketIndices | null>(readCachedIndices)
  const [settled, setSettled] = useState(false)
  /** 장 상태를 다시 읽는 때. 1분마다, 그리고 휴장일을 받은 뒤 바꾼다 */
  const [now, setNow] = useState(() => Date.now())
  const realtime = useRealtime()
  const liveRef = useRef(false)
  liveRef.current = realtime.live && realtime.indices.size > 0

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
      if (document.visibilityState === 'visible' && isMarketHours() && !liveRef.current) refresh()
    }, INDEX_REFRESH_MS)
    return () => {
      isStale = true
      clearInterval(timer)
    }
  }, [])

  const live = liveRef.current
  const indices = live ? withLive(data?.indices ?? [], realtime.indices) : (data?.indices ?? [])
  if (indices.length === 0) {
    // 처음 받는 동안은 띠 자리만 잡아 둔다. 못 받았으면 띠째 뺀다
    return settled || data !== null ? null : (
      <div className={styles.bar} aria-hidden="true" data-index-bar="">
        <div className={styles.inner} />
      </div>
    )
  }

  const asOf = data !== null ? toKoreanDateTime(data.receivedAt) : ''
  const status = marketStatus(now)
  const session = sessionClock(status, now)

  return (
    <aside className={styles.bar} aria-label="국내 지수" data-index-bar="">
      {/* 좁은 화면의 장 진행 — 띠 위 끝 가는 줄(장 중만). 글은 아래 막대가 읽어 준다 */}
      {session?.until === 'close' && <span className={styles.edge} style={{ width: `${session.ratio * 100}%` }} aria-hidden="true" />}
      <div className={styles.inner}>
        {status !== null && (
          <div className={styles.statusGroup}>
            <StatusText status={status} />
            {session !== null && <SessionTrack session={session} />}
          </div>
        )}
        <p className={styles.label}>국내 지수</p>
        <ul className={styles.list}>
          {indices.map((index) => (
            <IndexItem key={index.code} index={index} />
          ))}
        </ul>
        {live ? <p className={styles.asOf}>실시간</p> : asOf !== '' && <p className={styles.asOf}>{asOf} 기준</p>}
      </div>
    </aside>
  )
}

/** REST로 받은 줄에 실시간 값을 덮는다. REST에 없던 지수는 실시간 쪽 이름으로 더한다 */
function withLive(base: MarketIndex[], live: ReadonlyMap<string, LiveIndex>): MarketIndex[] {
  const rows = base.map((index) => {
    const tick = live.get(index.code)
    return tick === undefined ? index : { ...index, value: tick.value, changeRate: tick.changeRate ?? index.changeRate }
  })
  for (const [code, tick] of live) {
    if (!rows.some((row) => row.code === code)) rows.push({ code, name: tick.name, value: tick.value, changeRate: tick.changeRate })
  }
  return rows
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

/** "4시간 30분"·"45분"·"2시간" */
function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}분`
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`
}

/** 오늘 장 진행 막대 + 남은 시간(장 중 "4시간 30분 남음", 장 시작 전 "30분 뒤 개장") */
function SessionTrack({ session }: { session: NonNullable<ReturnType<typeof sessionClock>> }) {
  const left = session.until === 'close' ? `${duration(session.minutesLeft)} 남음` : `${duration(session.minutesLeft)} 뒤 개장`
  const percent = Math.round(session.ratio * 100)
  return (
    <span className={styles.session}>
      <span
        className={styles.track}
        role="progressbar"
        aria-label="오늘 장 진행"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={left}
      >
        <span className={styles.fill} style={{ width: `${session.ratio * 100}%` }} />
      </span>
      <span className={styles.left}>{left}</span>
    </span>
  )
}

function IndexItem({ index }: { index: MarketIndex }) {
  return (
    <li className={styles.item}>
      <span className={styles.name}>{index.name}</span>
      <span className={styles.value}>{formatPoint(index.value)}</span>
      {index.changeRate !== null && <span className={toneClass(index)}>{formatChangeRate(index.changeRate)}</span>}
    </li>
  )
}

/** 오르면 빨강, 내리면 파랑, 보합은 색 없음(utils/format rateTone). 대비율이 없으면 대비(포인트)의 부호로 가른다 */
function toneClass(index: MarketIndex): string {
  return `${styles.tone} ${styles[rateTone(index.changeRate)]}`
}
