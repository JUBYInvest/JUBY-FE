import { reloadPage } from './reloadPage'

/**
 * 미리 받기가 실패했는지. 브라우저(적어도 크롬)는 실패한 import를 페이지가 살아 있는 동안 기억해서,
 * 같은 주소로 다시 import하면 서버에 묻지도 않고 곧바로 실패를 돌려준다.
 */
let preloadFailed = false

function importStockChartPage() {
  return import('../pages/StockChartPage')
}

/**
 * 종목 상세 화면 묶음. App.tsx의 lazy가 이 함수를 그대로 쓴다.
 * 차트 라이브러리가 들어 있어 화면 묶음 중 가장 크다.
 *
 * 미리 받기가 실패했으면 여기서 다시 import해도 그 실패가 그대로 돌아와 오류 화면이 뜬다.
 * 그때는 페이지를 새로 받는다. 이미 상세 주소로 옮겨 온 뒤라 새로 받은 페이지가 곧 상세 화면이고,
 * 새 페이지는 실패 기록이 비어 있어 정상적으로 받는다. 목록에서 들고 온 값(state)도 주소 기록에
 * 남아 그대로 보인다. 새 페이지에서는 미리 받기를 거치지 않으므로, 거기서 또 실패하면 오류 화면이
 * 받는다 — 새로 받기가 되풀이되지 않는다. 사파리는 새로고침한 문서에서도 앞선 실패를 되풀이하므로
 * 받지 못한 묶음을 먼저 다시 받아 두고 새로고침한다(reloadPage).
 */
export function loadStockChartPage() {
  if (preloadFailed) {
    void reloadPage()
    // 새 페이지가 뜰 때까지 Suspense 대기로 둔다
    return new Promise<never>(() => {})
  }
  return importStockChartPage()
}

/**
 * 브라우저가 한가할 때 상세 화면 묶음을 미리 받는다. 종목 링크가 늘어선 화면(홈·관심종목)이 부른다.
 *
 * 미리 받지 않으면 종목을 누른 순간에야 묶음을 받기 시작하고, 상세·뉴스 요청은 그 화면이
 * 그려진 **뒤에** 출발한다. 묶음을 받는 시간만큼 서버를 기다리기 시작하는 게 늦어진다.
 * 정적 파일이라 백엔드·증권사 부담은 없다.
 *
 * 돌려주는 함수는 아직 시작하지 않은 예약을 취소한다(effect 정리용).
 */
export function preloadStockChartPage(): () => void {
  const start = () => {
    // 실패는 여기서 삼키고 기억만 한다. 들어갈 때 loadStockChartPage가 페이지를 새로 받는다
    importStockChartPage().catch(() => {
      preloadFailed = true
    })
  }

  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(start, { timeout: 2000 })
    return () => window.cancelIdleCallback(id)
  }
  // 사파리에는 requestIdleCallback이 없다
  const id = window.setTimeout(start, 1000)
  return () => window.clearTimeout(id)
}
