import { periodStart } from '../utils/date'
import type { Candle, CardSeries } from '../types/stock'

/*
 * 홈 카드 그래프(1년 종가·거래량을 주 단위로 묶은 것)를 브라우저에 담아 둔다.
 *
 * 1년인 까닭: 홈 머리말이 "SMA 이동평균선 전략 · 1년 기준으로 뽑은"이다. 카드가 한 달 등락을 크게 적으면 그 한 달 때문에
 * 뽑힌 것처럼 읽혀 위계가 어긋났다(2026-10-04 사용자 지적, 같은 날 1년으로 맞춤).
 *
 * 일봉은 평일 16시 배치로 하루 한 번만 바뀐다. 한 번 받은 그래프는 다음 배치까지 그대로 맞으므로, 다시 묻지 않는다.
 * 카드가 받은 것(ONE_YEAR)과 상세 화면이 받은 것(ALL에서 마지막 1년을 잘라)을 같이 담는다 —
 * 상세를 본 종목은 홈 카드가 서버에 묻지 않는다. 1년을 자르는 규칙은 서버가 ONE_YEAR를 자르는 규칙과 같다(periodStart).
 *
 * 증권사를 거치는 상세 API로만 받을 수 있는 값이라(api/stock.ts "사용자가 누르지 않은 증권사 호출") 담아 두는 게 곧 딜레이를 줄이는 길이다.
 */

/** 한 달 그래프를 담던 'cardSeries'와 다른 키 — 옛 값을 1년 그래프로 읽지 않는다 */
const KEY = 'cardSeriesYear'
/** 카드는 세 장이지만 대장이 바뀌거나 상세에서 본 종목도 담으므로 조금 넉넉히 둔다. 넘치면 오래된 것부터 버린다 */
const MAX_ENTRIES = 12
/** 홈 시세표 기준일을 모를 때(아직 안 왔거나 실패) 받아 둔 값을 믿는 기간 */
const MAX_AGE_WITHOUT_BASE = 3 * 24 * 60 * 60 * 1000
/**
 * 기준일보다 마지막 봉이 이른데도 믿는 기간. 거래정지 종목은 마지막 봉이 기준일에 못 미쳐 영영 "묵은 값"이 된다 —
 * 그때 홈에 올 때마다 다시 묻지 않게 막 받은 값은 잠깐 믿는다.
 */
const MAX_AGE_BEHIND_BASE = 30 * 60 * 1000

interface Stored extends CardSeries {
  savedAt: number
}

function isNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item))
}

/** 모양이 하나라도 틀리면(예전 판이 다른 모양으로 저장, 사람이 손댄 값) 버린다. 그대로 그리면 카드가 던진다 */
function isStored(value: unknown, stockCode: string): value is Stored {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<Stored>
  return (
    entry.stockCode === stockCode &&
    typeof entry.lastDate === 'string' &&
    /^\d{8}$/.test(entry.lastDate) &&
    typeof entry.savedAt === 'number' &&
    Number.isFinite(entry.savedAt) &&
    typeof entry.changeRate === 'number' &&
    Number.isFinite(entry.changeRate) &&
    isNumbers(entry.prices) &&
    entry.prices.length > 0 &&
    isNumbers(entry.volumes) &&
    entry.volumes.length === entry.prices.length
  )
}

function readAll(): Map<string, Stored> {
  const all = new Map<string, Stored>()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return all
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return all
    for (const [stockCode, value] of Object.entries(parsed)) {
      if (isStored(value, stockCode)) all.set(stockCode, value)
    }
  } catch {
  }
  return all
}

/** YYYYMMDD가 속한 주(월요일 시작)의 번호. 1970-01-01이 목요일이라 3일을 밀면 월요일에서 주가 바뀐다 */
function weekOf(date: string): number {
  const days = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))) / 86_400_000
  return Math.floor((days + 3) / 7)
}

/**
 * 받은 일봉에서 마지막 1년을 잘라 주 단위로 묶어 담는다. 그릴 봉이 없으면 담지 않는다.
 *
 * 1년이면 봉이 250개쯤이라 카드 폭(300px 안팎)에 막대가 1px 남짓이 되어 뭉개진다. 주마다 마지막 종가와 거래량 합으로 묶으면
 * 52개쯤으로 예전 한 달 그래프와 비슷한 밀도가 된다. 등락률은 묶기 전 첫날 종가와 마지막 종가로 낸다 — "1년 전 대비"다.
 */
export function rememberCardSeries(stockCode: string, candles: Candle[]): void {
  const last = candles.at(-1)
  if (last === undefined) return
  const start = periodStart(last.date, 'ONE_YEAR')
  const year = start === null ? candles : candles.filter((candle) => candle.date >= start)
  const first = year[0]
  if (first === undefined) return

  const prices: number[] = []
  const volumes: number[] = []
  let week: number | null = null
  for (const candle of year) {
    // 거래량만 빈 봉은 차트가 그대로 그린다(api/stock.ts). 카드 막대는 그날을 비운다
    const volume = Number.isFinite(candle.volume) ? candle.volume : 0
    const current = weekOf(candle.date)
    if (current === week) {
      prices[prices.length - 1] = candle.close
      volumes[volumes.length - 1] += volume
    } else {
      prices.push(candle.close)
      volumes.push(volume)
      week = current
    }
  }

  const entry: Stored = {
    stockCode,
    lastDate: last.date,
    prices,
    volumes,
    changeRate: first.close === 0 ? 0 : ((last.close - first.close) / first.close) * 100,
    savedAt: Date.now(),
  }

  const all = readAll()
  all.set(stockCode, entry)
  const kept = [...all.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept.map((item) => [item.stockCode, item]))))
  } catch {
  }
}

/**
 * 담아 둔 그래프. 홈 시세표의 기준일(YYYYMMDD)까지 닿아 있어야 쓴다 — 하루 묵은 그래프 밑에 오늘 종가가 붙으면 안 된다.
 * 기준일을 모르면 3일 안에 담은 것을 쓴다.
 */
export function readCardSeries(stockCode: string, baseDate: string | null): CardSeries | null {
  const entry = readAll().get(stockCode)
  if (entry === undefined) return null
  const age = Date.now() - entry.savedAt
  const fresh =
    baseDate === null
      ? age < MAX_AGE_WITHOUT_BASE
      : entry.lastDate >= baseDate || age < MAX_AGE_BEHIND_BASE
  if (!fresh) return null
  const { savedAt: _savedAt, ...series } = entry
  return series
}
