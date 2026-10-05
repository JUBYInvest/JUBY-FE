import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Candle } from '../types/stock'
import { toDashedYmd, toKoreanDate } from '../utils/date'
import { formatChangeRate, formatNumber, isFiniteNumber, isFlatRate } from '../utils/format'
import styles from './CandleChart.module.css'

/** 국내 시장 관례대로 오르면 빨강, 내리면 파랑 */
const UP_COLOR = '#f04452'
const DOWN_COLOR = '#3182f6'
const UP_VOLUME_COLOR = 'rgba(240, 68, 82, 0.35)'
const DOWN_VOLUME_COLOR = 'rgba(49, 130, 246, 0.35)'

/** 아래 거래량 칸이 차지할 높이 비율 */
const VOLUME_PANE_RATIO = 0.26

/** 가격 눈금. 원 단위라 세 자리 콤마만 넣는다 */
function formatPriceTick(price: number): string {
  return formatNumber(Math.round(price))
}

/** 거래량 눈금. 주 단위 숫자가 길어서 만·억으로 줄인다. 1,234,567 → "123만" */
function formatVolume(volume: number): string {
  if (volume >= 100_000_000) return `${(volume / 100_000_000).toFixed(1)}억`
  if (volume >= 10_000) {
    return `${formatNumber(Math.round(volume / 10_000))}만`
  }
  return formatNumber(Math.round(volume))
}

/*
 * 범례에 적는 값. 눈금 포맷터와 달리 봉 값이 비면(응답에서 빠지면) "-"다 — Math.round(null)이 0이라
 * 빈 봉이 "시 0 … 종 0"으로 적혔다. 눈금은 라이브러리가 숫자만 넘기므로 위 두 함수를 그대로 쓴다.
 */
function legendPrice(price: number | null | undefined): string {
  return isFiniteNumber(price) ? formatPriceTick(price) : '-'
}

function legendVolume(volume: number | null | undefined): string {
  return isFiniteNumber(volume) ? `${formatVolume(volume)}주` : '-'
}

interface Props {
  candles: Candle[]
}

/** 봉 하나와 그 전날 종가. 등락률을 내려면 전날 종가가 있어야 한다 */
interface Point {
  candle: Candle
  /** 첫 봉은 이전 봉이 없어 null */
  prevClose: number | null
}

export default function CandleChart({ candles }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const chartRef = useRef<IChartApi | null>(null)

  /** 크로스헤어가 가리키는 봉. 차트 밖으로 나가면 null이 되고 마지막 봉을 대신 보여준다 */
  const [hovered, setHovered] = useState<Point | null>(null)

  /*
   * 크로스헤어 핸들러가 봉을 찾아볼 표. 시간 문자열이 열쇠다.
   * 구독은 차트를 만들 때 한 번만 걸고, 데이터가 바뀌면 이 ref의 내용만 갈아끼운다.
   * candles를 클로저로 잡으면 종목이 바뀔 때마다 구독을 다시 걸어야 한다.
   */
  const pointsRef = useRef(new Map<string, Point>())

  // 차트는 마운트할 때 한 번만 만든다. 데이터가 바뀔 때마다 새로 만들면 눈에 띄게 깜빡인다
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const chart = createChart(container, {
      autoSize: true,
      // 색은 index.css의 --color-surface·--color-text-sub·--color-border와 같은 값이다(캔버스라 CSS 변수를 못 쓴다)
      layout: {
        background: { type: ColorType.Solid, color: '#fff' },
        textColor: '#857f75',
        fontFamily: "'Pretendard', -apple-system, system-ui, sans-serif",
        fontSize: 12,
        panes: { separatorColor: '#e8e3da', enableResize: false },
        // 차트 안 로고는 거래량 막대 위에 얹혀 막대를 가렸다. 라이선스가 요구하는 출처·링크는 차트 아래에 적는다(아래 .credit)
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#f5f2ec' },
        horzLines: { color: '#f5f2ec' },
      },
      rightPriceScale: {
        borderColor: '#e8e3da',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#e8e3da',
        // 데이터 바깥의 빈 공간까지 밀려나가지 않도록 양끝을 막아 둔다
        fixLeftEdge: true,
        fixRightEdge: true,
        minBarSpacing: 0.8,
      },
      // 차트를 잡아끌면 과거로, 휠이나 시간축을 끌면 간격이 좁아지며 더 많은 봉이 들어온다
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: false },
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'ko-KR' },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceFormat: { type: 'custom', formatter: formatPriceTick, minMove: 1 },
    })

    /*
     * 거래량은 주가와 자릿수가 딴판이라 같은 눈금에 얹으면 축이 주가에 끌려간다.
     * 아래 칸(pane 1)으로 떼어내면 거래량만의 눈금이 그 칸 안에서 매겨진다.
     */
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'custom', formatter: formatVolume, minMove: 1 },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    )

    volumeSeries.priceScale().applyOptions({
      borderColor: '#e8e3da',
      scaleMargins: { top: 0.2, bottom: 0 },
    })

    function resizeVolumePane() {
      const panes = chart.panes()
      if (panes.length < 2 || container === null) return
      panes[1].setHeight(
        Math.round(container.clientHeight * VOLUME_PANE_RATIO),
      )
    }

    resizeVolumePane()

    // autoSize가 높이를 다시 잡으면 아래 칸 비율도 따라가야 한다
    const observer = new ResizeObserver(resizeVolumePane)
    observer.observe(container)

    /*
     * 봉에 마우스를 올렸을 때 그 날의 시·고·저·종을 위에 띄운다.
     * 크로스헤어만 있고 숫자가 없으면 어느 봉이 얼마인지 읽을 방법이 없다.
     * 차트 밖으로 나가면 time이 비어 오는데, 그때는 마지막 봉으로 되돌린다.
     */
    chart.subscribeCrosshairMove((param) => {
      const time = param.time
      setHovered(typeof time === 'string' ? pointsRef.current.get(time) ?? null : null)
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    if (candleSeries === null || volumeSeries === null) return

    // 종목이 바뀌면 지난 종목의 봉이 남아 엉뚱한 값을 띄운다. 매번 새로 만든다
    pointsRef.current = new Map(
      candles.map((candle, index) => [
        toDashedYmd(candle.date),
        { candle, prevClose: index === 0 ? null : candles[index - 1].close },
      ]),
    )
    setHovered(null)

    candleSeries.setData(
      candles.map((candle) => ({
        time: toDashedYmd(candle.date),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    )

    volumeSeries.setData(
      candles.map((candle) => ({
        time: toDashedYmd(candle.date),
        value: candle.volume,
        color:
          candle.close >= candle.open ? UP_VOLUME_COLOR : DOWN_VOLUME_COLOR,
      })),
    )

    /*
     * 넘겨받은 봉을 전부 화면에 맞춘다. 기간은 상세 화면의 탭이 이미 잘라서 주므로
     * 여기서 다시 최근 몇 봉만 열어 둘 이유가 없다 — 탭이 곧 확대·축소다.
     */
    if (candles.length > 0) {
      chartRef.current?.timeScale().fitContent()
    }
  }, [candles])

  /*
   * 마우스를 올리기 전에는 가장 최근 봉을 보여준다.
   * 빈 자리로 두면 마우스가 들어올 때마다 줄이 생겼다 사라져 차트가 흔들린다.
   */
  const lastIndex = candles.length - 1
  const shown =
    hovered ??
    (lastIndex < 0
      ? null
      : {
          candle: candles[lastIndex],
          prevClose: lastIndex < 1 ? null : candles[lastIndex - 1].close,
        })

  return (
    <div className={styles.wrap}>
      {shown !== null && <Legend point={shown} />}
      <div ref={containerRef} className={styles.chart} />
      {/*
        라이브러리 라이선스(Apache 2.0)가 요구하는 출처 표시와 https://www.tradingview.com/ 링크.
        NOTICE: TradingView Lightweight Charts™ — Copyright (c) TradingView, Inc. https://www.tradingview.com/
      */}
      <a
        className={styles.credit}
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer"
      >
        TradingView Lightweight Charts™
      </a>
    </div>
  )
}

/** 차트 위에 겹쳐 놓는 그날의 값. 마우스를 가리지 않도록 클릭은 통과시킨다(CSS) */
function Legend({ point }: { point: Point }) {
  const { candle, prevClose } = point

  // 그 봉과 전 봉의 종가가 둘 다 있어야 적는다. 종가가 비면 (null - 전날) / 전날 = "-100.00%"가 됐다
  const rate =
    !isFiniteNumber(candle.close) || !isFiniteNumber(prevClose) || prevClose === 0
      ? null
      : ((candle.close - prevClose) / prevClose) * 100

  const rateColor =
    rate === null || isFlatRate(rate)
      ? undefined
      : rate > 0
        ? UP_COLOR
        : DOWN_COLOR

  return (
    <div className={styles.legend}>
      <span className={styles.legendDate}>{toKoreanDate(candle.date)}</span>

      <span>
        시 <b>{legendPrice(candle.open)}</b>
      </span>
      <span>
        고 <b>{legendPrice(candle.high)}</b>
      </span>
      <span>
        저 <b>{legendPrice(candle.low)}</b>
      </span>
      <span>
        종 <b style={{ color: rateColor }}>{legendPrice(candle.close)}</b>
      </span>

      {rate !== null && (
        <b style={{ color: rateColor }}>{formatChangeRate(rate)}</b>
      )}

      <span className={styles.legendVolume}>
        거래량 <b>{legendVolume(candle.volume)}</b>
      </span>
    </div>
  )
}
