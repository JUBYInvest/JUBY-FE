/**
 * 받지 못한 화면 묶음(JS·CSS) 주소. 앱이 뜰 때부터 두 갈래로 모은다 — 한쪽만으로는 빠지는 경우가 있다.
 *
 * ① 묶음을 불러올 때 Vite가 꽂는 `<link rel="modulepreload">`·`<link rel="stylesheet">`의 error 이벤트.
 *    요청이 망에 닿기도 전에 막히면 사파리는 자원 기록을 남기지 않는데, 이 이벤트는 뜬다.
 * ② 자원 기록(PerformanceObserver). 링크 없이 불러온 묶음을 위한 것이다. 기록은 기본 250건까지만 남아
 *    오래 쓴 탭에서는 앞 기록이 밀려나므로, 나중에 꺼내 보지 않고 관찰자로 받는 족족 본다.
 */
const failedAssets = new Set<string>()

/** 이 앱의 화면 묶음 주소인가. 같은 출처의 .js·.css만 다시 받는다 */
function isOwnAsset(href: string): boolean {
  const url = new URL(href, document.baseURI)
  return url.origin === window.location.origin && /\.(js|css)$/.test(url.pathname)
}

document.addEventListener(
  'error',
  (event) => {
    const target = event.target
    const href =
      target instanceof HTMLLinkElement
        ? target.href
        : target instanceof HTMLScriptElement
          ? target.src
          : ''
    if (href !== '' && isOwnAsset(href)) failedAssets.add(href)
  },
  // 요소의 error 이벤트는 위로 올라오지 않아 잡는 단계에서 받는다
  true,
)

/**
 * 자원 기록 중 받지 못한 묶음인가.
 * 크롬은 상태코드(responseStatus)를 남기고, 사파리는 상태코드 없이 본문을 0바이트로 남긴다.
 * 묶음에는 빈 파일이 없으므로 본문이 0바이트면 받지 못한 것이다.
 */
function isFailedAsset(entry: PerformanceEntry): boolean {
  if (!(entry instanceof PerformanceResourceTiming) || !isOwnAsset(entry.name)) {
    return false
  }
  const status = (entry as PerformanceResourceTiming & { responseStatus?: number })
    .responseStatus
  return (status !== undefined && status >= 400) || entry.decodedBodySize === 0
}

try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (isFailedAsset(entry)) failedAssets.add(entry.name)
    }
  }).observe({ type: 'resource', buffered: true })
} catch {
  // 관찰자가 없는 환경이면 ①만으로 모은다
}

/** 묶음 하나를 다시 받는 데 기다리는 한도. 망이 끊겨 있으면 오래 매달릴 이유가 없다 */
const REFETCH_TIMEOUT = 5_000

/**
 * 페이지를 새로 받는다. 그 전에 받지 못한 화면 묶음을 캐시를 건너뛰고 다시 받아 둔다.
 *
 * 사파리(WebKit)는 받지 못한 묶음을 메모리 캐시에 남겨 두고, 새로고침한 새 문서에서도 서버에 묻지 않고
 * 그 실패를 그대로 쓴다(서버가 첫 요청에만 500을 준 경우에도 같다). 새로고침만 하면
 * 그 탭에서는 화면이 영영 안 열린다. 같은 주소를 fetch로 새로 받으면 캐시가 바뀌어 다음 문서가 정상으로 불러온다.
 * 크롬은 실패를 문서 안에서만 기억해 새로고침만으로 풀리므로, 한 번 더 받는 건 무해하다.
 *
 * API가 아니라 정적 파일이라 client.ts를 거치지 않는다 — 앱에서 fetch를 쓰는 두 번째 자리다.
 */
export async function reloadPage(): Promise<void> {
  await Promise.all(
    [...failedAssets].map((url) =>
      fetch(url, { cache: 'reload', signal: AbortSignal.timeout(REFETCH_TIMEOUT) })
        // 다시 받기도 실패하면 새로고침한 문서가 오류 화면에서 멈춘다. 새로고침은 그대로 한다
        .catch(() => undefined),
    ),
  )
  window.location.reload()
}
