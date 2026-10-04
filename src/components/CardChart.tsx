import { useEffect, useRef, useState } from 'react'
import type { CardSeries } from '../types/stock'
import { formatChangeRate, isFlatRate } from '../utils/format'
import styles from './TopStockCard.module.css'

/*
 * 홈 카드의 작은 그래프. 2026-09-21에 recharts를 걷어내고 직접 그린다.
 * 2026-10-04 하루 지웠다가(5da71f7) 같은 날 되살렸다 — 데이터를 받는 길은 api/home.ts loadCardSeries.
 *
 * 그림 세 줄(거래량 막대 · 시작-끝을 잇는 점선 · 종가 곡선)을 위해 차트 라이브러리를
 * 통째로 받는 건 과했다. 압축 기준 97KB로 홈의 나머지 코드를 전부 합친 것보다 컸다.
 * 값은 전부 recharts가 그리던 좌표에서 옮겨 왔다 — 여백 8px, 막대 위치와 폭, 가장 큰
 * 거래량이 높이의 1/4, 곡선은 monotone cubic. 여러 폭에서 옛 좌표를 재어 맞췄다.
 *
 * 카드 생김새는 TopStockCard와 이어져야 하므로 CSS는 그쪽 것을 같이 쓴다.
 */

const UP_COLOR = '#f04452'
const DOWN_COLOR = '#3182f6'
/** 보합 글자색. index.css의 --color-text와 같은 값 */
const FLAT_COLOR = '#191f28'
const TREND_COLOR = '#b5bcc4'
const BAR_COLOR = '#eef0f3'

/** 그림이 테두리에 닿지 않게 두는 여백. 아래는 막대가 바닥에 붙어야 해서 0이다 */
const PAD_TOP = 8
const PAD_SIDE = 8
/**
 * 막대를 칸 안에 놓는 규칙. recharts가 쓰던 값을 그대로 옮겼다(여러 폭에서 좌표를 재서 확인).
 * 칸 왼쪽에서 10%만큼 띄우고, 폭은 칸의 80%를 정수로 반올림해 쓴다.
 * 정수로 맞추는 건 막대 가장자리가 화소 사이에 걸쳐 흐려지지 않게 하려는 것이다.
 */
const BAR_INSET_RATIO = 0.1
const BAR_WIDTH_RATIO = 0.8
/** 가장 큰 거래량 막대가 차지할 높이의 역수. 4면 아래 1/4까지만 올라온다 */
const VOLUME_HEAD_ROOM = 4
const DOT_RADIUS = 3.5
/** 좌표를 끊는 자리. 곡선·점선은 셋째, 막대는 넷째 자리까지 쓴다 */
const CURVE_DIGITS = 3
const BAR_DIGITS = 4

interface Size {
  width: number
  height: number
}

/**
 * 부모 칸의 실제 크기를 잰다.
 *
 * 카드 폭이 화면에 따라 달라지므로 좌표를 미리 정해 둘 수 없다. 고정된 좌표계를
 * 늘려 쓰면 넓은 화면에서 선 굵기와 끝점 동그라미까지 같이 부풀어 뭉개진다.
 * 매번 재서 그 폭에 맞는 좌표를 만들면 어느 폭에서나 굵기가 같다.
 */
function useSize(): [React.RefObject<HTMLDivElement | null>, Size | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null) return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

/**
 * 좌표를 소수점 아래 자리에서 끊는다.
 *
 * 남겨 봐야 화면에 티가 안 나는 자리인데, 끊어 두면 그리는 문자열이 짧아지고
 * 같은 값이 늘 같은 글자로 나와 브라우저가 매번 똑같이 그린다.
 * 예전 그림(recharts)도 곡선은 셋째, 막대는 넷째 자리에서 끊었다 — 자릿수를 맞춰 두면
 * 가장자리를 흐리게 칠하는 정도까지 그대로다.
 */
function cut(value: number, digits: number): number {
  const unit = 10 ** digits
  return Math.round(value * unit) / unit
}

/**
 * 점들을 부드럽게 잇는 곡선(monotone cubic). recharts의 type="monotone"과 같은 계산이다.
 *
 * 그냥 직선으로 이으면 꺾인 자리가 도드라지고, 흔한 곡선 보간을 쓰면 고점·저점을
 * 넘어서는 배가 생겨 없던 최고가가 그려진다. 이 방식은 주어진 점 사이를 벗어나지 않는다.
 */
function monotonePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ''
  if (points.length === 1)
    return `M${cut(points[0].x, CURVE_DIGITS)},${cut(points[0].y, CURVE_DIGITS)}`
  /* 점이 둘뿐이면 휘게 할 근거가 없다. 곧게 잇는다(d3도 이 경우엔 직선이다) */
  if (points.length === 2) {
    const c = (value: number) => cut(value, CURVE_DIGITS)
    return `M${c(points[0].x)},${c(points[0].y)}L${c(points[1].x)},${c(points[1].y)}`
  }

  /* 이웃한 두 점을 잇는 직선의 기울기 */
  const secants = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1]
    return (next.y - point.y) / (next.x - point.x)
  })

  /* 각 점에서 곡선이 지나갈 기울기. 양옆 기울기의 부호가 다르면 0으로 눌러 봉우리를 만든다 */
  const tangents = points.map((_, index) => {
    if (index === 0 || index === points.length - 1) return 0

    const before = secants[index - 1]
    const after = secants[index]
    if (before * after <= 0) return 0

    const hBefore = points[index].x - points[index - 1].x
    const hAfter = points[index + 1].x - points[index].x
    const weighted = (before * hAfter + after * hBefore) / (hBefore + hAfter)

    return (
      Math.sign(before) *
      Math.min(Math.abs(before), Math.abs(after), Math.abs(weighted) / 2) *
      2
    )
  })

  /* 양 끝은 이웃 기울기를 보고 맞춘다(d3의 slope2와 같다) */
  tangents[0] = (3 * secants[0] - tangents[1]) / 2
  const last = points.length - 1
  tangents[last] = (3 * secants[last - 1] - tangents[last - 1]) / 2

  const c = (value: number) => cut(value, CURVE_DIGITS)
  let path = `M${c(points[0].x)},${c(points[0].y)}`
  for (let index = 0; index < last; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const third = (to.x - from.x) / 3

    path += `C${c(from.x + third)},${c(from.y + third * tangents[index])},${c(
      to.x - third,
    )},${c(to.y - third * tangents[index + 1])},${c(to.x)},${c(to.y)}`
  }

  return path
}

export default function CardChart({ stock }: { stock: CardSeries }) {
  const [boxRef, size] = useSize()

  const lineColor = stock.changeRate >= 0 ? UP_COLOR : DOWN_COLOR
  /* 선은 한 달 흐름의 방향이라 그대로 두고, 숫자만 보합이면 검게 적는다 */
  const rateColor = isFlatRate(stock.changeRate, 1) ? FLAT_COLOR : lineColor

  return (
    <>
      <p className={styles.rateRow}>
        <span className={styles.rate} style={{ color: rateColor }}>
          {formatChangeRate(stock.changeRate, 1)}
        </span>
        {/* 상세 API의 일봉에서 마지막 한 달. api/cardSeries.ts 참고 */}
        <span className={styles.caption}>한 달 전 대비</span>
      </p>

      {/* 크기를 잰 뒤에야 그릴 수 있다. 첫 그림 전에는 빈 칸이고 높이는 CSS가 잡아 둔다 */}
      <div className={styles.chart} ref={boxRef}>
        {size !== null && <Sparkline stock={stock} size={size} />}
      </div>
    </>
  )
}

function Sparkline({ stock, size }: { stock: CardSeries; size: Size }) {
  const { width, height } = size
  const count = stock.prices.length
  if (count === 0 || width <= 0 || height <= 0) return null

  /*
   * 좌표는 잰 크기를 반올림한 정수 위에서 만든다. 칸 폭은 292.65625처럼 소수로 나오는데
   * recharts도 이 값을 반올림해 쓰고 있었다. 같은 값을 써야 예전 그림과 화소까지 겹친다
   * (0.34px 차이가 선 가장자리 흐림으로 드러난다). 그림은 양옆 8px 안쪽에서 끝나므로
   * 판을 0.5px까지 넓게 잡아도 잘리지 않는다.
   *
   * 크기를 svg 속성(width=…)이 아니라 CSS로 주는 게 중요하다. 숫자로 박으면 그 값이
   * svg의 고유 크기가 되어 카드가 그보다 좁아지지 못한다 — 화면을 좁혀도 카드 세 장이
   * 줄지 않고 넘쳐 흐른다. viewBox도 두지 않는다. 두면 좌표계가 칸 크기에 맞춰 0.1%쯤
   * 줄어들며 선이 화소 사이로 밀려, 반올림으로 맞춰 둔 좌표가 도로 어긋난다.
   */
  const canvasWidth = Math.round(width)
  const canvasHeight = Math.round(height)
  const left = PAD_SIDE
  const plotWidth = Math.max(canvasWidth - PAD_SIDE * 2, 0)
  const plotHeight = Math.max(canvasHeight - PAD_TOP, 0)
  /** 값 하나가 차지하는 가로 칸. 꺾은선의 점은 칸 가운데, 막대는 칸 안쪽에 놓는다 */
  const band = plotWidth / count
  const centerX = (index: number) => left + band * (index + 0.5)

  const min = Math.min(...stock.prices)
  const max = Math.max(...stock.prices)
  /* 한 달 내내 같은 값이면 높낮이를 만들 수 없다. 가운데 선으로 눕힌다 */
  const toY = (price: number) =>
    max === min
      ? PAD_TOP + plotHeight / 2
      : PAD_TOP + ((max - price) / (max - min)) * plotHeight

  const maxVolume = Math.max(...stock.volumes)
  const barWidth = Math.max(Math.round(band * BAR_WIDTH_RATIO), 1)
  const barInset = band * BAR_INSET_RATIO

  const points = stock.prices.map((price, index) => ({
    x: centerX(index),
    y: toY(price),
  }))
  const lastPoint = points[points.length - 1]
  const lineColor = stock.changeRate >= 0 ? UP_COLOR : DOWN_COLOR

  return (
    /* 숫자(등락률)가 옆에 글자로 적혀 있어 읽어주는 기기에는 그림을 숨긴다 */
    <svg
      style={{ display: 'block', width: '100%', height: '100%' }}
      aria-hidden="true"
    >
      {maxVolume > 0 &&
        stock.volumes.map((volume, index) => {
          const barHeight =
            (volume / (maxVolume * VOLUME_HEAD_ROOM)) * plotHeight
          const x = cut(left + band * index + barInset, BAR_DIGITS)
          const y = cut(canvasHeight - barHeight, BAR_DIGITS)
          const h = cut(barHeight, BAR_DIGITS)
          return (
            <path
              key={index}
              d={`M ${x},${y} h ${barWidth} v ${h} h -${barWidth} Z`}
              fill={BAR_COLOR}
            />
          )
        })}

      {/*
        시작과 끝을 곧게 이어, 오르내림 속 전체 방향을 눈에 보이게 한다.
        선 하나로 그어도 같은 자리지만, 값마다 점을 찍어 잇는다 — 예전 그림이 그랬고
        점선 조각이 끊기는 자리가 한 화소도 어긋나지 않는다.
      */}
      {count > 1 && (
        <path
          d={points
            .map((point, index) => {
              const y =
                points[0].y +
                ((lastPoint.y - points[0].y) * index) / (count - 1)
              return `${index === 0 ? 'M' : 'L'}${cut(point.x, CURVE_DIGITS)},${cut(y, CURVE_DIGITS)}`
            })
            .join('')}
          fill="none"
          stroke={TREND_COLOR}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}

      <path
        d={monotonePath(points)}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.8}
      />

      {/* 마지막 값에만 점을 찍어 '지금 여기'를 알린다 */}
      <circle
        cx={lastPoint.x}
        cy={lastPoint.y}
        r={DOT_RADIUS}
        fill="#fff"
        stroke={lineColor}
        strokeWidth={2}
      />
    </svg>
  )
}
