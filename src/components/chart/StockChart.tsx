import { useEffect, useRef } from "react";
import { ColorType, CrosshairMode, createChart } from "lightweight-charts";
import type { LogicalRange } from "lightweight-charts";
import type { DailyCandle } from "../../types/stock";
import { formatCompactVolume, getMovingAverageData, toCandlestickData, toVolumeData } from "../../utils/chartFormat";

type StockChartProps = {
  candles: DailyCandle[];
};

const movingAverages = [
  { period: 5, color: "#e94057" },
  { period: 20, color: "#f59f00" },
  { period: 60, color: "#5c7cfa" },
  { period: 120, color: "#ae3ec9" },
];

const PRICE_CHART_HEIGHT = 330;
const VOLUME_CHART_HEIGHT = 110;

export default function StockChart({ candles }: StockChartProps) {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!priceContainerRef.current || !volumeContainerRef.current || candles.length === 0) {
      return;
    }

    const priceContainer = priceContainerRef.current;
    const volumeContainer = volumeContainerRef.current;
    const maxPrice = Math.max(...candles.map((candle) => candle.high));
    const roundedMaxPrice = Math.ceil((maxPrice * 1.08) / 10000) * 10000;

    const priceChart = createChart(priceContainer, {
      width: priceContainer.clientWidth,
      height: PRICE_CHART_HEIGHT,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#5f6b7a",
        fontFamily: "'Inter', 'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "#eef2f6" },
        horzLines: { color: "#eef2f6" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.08,
          bottom: 0,
        },
      },
      timeScale: {
        borderVisible: false,
        visible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 7,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#9aa7b7",
          labelBackgroundColor: "#4c566a",
        },
        horzLine: {
          color: "#9aa7b7",
          labelBackgroundColor: "#4c566a",
        },
      },
      localization: {
        priceFormatter: (price: number) => Math.round(price).toLocaleString("ko-KR"),
      },
    });

    const volumeChart = createChart(volumeContainer, {
      width: volumeContainer.clientWidth,
      height: VOLUME_CHART_HEIGHT,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#8a94a5",
        fontFamily: "'Inter', 'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "#eef2f6" },
        horzLines: { color: "transparent" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.12,
          bottom: 0,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 7,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#9aa7b7",
          labelBackgroundColor: "#4c566a",
        },
        horzLine: {
          color: "transparent",
          labelVisible: false,
        },
      },
      localization: {
        priceFormatter: (price: number) => formatCompactVolume(price),
      },
    });

    const candleSeries = priceChart.addCandlestickSeries({
      upColor: "#e94057",
      downColor: "#2166d1",
      borderUpColor: "#e94057",
      borderDownColor: "#2166d1",
      wickUpColor: "#e94057",
      wickDownColor: "#2166d1",
      priceLineColor: "#2166d1",
      priceLineWidth: 2,
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: 0,
          maxValue: roundedMaxPrice,
        },
        margins: {
          above: 10,
          below: 0,
        },
      }),
    });

    candleSeries.setData(toCandlestickData(candles));

    const volumeSeries = volumeChart.addHistogramSeries({
      priceFormat: {
        type: "custom",
        formatter: (value: number) => formatCompactVolume(value),
      },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    volumeSeries.setData(toVolumeData(candles));

    movingAverages.forEach(({ period, color }) => {
      const series = priceChart.addLineSeries({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      series.setData(getMovingAverageData(candles, period));
    });

    let isSyncingCharts = false;
    const syncVisibleRange = (target: typeof volumeChart, range: LogicalRange | null) => {
      if (range === null || isSyncingCharts) {
        return;
      }

      isSyncingCharts = true;
      target.timeScale().setVisibleLogicalRange(range);
      isSyncingCharts = false;
    };

    const syncVolumeToPrice = (range: LogicalRange | null) => {
      syncVisibleRange(volumeChart, range);
    };

    const syncPriceToVolume = (range: LogicalRange | null) => {
      syncVisibleRange(priceChart, range);
    };

    priceChart.timeScale().subscribeVisibleLogicalRangeChange(syncVolumeToPrice);
    volumeChart.timeScale().subscribeVisibleLogicalRangeChange(syncPriceToVolume);

    priceChart.timeScale().fitContent();
    volumeChart.timeScale().fitContent();

    const priceResizeObserver = new ResizeObserver(([entry]) => {
      priceChart.applyOptions({
        width: Math.floor(entry.contentRect.width),
      });
    });

    const volumeResizeObserver = new ResizeObserver(([entry]) => {
      volumeChart.applyOptions({
        width: Math.floor(entry.contentRect.width),
      });
    });

    priceResizeObserver.observe(priceContainer);
    volumeResizeObserver.observe(volumeContainer);

    return () => {
      priceResizeObserver.disconnect();
      volumeResizeObserver.disconnect();
      priceChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncVolumeToPrice);
      volumeChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncPriceToVolume);
      priceChart.remove();
      volumeChart.remove();
    };
  }, [candles]);

  return (
    <section className="chart-panel" aria-label="삼성전자 일봉 차트">
      <div className="moving-average-legend" aria-label="이동평균선">
        {movingAverages.map((average) => (
          <span key={average.period}>
            <i style={{ backgroundColor: average.color }} />
            MA {average.period}
          </span>
        ))}
      </div>
      <div className="chart-canvas chart-price-canvas" ref={priceContainerRef} />
      <div className="chart-volume-pane">
        <div className="chart-canvas chart-volume-canvas" ref={volumeContainerRef} />
      </div>
    </section>
  );
}
