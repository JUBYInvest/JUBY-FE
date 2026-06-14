import { BarChart3 } from "lucide-react";

export default function ChartToolbar() {
  return (
    <div className="chart-toolbar" aria-label="차트 도구">
      <div className="range-tabs" aria-label="차트 기간">
        <button className="active" type="button">
          <BarChart3 aria-hidden="true" size={16} />
          <span>일봉 보기</span>
        </button>
      </div>
    </div>
  );
}
