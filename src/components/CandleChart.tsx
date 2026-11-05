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
import { cssToken } from '../utils/cssToken'
import { formatChangeRate, formatNumber, isFiniteNumber, rateTone } from '../utils/format'
import styles from './CandleChart.module.css'

/**
 * 캔버스에 넘길 색. 캔버스는 CSS 변수를 못 읽어 차트를 만들 때 index.css 토큰에서 꺼낸다(utils/cssToken).
 * 국내 시장 관례대로 오르면 빨강, 내리면 파랑. 봉·막대는 그림이라 기본 등락색이다(글자는 -text — 아래 Legend)
 */
function readPalette() {
  return {
    up: cssToken('--color-up'),
    down: cssToken('--color-down'),
    upVolume: cssToken('--color-up-soft'),
    downVolume: cssToken('--color-down-soft'),
    surface: cssToken('--color-surface'),
    textSub: cssToken('--color-text-sub'),
    border: cssToken('--color-border'),
    grid: cssToken('--color-chart-grid'),
  }
}

/** 아래 거래량 칸이 차지할 높이 비율 */
const VOLUME_PANE_RATIO = 0.26

/** 가격 눈금. 원 단위라 세 자리 콤마만 넣는다 */
function formatPriceTick(price: number): string {
  return formatNumber(Math.round(price))
}

/** 거래량 눈금. 주 단위 숫자가 길어서 만·억으로 줄인다. 1,234,567 → "123만"(utils/format formatVolume은 "123만주" — 눈금엔 단위를 안 붙인다) */
function formatVolumeTick(volume: number): string {
  if (volume >= 100_000_000) return `${(volume / 100_000_000).toFixed(1)}억`
  if (volume >= 10_000) {
    return `${formatNumber(Math.round(volume / 10_000))}만`
  }
  return formatNumber(Math.round(volume))
}

/*
 * 범례에 적는 값. 눈금 포맷터와 달리 봉 값이 비면(응답에서 빠지면) "-"다 — Math.round(null)이 0이라
 * 빈 봉이 "시 0 … 종 0"으로 적힌다. 눈금은 라이브러리가 숫자만 넘기므로 위 두 함수를 그대로 쓴다.
 */
function legendPrice(price: number | null | undefined): string {
  return isFiniteNumber(price) ? formatPriceTick(price) : '-'
}

function legendVolume(volume: number | null | undefined): string {
  return isFiniteNumber(volume) ? `${formatVolumeTick(volume)}주` : '-'
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
  /** 차트를 만들 때 읽어 둔 색. 거래량 막대를 칠할 때도 쓴다 */
  const paletteRef = useRef<ReturnType<typeof readPalette> | null>(null)

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
    const palette = readPalette()
    paletteRef.current = palette

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.surface },
        textColor: palette.textSub,
        fontFamily: "'Pretendard', -apple-system, system-ui, sans-serif",
        fontSize: 12,
        panes: { separatorColor: palette.border, enableResize: false },
        // 차트 안 로고는 거래량 막대 위에 얹혀 막대를 가려 끈다. 라이선스가 요구하는 출처·링크는 차트 아래에 적는다(아래 .credit)
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: palette.border,
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
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceFormat: { type: 'custom', formatter: formatPriceTick, minMove: 1 },
    })

    /*
     * 거래량은 주가와 자릿수가 딴판이라 같은 눈금에 얹으면 축이 주가에 끌려간다.
     * 아래 칸(pane 1)으로 떼어내면 거래량만의 눈금이 그 칸 안에서 매겨진다.
     */
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'custom', formatter: formatVolumeTick, minMove: 1 },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    )

    volumeSeries.priceScale().applyOptions({
      borderColor: palette.border,
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
    const palette = paletteRef.current
    if (candleSeries === null || volumeSeries === null || palette === null) return

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

    // 거래량이 빈 날은 막대를 비운다(값 없이 시각만 주면 라이브러리가 그 자리를 건너뛴다)
    volumeSeries.setData(
      candles.map((candle) =>
        isFiniteNumber(candle.volume)
          ? {
              time: toDashedYmd(candle.date),
              value: candle.volume,
              color:
                candle.close >= candle.open ? palette.upVolume : palette.downVolume,
            }
          : { time: toDashedYmd(candle.date) },
      ),
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
   * 범례는 봉에 마우스를 올렸을 때(휴대폰은 누른 동안)만 그 봉 값을 띄운다. 기본 값(마지막 거래일)은 오른쪽 열 시세 요약이
   * 맡는다 — 늘 띄우면 한 화면에 같은 값이 두 번, 머리 현재가와 어긋난 종가가 또 하나 보인다.
   * 차트 위에 떠 있는 층이라 생기고 사라져도 차트가 흔들리지 않는다
   */
  return (
    <div className={styles.wrap}>
      {hovered !== null && <Legend point={hovered} />}
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

  // 그 봉과 전 봉의 종가가 둘 다 있어야 적는다. 종가가 비면 (null - 전날) / 전날 = "-100.00%"가 된다
  const rate =
    !isFiniteNumber(candle.close) || !isFiniteNumber(prevClose) || prevClose === 0
      ? null
      : ((candle.close - prevClose) / prevClose) * 100

  // 글자라 대비가 맞는 -text 색이다(CandleChart.module.css .up·.down). 보합은 기본 글자색
  const tone = rateTone(rate)
  const rateClass = tone === 'flat' ? undefined : styles[tone]

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
        종 <b className={rateClass}>{legendPrice(candle.close)}</b>
      </span>

      {rate !== null && (
        <b className={rateClass}>{formatChangeRate(rate)}</b>
      )}

      <span className={styles.legendVolume}>
        거래량 <b>{legendVolume(candle.volume)}</b>
      </span>
    </div>
  )
}
