import { useMemo, useRef, useSyncExternalStore } from 'react'
import { BASE_URL, tokenForRetry } from './client'
import { isMarketHours } from './market'
import { getAccessToken, subscribeAuth } from '../utils/auth'
import { isFiniteNumber } from '../utils/format'

/*
 * 장중 실시간 시세 — SSE `GET /api/stream/prices` 하나를 앱 전체가 같이 쓴다.
 * 서버는 연결 직후 지금 값 전체를 한 번, 그 뒤엔 1초마다 바뀐 종목·지수만 보낸다(이벤트 prices·indices).
 * 상세 화면도 이 연결에서 자기 종목을 고른다 — 서버가 실시간으로 받는 종목은 이 100개뿐이다.
 *
 * EventSource는 머리글을 실을 수 없어 fetch로 읽는다. 이 경로는 로그인해야 열린다(백엔드 SecurityConfig가 공개 목록에 넣지 않았다).
 * 비로그인은 한 번만 시도하고 401이면 로그인이 바뀔 때까지 쉰다 — 백엔드가 공개로 열면 그대로 붙는다.
 * 장중이고 탭이 보이고 값을 쓰는 화면이 하나라도 있을 때만 연결한다.
 */

export interface LivePrice {
  /** 현재가(원) */
  price: number
  /** 전일 대비율(%) */
  changeRate: number
  /** 누적 거래대금(원) */
  tradingValue: number
}

export interface LiveIndex {
  name: string
  value: number
  changeRate: number | null
}

interface Snapshot {
  prices: ReadonlyMap<string, LivePrice>
  indices: ReadonlyMap<string, LiveIndex>
  /** 실시간 값을 받고 있는가 — 화면이 이 값을 덮고 "실시간"이라고 적는다. 잠깐 끊겨 다시 붙는 동안은 그대로 둔다 */
  live: boolean
}

const STREAM_PATH = '/api/stream/prices'
/** 정상 종료(서버가 30분마다 끊는다) 뒤 다시 붙는 때 */
const RECONNECT_MS = 1_000
/** 실패가 이어질 때 기다리는 최대 */
const MAX_BACKOFF_MS = 60_000
/** 이만큼 잇달아 실패하면 받아 둔 값을 실시간으로 보지 않는다 */
const STALE_AFTER_FAILURES = 3
/** 마지막 화면이 떠나고 연결을 닫기까지 — 화면을 옮길 때 끊었다 다시 붙지 않는다 */
const IDLE_CLOSE_MS = 5_000
/** 장 시작·마감을 다시 보는 간격 */
const CLOCK_MS = 60_000

let snapshot: Snapshot = { prices: new Map(), indices: new Map(), live: false }
const listeners = new Set<() => void>()
let controller: AbortController | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
let failures = 0
/** 비로그인 연결이 401을 받았다. 로그인 상태가 바뀌면 푼다 */
let needsLogin = false

function publish(next: Partial<Snapshot>): void {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

function shouldConnect(): boolean {
  return listeners.size > 0 && !needsLogin && document.visibilityState === 'visible' && isMarketHours()
}

/** 지금 맞는 상태로 맞춘다 — 붙어야 하면 붙고, 아니면 끊는다 */
function sync(): void {
  if (shouldConnect()) {
    if (controller === null && retryTimer === null) void connect()
  } else {
    disconnect()
  }
}

function disconnect(): void {
  controller?.abort()
  controller = null
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
  if (snapshot.live) publish({ live: false })
}

function scheduleRetry(delay: number): void {
  controller = null
  if (snapshot.live && failures >= STALE_AFTER_FAILURES) publish({ live: false })
  retryTimer = setTimeout(() => {
    retryTimer = null
    sync()
  }, delay)
}

async function connect(): Promise<void> {
  const own = new AbortController()
  controller = own
  let token = getAccessToken()
  try {
    let response = await openStream(token, own.signal)
    if (response.status === 401 && token !== null) {
      token = await tokenForRetry(token)
      if (token !== null && !own.signal.aborted) response = await openStream(token, own.signal)
    }
    if (response.status === 401) {
      needsLogin = true
      controller = null
      return
    }
    if (!response.ok || response.body === null) throw new Error(`실시간 시세 연결 실패 ${response.status}`)
    failures = 0
    await readEvents(response.body, own.signal)
    if (!own.signal.aborted) scheduleRetry(RECONNECT_MS)
  } catch (error: unknown) {
    if (own.signal.aborted) return
    failures += 1
    console.warn('실시간 시세 연결이 끊겼습니다. 다시 붙습니다', error)
    scheduleRetry(Math.min(RECONNECT_MS * 2 ** failures, MAX_BACKOFF_MS))
  }
}

function openStream(token: string | null, signal: AbortSignal): Promise<Response> {
  return fetch(`${BASE_URL}${STREAM_PATH}`, {
    headers: { Accept: 'text/event-stream', ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
    signal,
  })
}

/** text/event-stream을 빈 줄로 끊어 읽는다. `:`로 시작하는 줄은 서버의 연결 유지 신호다 */
async function readEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  signal.addEventListener('abort', () => void reader.cancel().catch(() => {}), { once: true })
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    blocks.forEach(handleBlock)
  }
}

function handleBlock(block: string): void {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (data.length === 0) return
  let payload: unknown
  try {
    payload = JSON.parse(data.join('\n'))
  } catch {
    return
  }
  const rows = Array.isArray(payload) ? payload : [payload]
  if (event === 'prices' || event === 'price') mergePrices(rows)
  else if (event === 'indices') mergeIndices(rows)
}

function mergePrices(rows: unknown[]): void {
  const next = new Map(snapshot.prices)
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const { stockCode, currentPrice, changeRate, accTradingValue } = row as Record<string, unknown>
    if (typeof stockCode !== 'string' || !isFiniteNumber(currentPrice) || currentPrice <= 0) continue
    const before = next.get(stockCode)
    next.set(stockCode, {
      price: currentPrice,
      changeRate: isFiniteNumber(changeRate) ? changeRate : (before?.changeRate ?? 0),
      tradingValue: isFiniteNumber(accTradingValue) ? accTradingValue : (before?.tradingValue ?? 0),
    })
  }
  publish({ prices: next, live: true })
}

function mergeIndices(rows: unknown[]): void {
  const next = new Map(snapshot.indices)
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const { code, name, currentIndex, changeRate } = row as Record<string, unknown>
    if (typeof code !== 'string' || typeof name !== 'string' || !isFiniteNumber(currentIndex)) continue
    next.set(code, { name, value: currentIndex, changeRate: isFiniteNumber(changeRate) ? changeRate : null })
  }
  publish({ indices: next, live: true })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = null
  if (listeners.size === 1) {
    clockTimer = setInterval(sync, CLOCK_MS)
    document.addEventListener('visibilitychange', sync)
  }
  sync()
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (listeners.size > 0) return
      if (clockTimer !== null) clearInterval(clockTimer)
      clockTimer = null
      document.removeEventListener('visibilitychange', sync)
      disconnect()
    }, IDLE_CLOSE_MS)
  }
}

subscribeAuth(() => {
  needsLogin = false
  disconnect()
  sync()
})

/** 실시간 값. 연결 전·장 밖에는 빈 표다 — 화면은 받아 둔 REST 값을 그대로 쓴다 */
export function useRealtime(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** 목록 한 줄(종가·등락률·거래대금)에 실시간 값을 덮는다. 실시간 값이 없으면 그대로 */
export function withLivePrice<T extends { stockCode: string; closePrice: number | null; fluctuate: number | null; tradingValue: number | null }>(
  row: T,
  prices: ReadonlyMap<string, LivePrice>,
): T {
  const tick = prices.get(row.stockCode)
  if (tick === undefined) return row
  return { ...row, closePrice: tick.price, fluctuate: tick.changeRate, tradingValue: tick.tradingValue || row.tradingValue }
}

type LiveRow = Parameters<typeof withLivePrice>[0]

/**
 * 실시간 값을 덮은 목록. 줄 순서는 rows나 정렬(sortKey)이 바뀔 때만 그때의 값으로 정한다 —
 * 값은 1초마다 바뀌는데 줄이 따라 움직이면 읽던 줄을 놓친다
 */
export function useLiveRows<T extends LiveRow, K>(rows: readonly T[], sortKey: K, sort: (rows: T[], key: K) => T[]): T[] {
  const { prices } = useRealtime()
  const pricesRef = useRef(prices)
  pricesRef.current = prices
  const order = useMemo(
    () => sort(rows.map((row) => withLivePrice(row, pricesRef.current)), sortKey).map((row) => row.stockCode),
    [rows, sortKey, sort],
  )
  return useMemo(() => {
    const byCode = new Map(rows.map((row) => [row.stockCode, row]))
    return order.flatMap((code) => {
      const row = byCode.get(code)
      return row === undefined ? [] : [withLivePrice(row, prices)]
    })
  }, [order, rows, prices])
}
