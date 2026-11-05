# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

JUBY 프론트엔드(React 19 + TypeScript + Vite + CSS Modules) 작업 안내다. 소개·실행법·화면 주소·배포는 [README.md](README.md)에 있다. 먼저 읽는다.
이 문서는 여러 파일을 읽어야 보이는 구조와 지킬 규칙만 적는다. 알고도 남겨 둔 문제와 결정을 기다리는 일은 [docs/남은-일.md](docs/남은-일.md)에 있다 — **고치기 전에 먼저 본다.**
지난 결정과 결과 보고서는 `docs/`와 git 기록에 있다.

**작업은 이 저장소(`JUBYInvest/JUBY-FE`)에서 한다.** 개인 저장소 `yeopkwang/juby-fe-personal`에는 더 올리지 않는다.

## 지킬 것

- **증권사(KIS) 경로를 실제로 부르지 않는다 — 검증할 때도.** 실제 백엔드로 보내도 되는 건 `GET /v3/api-docs`뿐이고 예외는 사용자가 그때 시킨 것뿐이다.
  앱도 증권사로 가는 요청을 미리 부르지 않는다 — 새 요청은 아래 "증권사 호출" 표에 자리를 정한다.
- **`package.json`에 의존성을 넣지 않는다**(테스트 러너도 먼저 묻는다). `katex`는 `rehype-katex`가 쓰는 판(0.16)과 맞춘다. Playwright는 `judge/package.json`에만 있다.
- 손대지 않는다: 사용설명서 글(`src/content/guide/*.md` — 받은 그대로 두고 어긋난 곳은 알리기만), `feat/backtest-strategy-cards` 브랜치, `docs/남은-일.md`의 "결정이 먼저 필요한 것".
- **`fetch`는 `src/api/client.ts`에서만 쓴다**(예외 `api/realtime.ts`의 SSE, `utils/reloadPage.ts`의 화면 묶음). 화면은 `src/api/*.ts`만 부른다.
- **색 리터럴(`#hex`·`rgb()`)은 `src/index.css` 토큰 밖에 쓰지 않는다.** 모서리·그림자·글자·간격(`--space-*`)도 토큰이다(옛 px 간격은 그 화면을 다시 만질 때 옮긴다).
- **`composes`로 가져온 속성을 같은 속성으로 덮어쓰지 않는다 — 미디어 쿼리 안에서도.** 공용 모듈은 쓰는 화면 묶음마다 같이 들어와 다른 화면에 다녀오면 순서가 뒤집힌다. 바뀌는 값은 변수로 받는다.
- localStorage는 `utils/auth.ts`·`utils/cache.ts`만, 한국 시각 계산은 `utils/date.ts`만 한다.
- 서버 `message`를 화면에 쓰지 않는다. 빨강·파랑은 등락에만 쓴다. 입력칸 글자는 16px 아래로 내리지 않는다. 새 화면에는 `useDocumentTitle`을 넣는다.

## 명령어와 판정

```bash
npm run dev              # 개발 서버(vite 프록시가 /api를 백엔드로)
npm run build            # tsc -b 후 vite build
npm run lint             # oxlint (judge/도 본다)
npx tsc -b --noEmit      # 타입만
npx knip@5               # 안 쓰는 파일·내보내기(judge/는 뺀다)
```

**앱에는 테스트 러너가 없다.** `lint` + `build` + **판정(`judge/`)**으로 확인한다. 돌리는 법과 파일별 내용은 [judge/README.md](judge/README.md).

- 함수 단위는 `cd judge && node --import ./register.mjs unit.test.mjs`(`loader.mjs`가 `.ts` 원본을 읽는다). 화면은 운영 빌드 + `vite preview` + 설치된 크롬(`channel: 'chrome'`).
- `market.mjs`는 한 빌드에서 지수(A1–A11)·실시간(R1–R8)·띠 배치·입력칸 넘침(S3–S9)을 본다. 요청 순서 비교(`common.mjs`, `lib.mjs api()`)는 지수·스트림 줄을 뺀다.
  기대 순서 `judge/expect/api-order.json`·`ai-order.json`은 구조를 바꾸기 전에 적고 바꾼 뒤 견준다.
- 가짜 API는 `judge/mock.mjs`, 옵션은 `mock()` 주석에 있다(`indices`, `stream` — 연결마다 보낼 묶음, `streamStatus`, `stocksRealtime` 등).
- CI(`.github/workflows/ci.yml`): `check`(tsc·lint·build·unit) → `judge`(운영 빌드를 4251에 띄워 flow·repro·ai·market).
- 가로채기 조건은 `url.pathname.startsWith('/api/')`다(글롭은 `/src/api/*.ts`까지 잡는다). 재발급(`api.juby.store` 직행)과 다른 호스트도 막는다. **가로챈 요청 안에서 `route.fetch()`를 부르지 않는다.**
- 로그인은 JWT 모양 가짜 토큰(`tokenFor`, subject = 회원 번호)으로 흉내 낸다. 시계는 `THU_11`(목 11:00 KST)로 못박는다.
- 화면은 운영 빌드에서 잰다(StrictMode는 effect가 두 번 돈다). 미리보기는 `node node_modules/vite/bin/vite.js preview`로 띄운다.
- **버그 수정**: ① 고치기 전 빌드에서 판정이 실패하는지 본다(재현 안 되면 고치지 않는다) ② 고친다 ③ 통과 ④ 고친 파일만 되돌려(`git stash push -u -- 파일들`) 다시 실패하는지 본다
  (안 돌아가면 판정이 무효) ⑤ 복구 후 lint·tsc·build. **새 기능**은 바꾸기 전 코드에서 새 판정이 실패하는 걸 본 뒤 만들고 기존 판정을 모두 돌린다.
- 로딩은 `domcontentloaded`·`document.fonts.ready` 뒤에 잰다. `fill()`은 잠김을 가리고 `maxLength`를 지킨다. 판정이 도는 동안 소스를 고치지 않는다.

## 구조

### 엔트리·라우팅·오류 경계

- `index.html` → `main.tsx` → `App.tsx`(`BrowserRouter`) 하나. 화면은 `lazy` + `trackRouteChunk`이고 마이페이지 넷(`pages/mypageBundle.ts`)·커뮤니티 셋(`pages/communityBundle.ts`)은 한 묶음이다.
- 화면 전환(`utils/motion.ts PAGE_MOTION`)은 `main` 하나에 Web Animations로 건다 — `key`로 걸면 종목만 바뀔 때 상태가 날아간다. 뒤로·앞으로·움직임 줄이기엔 걸지 않는다.
- `<ErrorBoundary resetKey={pathname}>`가 `Suspense`를 감싸고 **머리글과 지수 띠는 경계 밖**이다(띠는 `<SectionBoundary quiet>`). 다시 시도·새로고침은 `reloadPage()` 한 곳이다
  (사파리는 못 받은 묶음을 캐시에 남기므로 `cache: 'reload'`로 다시 받은 뒤 새로고침한다).
- `SectionBoundary`는 자식이 **그리다 난** 오류만 받는다. 대상이 바뀌면 `resetKey`를 주고, 다시 시도는 받아 둔 값을 버린 뒤 새로 받는다. 비동기·통신 실패는 각 화면 몫이다.
- "본문으로 건너뛰기"는 `main`에 포커스를 준다(`href="#main"`은 홈 되살리기를 깬다).

### API 계층(`src/api/client.ts`)

- `get`·`post`·`patch`·`remove`가 `{ isSuccess, code, message, result }`를 벗긴다. 실패는 `ApiError`(`status`·`code`·`message`), 망 끊김·시간 초과는 `Error`다.
- **응답 거르기**: `*Response`는 필드를 `?: T | null`로 적고 화면 타입으로 옮기는 자리에서 **전부** 거른다(숫자 `finiteOrNull()`, 문자열 `typeof`, 빌 수 있는 칸은 화면 타입도 `| null`).
  화면이 반드시 쓰는 값이 비면 `malformedResponse()`로 던진다. 목록 한 행의 빈 값은 막지 않는다(포맷 함수가 "-"). 서버 `YYYY-MM-DD`는 여기서 `fromDashedYmd()`로 바꾼다.
- 기본 12초에 끊고, 연달아 두 번 무응답이면 차단기가 15초 동안 모두 실패시킨다. 없어도 되는 요청은 짧게 끊고 `countsTowardBreaker: false`.
  **AI 질문만 제한 시간이 없다**(`timeoutMs: null`, "그만 기다리기"가 `AbortController`로 끊는다).
- **401**: 토큰을 실은 요청이면 재발급(`POST /api/auth/reissue` — `API_ORIGIN`을 곧장 `credentials: 'include'`로) 후 한 번 다시 보낸다. 동시 401도 재발급은 한 번이다.
  실패하면 토큰을 지우고 `/login?next=`로 보낸다(이미 `/login`이거나 토큰 없던 요청은 빼고). `{ ignoreUnauthorized: true }`면 이동하지 않는다.
- **공개 화면(백테스트·AI·상세)이 들어오자마자 부르는 요청은 `ignoreUnauthorized`로 보내고 401이면 토큰만 지운다**(`member.ts onPublicPage`). 사용자가 한 동작의 401은 전역 처리대로다.
- `API_DISABLED`는 모든 요청을 끊는 비상 스위치다(지금 꺼짐).
- **같이 쓰는 조회**(`api/memo.ts`): `shared(key, maxAge, load)`가 같은 요청을 하나만 보낸다. 시세표(`stocks`)·관심종목(`likes`·`likes-public`)·성향(`personality`·`personality-public`)·
  회원 정보(`member`)를 1분 같이 쓴다. 열쇠는 `memberKey(name)`로 계정을 붙여 로그인이 바뀌면 따로 받는다. 하트 등록·해제, 내 정보 수정, 성향 검사 제출 뒤 `forget(...names)`로 지운다.
- 같은 탭 메모는 상세 1분, 뉴스 10분. **다시 시도는 캐시를 건너뛴다**(`{ fresh: true }`, 그 한 번만).
- **늦은 응답**: effect의 `isStale`을 `.then`·`.catch` 안에서 본다. 버튼이 거는 요청은 번호 ref로 견주고 **화면을 바꾸는 쪽도 번호를 올린다.** 다시 부르기는 `retryCount` 같은 상태로.

### 실시간 시세(`src/api/realtime.ts`)

- 앱 전체가 SSE `GET /api/stream/prices` 연결 하나를 같이 쓴다(연결 직후 전체, 그 뒤 1초마다 바뀐 것만).
  이벤트 `prices`: `{ stockCode, currentPrice, changeRate, accTradingValue, contractTime }[]`, `indices`: `{ code, name, currentIndex, changeRate }[]`.
- 로그인 없이 열리는 공개 경로라 토큰을 싣지 않는다(끊기를 쓰려고 EventSource 대신 fetch로 읽는다). **장중(`isMarketHours`)·탭이 보일 때·값을 쓰는 화면이 있을 때만 연결한다.**
  정상 종료 뒤 1초에 다시 붙고 실패는 늘려 가며 기다린다.
- 훅: `useRealtime()`, `withLivePrice(row, prices)`, `useLiveRows(rows, sortKey, sort)` — **줄 순서는 받거나 정렬을 바꿀 때만 정하고 값만 실시간으로 바뀐다.**
- REST의 실시간 필드: `/api/stocks`의 `asOf`와 행마다 `realtime`(장중엔 종가 자리에 현재가), 관심종목 행 `realtime`. 가격 옆 기준 글은 `utils/priceBasis.ts basisLabel()` 하나로 적는다 —
  "실시간" / "11월 5일 11:02 기준" / "장중 현재가" / "10월 28일 종가 기준"(날짜를 모르면 "" → 줄을 숨긴다). 상세 머리 가격도 같은 말을 쓴다.

### 증권사(KIS) 호출

호출 제한이 빡빡하다. **사용자가 누르지 않은 증권사 호출은 서버에 토큰이 있을 때만 쓴다**(`canSpendKisCall` — 6시간 안에 토큰을 심었거나, 토큰이 끝나 있을 때
(`kisTokenLikelyExpired`: 토 15:45~월 16:05, 평일 15:45~16:05)가 아니고 30분 안에 서버 오류(`kisLimitedAt`)가 없을 때).

| 요청 | 증권사 | 언제 |
| --- | --- | --- |
| `GET /api/stocks` 시세표 | 0(DB, 장중엔 서버의 실시간 값) | 화면 여럿이 1분 같이 쓴다 |
| `/api/stocks/leading-stocks`·`/api/stream/prices` | 0 | 홈 카드 종목(DB 배치)·실시간 |
| `GET /api/stocks/{code}?period=ALL` 상세 | 1 | 기간 탭은 화면에서 자른다(`periodStart`) |
| `?period=ONE_YEAR` 홈 카드 그래프 | 담아 둔 게 없는 카드만 | 토큰을 심었거나 `canSpendKisCall`일 때(`api/cardSeries.ts`) |
| `GET /api/market/{code}/price` 토큰 심기(임시) | 1 | 로그인 때 홈·상세에서 6시간에 1회(`primeKisToken`) |
| `GET /api/market-indices` 지수 띠 | 장 밖 값은 서버가 증권사(1분 캐시) | 처음 + 실시간이 없을 때 장중 1분마다(값이 없으면 장 밖에도). 장 밖에 `canSpendKisCall`이 아니면 지난 값(없으면 묻는다) |
| `GET /api/market/holiday` 휴장일 | 1("하루 한 번" API) | 받아 둔 날짜가 오늘과 다음 개장일을 못 덮을 때(로그인) |
| `GET /api/market/volume-rank` 순위 | 1 | 홈 순위 탭을 열 때만(1분 메모, 로그인) |
| `GET /api/market/{code}/daily_itemchartprice` | 1(모의투자 토큰) | 로그인했고 상세가 실패했을 때 그 종목만 |

- **상세 실패 대응(임시 — 백엔드가 고치면 걷는다)**: 처음엔 곧바로 보낸다. 5xx·무응답이면 1.5초 뒤 한 번, 또 실패하면 마지막으로 보낸 때에서 65초(`DETAIL_GAP_MS`) 뒤 한 번 더
  (남은 초를 센다). 4xx·모양이 틀린 200은 다시 부르지 않는다. 걷을 곳은 `api/stock.ts`의 세 장치와 `StockChartPage`의 `waiting`이다.
- 뉴스 `GET /api/stocks/{code}/news`(Pinecone)도 미리 부르지 않는다. 10건씩 받아 6건씩 펼치고(`NEWS_STEP`) 다 편 뒤 다음 쪽을 묻는다.
- 검색은 `api/stockList.ts` 사본으로 먼저 보이고 250ms 멈추면 `GET /api/stocks/search` 결과를 **합친다**(서버는 종목명만 찾는다).

### 로그인 상태·저장소·날짜

- 화면은 `useIsLoggedIn()`으로 구독한다(다른 탭은 `storage` 이벤트). **`MypageLayout`만 일부러 구독하지 않는다**(탈퇴의 홈 이동과 싸운다). `client.ts`는 `utils/navigation.ts goTo()`로 이동한다.
- 로그인으로 보낼 땐 `loginPathFrom()`. 돌아갈 자리는 sessionStorage에 적어 콜백이 꺼내고, `toReturnPath`가 사이트 안 경로만 받는다.
  콜백은 한 번만 처리하고 `onboarded`가 `false`면 `/personality-test?next=`로 보낸다(`checkAfterLogin`).
- `logout()`은 이동하지 않는다(`hooks/useLogout`이 홈으로). 계정에 딸린 값 지우기는 `api/auth.ts clearSession` 한 곳이고 탈퇴도 부른다.
- `utils/auth.ts`(`accessToken`): 저장소가 막히면(속성 접근에서 SecurityError) 모듈 안 `Map`에 둔다 — 흘리면 머리글이 렌더 중에 던져 흰 화면이 된다. `toUsableToken`이 빈 값·`"null"`을 거른다.
  `getAccountId()`는 JWT subject(회원 번호)를 읽는다(서명은 보지 않는다).
- `utils/cache.ts`: 실패·틀린 모양은 없는 셈 치고 **읽는 쪽이 모양까지 검사한다.** TTL `leadingStocks`·`marketIndices.v2`, JSON `cardSeriesYear`·`recentBacktests`(주인 + 10줄,
  로그아웃·탈퇴 때 비움)·`startStepsDone`·`marketCalendar`·`recentStocks`(로그아웃해도 둠)·`lastLoginProvider`(탈퇴 때 지움), 때 한 칸 `stockDetailSentAt`·`kisToken*`·`kisLimitedAt` 등.
- 날짜는 `YYYYMMDD` 문자열이다(사전순 = 날짜순). 화면은 하이픈을 모르고 차트만 `toDashedYmd()`. 서버 시각 글자는 `fromKstDateTime()`. 날짜 함수는 빈 값에 ""를 주고 부르는 쪽은 그 줄을 숨긴다.

## 화면별 규칙

### 홈

- 넓은 화면: 왼쪽 검색 → 테마별 대표 종목 → 현재 주가 보기, 오른쪽 열(`HomeRail`: 처음 시작하기 또는 사용설명서 칸 → 전체 채팅 `HomeChat`)이 왼쪽 세 줄을 subgrid로 나눠 선을 맞춘다.
- **1100px 이하(한 열)**: 검색 → 테마별 대표 종목 → 현재 주가 보기(10행 + "종목 더 보기" 단추 — 저절로 늘지 않는다) → 처음 시작하기 → 채팅.
  DOM도 이 순서라(오른쪽 열이 시세표 뒤) Tab·읽어 주는 순서가 보이는 순서와 같다. 넓은 화면은 목록 끝이 보이면 20행씩 더 보인다(`IntersectionObserver`).
  600px 이하 처음 시작하기는 마친 단계를 접는다.
- 시세표는 거래대금 내림차순으로 시작하고 정렬 기준을 글로 적는다(`describeSort`). 탭은 전체 종목(DB) | 실시간 거래대금 순위(`VolumeRank`, 종목코드가 없어 이름으로 잇는다).
  머리글과 행이 따로 된 격자라 칸 폭·안 여백을 같이 둔다.
- **뒤로·앞으로 돌아오면 정렬·행 수·스크롤·탭을 되살린다**(`savedViews`, `location.key`별 메모리, 목록이 온 뒤 `useLayoutEffect`에서). 링크로 오면 처음부터다.
- **테마별 대표 종목**은 백엔드가 정해 둔 셋이다(전략 결과로 고른 게 아니므로 전략 이름·수익률을 적지 않는다). 칸은 종가·전일 대비 + 1년 그래프(`CardChart` SVG) +
  "1년 전보다 ±x%". 그래프를 못 그리면 "–"와 안내 — 그 자리에 다른 숫자를 넣지 않는다. 못 받으면 `FALLBACK_THEMES`.
- **처음 시작하기**(`StartSteps`): 로그인 → 성향 테스트 → 관심종목 담기 → 첫 백테스트. 다 마친 계정은 다음부터 사용설명서 칸(`startStepsDone`, 글은 `src/content/homeGuide.ts`).

### 종목 상세

- **기다림을 줄인다**: 홈·관심종목이 한가할 때 상세 묶음을 미리 받는다(`preloadStockChartPage`, lazy는 반드시 `loadStockChartPage`). 링크는 `toPreviewState`·`toQuotePreviewState`로
  이름·종가·기준일을 싣고 상세는 `readPreview()`로 흐리게 "N월 N일 종가"를 먼저 그린다. 오는 중인 자리는 "-"가 아니라 같은 크기의 뼈대다.
- 형식이 틀린 종목코드는 **렌더에서** `isStockCode()`로 막는다(effect면 뉴스 요청이 먼저 나간다).
- 배치: 머리 띠(이름·가격 | 관심종목·이 종목 백테스트·AI에게 물어보기) + 먹 선, 1600px 이상 정보 | 차트 | 뉴스, 1101~1599px 뉴스가 아래, 1100px 이하 쌓는다.
  정보 열은 시세 요약(마지막 거래일 시·고·저·거래량)과 기간별 주가 변화(`PeriodStats`, 받은 일봉으로 계산)다.
- 관심종목 토글은 로그인했으면 관심종목 목록으로 처음 상태를 정하고 받는 중·못 받음은 잠근다. 바로 가기 단추는 비로그인이면 "로그인 필요" 배지 + 로그인으로 보낸다.
- **종목 넘기기는 `<Link state={toStockHandoff(종목)}>`, 받는 화면이 `useStockHandoff()`로 한 번 읽고 `replace`로 state를 비운다**(새로고침·뒤로 가기에 다시 돌지 않게).
- 임시 차트(`BackupChart`)는 로그인했고 상세가 실패하면 그린다. 날짜·가격이 틀린 봉은 뺀다. 차트 아래 TradingView 출처 링크(`.credit`)는 라이선스 요건이라 지우지 않는다. 캔버스 색은 `utils/cssToken.ts`로 읽는다.
- 뉴스 "더 보기"는 거르기 전 받은 개수 누계(`receivedCount`)로 판단한다. "기사 검색하기"(`NewsAsk`)는 누를 때만 보낸다.

### 관심종목(`/likes`)

- 요청은 관심종목 목록(공용 조회) + 고른 종목 하나의 뉴스(`GET /api/news`) 1건, 증권사 0건이다. 비로그인은 요청 없이 로그인 안내다.
- 넓은 화면은 왼쪽 지도(sticky) | 오른쪽 담은 종목·뉴스, 1100px 이하 쌓는다. 지도는 크기 = 거래대금(빈 값도 4%), 색 = 등락률(`--color-heat-*`), `utils/treemap.ts`.
- 담은 종목은 `sortBy`로 정렬하고 값은 `useLiveRows`·`basisLabel`로 적는다. 하트 해제는 먼저 빼고 실패하면 다시 받아 되돌린다.

### 주식 백테스트

- **1200px 이상 세 열**: 왼쪽 전략 카드(`components/backtest/StrategyPicker.tsx`) | 가운데 입력·결과(760px) | 오른쪽 도움말(`BacktestHelp` — 지금 단계 글만, 사용설명서 3장에서
  `utils/guideExcerpt`로 떼어 온다). 1199px 이하 두 열(가운데 | 도움말), 900px 이하 한 열.
- **전략을 고르는 곳은 카드 하나뿐이다**(넓은 화면은 왼쪽 열, 좁은 화면은 입력 ②칸). 넓은 화면의 ②칸은 고른 전략을 되짚는 글이다. 성향 안내의 단추는 "성향 다시 검사".
- 성향 → 전략은 1:1(요청에 전략 필드가 없다). 로그인하면 성향에 맞는 전략을 미리 고르고, 로그아웃하면 그 추천 그대로일 때만 거둔다.
- 결과는 프리셋이 먼저다(AI 답변이 프리셋을 읽는다). `BACKTEST404_5`면 즉석 실행 `/api/backtest/run`, `404_6`·`404_4`는 "일봉이 모자라요". 기간은 `/preset/options` ∩ `utils/backtest.ts`.
  같은 조합은 화면에 있는 동안 한 번만 받는다(`loadPreset`). 상세에서 오면 종목·추천 전략·1년이 채워진 순간 한 번 실행한다(`autoRunRef`).
- 화면 점수가 같으면 공동 1위, 일부를 못 받으면 "불러온 N개 성향 중에서". 적합도(`scoreVerdict`)는 화면에 적는 값으로 가른다.
- **종목명 바로 뒤에 받침 따라 바뀌는 조사(은·는·이·가)를 두지 않는다.**
- 백엔드 값 메우기(고쳐지면 지운다): 축별 점수는 `calculateAxisScores()`로 되계산하고, 거래 0회인데 낙폭·변동성이 있으면 끝까지 보유한 것이라 보유 안내를 띄운다(`isHeldToEnd`).
- 결과 아래에서 상세·AI·관심종목 담기(`LikeAddButton`, 409는 "이미 관심종목에 있어요")로 잇고, 결과를 받으면 최근 본 백테스트에 적는다.

### AI 주가분석

- 구조: `pages/AiPage.tsx`(넘어온 것 처리) + `hooks/useChatRooms`(목록) + `hooks/useConversation`(말풍선·보내기), 부품 `components/ai/ChatPane`·`ChatEmptyState`·`Composer`.
  **훅 순서가 요청 순서다**(목록을 성향보다 먼저 — `expect/ai-order.json`).
- **첫 화면**(`ChatEmptyState`): 왼쪽 맞춘 한 열(600px) — 제목 "이렇게 물으면 이렇게 답해요" → 성향 한 줄("지금 투자성향은 ○○이에요" + "성향 다시 검사") →
  첫 예시를 대화와 같은 말풍선 한 쌍(질문 진한 면 오른쪽, 답 옅은 면 — 답은 내 성향으로) → "이런 것도 물어볼 수 있어요" 질문 줄 셋(끝 화살표 = 입력칸에 넣기).
  질문은 사용설명서 4장 사례의 것, 답은 그 사례의 답이나 챗봇이 보는 것이다 — 지어낸 주가 숫자를 적지 않는다. 누르면 입력칸에 채우기만 한다. 글은 모두 '해요'체(judge ai A19).
- 새 대화는 첫 질문 때 `POST /api/chat-sessions`로 방부터 만들고 그 번호로 묻는다(번호를 실어야 앞 대화가 맥락이 된다). 409 `CHAT409_1`은 "앞 질문의 답을 아직 만들고 있어요",
  404·403 방은 목록에서 빼고 새 대화로, 404 `MEMBER404_2`는 성향 검사 안내. 답이 오면 목록은 제목이 '새 대화'일 때만 다시 받는다.
- **다시 시도와 그만 기다린 방에 새로 보내기는 방을 먼저 다시 받는다**(끝난 답을 살리고 두 번 저장하지 않게). 목록·방을 받는 중이거나 못 불러온 화면에서는 보내지 않는다.
- **질문에 종목명을 싣지 않는다**(서버가 찾는다). 예외는 상세의 'AI에게 물어보기' 첫 질문 하나(`handoffAskRef`).
- 방 이름 바꾸기·지우기는 '⋯'에서 그 줄 아래에 펼친다. **900px 이하 이전 대화는 왼쪽 날개다**(`SessionSidebar`, 닫히면 `inert`, z-index 91 — 띠 위, 모달 아래).
- 답변(`MarkdownAnswer`)은 마크다운·표·수식으로 그리고 HTML·이미지는 그리지 않는다. 수식은 `$$`만 읽고 `\(`·`$x$`는 `normalizeMath`가 먼저 바꾼다.
  렌더러는 따로 묶고(`loadMarkdownAnswer` — 화살표 함수라야 knip이 따라간다) 받는 동안은 `PlainAnswer`다.

### 마이페이지

- 한눈에 보기(`/mypage`)·투자유형 보기·내 정보 확인. 로그인 안 했으면 `MypageLayout`이 렌더 전에 로그인으로 보낸다.
- **900px 이하 메뉴**는 `MypageLayout.tsx`가 `useMediaQuery`로 공용 `tabs.module.css`의 `tab`·`tabActive`를 그대로 쓴다(값을 베껴 적지 않는다). 폭이 모자라면 탭 줄만 옆으로 밀리고
  로그아웃(13px 글자 단추)은 오른쪽 끝에 남는다. 넓은 화면 메뉴는 `sideList.module.css` 줄이다.
- 한눈에 보기는 칸마다 따로 받고 따로 실패한다(`useLoad`). **최근 본 백테스트는 이 브라우저에만 있다**(서버가 결과를 저장하지 않는다).
- 넘겨주기 state(`hooks/useStockHandoff.ts`): 종목, 백테스트 조건(`plan`), 대화방(`openSession`), 커뮤니티 글.
- **검사 없이 성향을 바꾸는 저장 단추는 없다**(다섯 성향 둘러보기만). 내 정보 수정은 바꾼 것만 보내고(이름이 그대로면 `name: null`) 생일은 지울 수 없다.

### 사용설명서

- 장 더하기: `src/content/guide/<id>.md` + `guide/index.ts GUIDE_CHAPTERS`의 `markdown`·`action`. 글이 있는 첫 장이 `/guide`다.
- 받은 글에서 바꾸는 건 그림 주소·대체 글·노션 이름 줄뿐이다. 그림은 `public/guide/<id>/`에 무손실 WebP로 두고 크기를 `GUIDE_IMAGE_SIZES`에 적는다.
- 1200px 이상 장 목록 | 본문(760px) | "이 장에서". **본문 글 안에는 굵은 먹 선이 없다.** 제목 단계는 다시 매긴다(`readGuideDocument`).
- 꼭지로 옮길 때 주소는 바꾸지 않고, 꼭지 주소(`/guide/backtest#backtest-1`)로 오면 그 꼭지에서 시작한다. 판정 `guide.mjs`는 기대값을 글 파일에서 짓는다.

### 커뮤니티

- 백엔드 `/api/community/**`(`src/api/community.ts`). 글 조회(목록·인기·상세·종목 카드)는 로그인 없이 되고(`ignoreUnauthorized`), 토큰을 실으면
  `likedByMe`·`isMine`이 채워진다. **댓글은 보기도 로그인**이라 비로그인은 부르지 않고 "로그인하고 댓글 보기"를 둔다.
- 목록: 종목 카드 줄(`GET /api/community/stocks` — 전체 글 수 + 글 많은 종목 열 개, 아래에 `priceAsOf` "○월 ○일 HH:MM 기준 등락률이에요"),
  최신(`/posts`, `cursor`)·인기(`/posts/popular`, 이번 주 좋아요 순 — `cursorLikeCount`·`cursorId`는 늘 함께) 20개씩 "글 더 보기". 카드를 누르면 `stockCode`를 붙여 다시 받는다.
  **머리에 먹 선이 없고 최신·인기가 알약인 것은 이 화면만의 예외다.** 앞·뒤 단추는 마우스 화면에서만. 손가락 화면은 당겨서 새로고침.
- 글 줄은 어디를 눌러도 글 상세다(`a11y.module.css rowLink`). 상세 응답에는 등락률이 없어 목록 글을 실어 간다(`toCommunityHandoff`). 좋아요는 상세에서 누르는 토글(응답의 `liked`·`likeCount`로 바꾼다).
- **쓰기 전 확인은 `hooks/useWriteGate`**: 비로그인 → 로그인 안내, 닉네임(`/api/members/me`의 `nickname`)이 없으면 `NicknameModal`(형식 → `/nickname/check` → `PATCH /me/nickname`).
  서버가 403 `COMMUNITY403_1`을 주면 닉네임 창을 다시 연다. 좋아요는 로그인만 본다.
- 글쓰기 `/community/write`(종목은 고르지 않아도 된다 — 없으면 `stockCode` 칸을 뺀다, `""`는 400), 고치기 `/community/{id}/edit`(제목·내용만, 내 글만). 수정·삭제 단추는 `isMine`일 때만.
  올리면 그 글 상세로 간다. 지운 글·없는 글(404 `COMMUNITY404_1`)은 "삭제된 게시물이에요". 서버 `message`는 쓰지 않고 길이 규칙(제목 40·내용 1,000·댓글 500)을 고정 문구로 적는다.
- 떠 있는 "글쓰기"·올리기 줄은 `--index-bar-height` + `env(safe-area-inset-bottom)` 위다.

### 홈 전체 채팅(`components/HomeChat`)

- 채팅 서버가 아직 없어 목업이다(`src/api/chat.ts` 한 파일 — `loadChatHistory`·`connectChat`의 모양을 두고 속만 바꾼다, 예시 대화는 `src/content/chatPreview.ts`).
  예시 말이 몇십 초마다 들어오고, 보낸 말은 그 화면에만 붙는다. 칸 제목 옆 "예시"와 아래 안내 한 줄로 밝힌다.
- 누구나 읽고 로그인하면 말한다(보내는 이름은 닉네임 → 이름 → "나"). 대화창 안에서만 내리고, 맨 아래를 보는 중일 때만 새 말을 따라 내린다. 내 말은 오른쪽.
- 시각은 이름 줄에(말풍선 옆이 아니라 — 오른쪽 열이 320px 남짓이라 말풍선이 꺾인다). 같은 사람이 3분 안에 이어 말하면 이름·시각을 한 번만 적는다.
  대화창 위아래 여백은 `mask-image`로 흐려 먹 선에 잘린 말이 깨져 보이지 않게 한다(judge community C5).

### 아래 지수 띠(`components/MarketIndexBar`)

- `GET /api/market-indices` → `{ asOf, indices: [{ code, name, currentIndex, changeRate, accTradingValue, realtime }] }`. 포인트 대비는 없다 — 띠는 지수와 대비율만 적는다.
- `Layout`에 한 번 놓인다. **지수·실시간은 로그인 없이 열린다**(JUBY-BE dc44e2b — judge market A9). 처음 한 번, 그리고 실시간 연결이 없을 때
  장중·탭이 보일 때 1분마다 묻는다(5초, 차단기에 세지 않는다). 값이 없으면 장 밖에도 1분마다 묻고, 로그인해도 다시 묻지 않는다(휴장일만 받는다).
  `canSpendKisCall`이 아니어도 지난 값이 없으면 묻는다(judge market A10·A11).
  **장중엔 실시간 값으로 바꾸고 기준 자리에 "실시간"**, 아니면 `asOf`로 "N월 N일 HH:MM 기준". 못 받으면 지난 값(`marketIndices.v2`), 없으면 띠가 없다.
- 장 상태·진행 막대(`marketStatus`·`sessionClock`)는 휴장일을 모르면 주말만 휴장으로 보고 평일엔 상태를 적지 않는다. 장 시간은 9:00~15:30 고정(`isMarketHours`는 15:35까지).
- `position: sticky; bottom: 0`, `z-index: 5`. 높이는 `--index-bar-height`(44px, 600px 이하 40px, 띠가 없으면 `:root:not(:has([data-index-bar]))`로 0) — 띠 위에 뜨는 것이 쓴다.
- 좁은 폭에서는 1100px 이하 다음 개장일·남은 시간, 900px 이하 막대, 600px 이하 장 상태·기준 시각을 뺀다.

## 디자인 규칙

- **흰 바탕 하나, 상자 대신 기준선.** 구역은 제목 줄 아래 **굵은 먹 선**(`2px solid var(--color-rule)`)으로 열고 줄 사이는 가는 선(`--color-border`)이다.
  묶어 보여야 하는 안내·결론·실패는 옅은 면(`--color-bg-sub`). 테두리는 입력칸(1.5px)·단추·스크롤 대화창·떠 있는 층에만, 그림자는 떠 있는 층의 `--shadow-pop` 하나다.
  판 안에 상자를 두지 않고, 큰 % + 작은 라벨 타일을 만들지 않는다.
- **위계는 세 단계다**: 화면 제목 28px(900px 이하 24px) + 먹 선 > 구역 제목 20px(46px 줄 + 먹 선) > 칸 안 작은 제목 16~18px. **아래 단계가 위보다 크거나 같지 않다.**
  굵은 먹 선은 화면 제목·구역 제목 아래에만(예외: 상세 세 칸 머리). 화면 제목은 모든 화면에서 같은 높이다 — 제목 위에 여백을 더하지 않는다.
- **글자**: 작은 글자는 네 단계 — xs 12(시각·출처·배지), sm 13(보조 설명), md 14(화면 글자: 목록·탭·단추), lg 16(읽는 글). 굵기는 400·600·700 셋. 숫자 칸은 `tabular-nums`.
  글꼴은 Pretendard와 Michroma(`--font-wide`, 로고와 32px 이상 숫자만). 서버 자유 글은 `overflow-wrap: anywhere`. 모서리는 `--radius-sm`·`md`·`lg`와 알약·원뿐이다.
- **색 쓰임**: 브랜드 초록은 행동·선택·활성에만(넓게는 머리글 띠·지수 띠뿐), 흰 글자를 얹는 초록은 700 이상. **초록을 등락의 뜻으로 쓰지 않는다.**
  빨강·파랑은 등락 전용이다(그림 `--color-up`·`--color-down`, 글자 `-text`, 진한 띠 위 `-on-dark`) — 단추·링크·탭·하트·경고에 쓰지 않는다. 보합·고가·저가는 무색,
  실패·경고는 본문색. 등락 판정은 `utils/format rateTone` 하나로 한다.
- **공용 모듈**(`composes`): `components/section.module.css`(`pageTitle`·`head`·`title`·`note`·`more`), `tabs.module.css`, `skeleton.module.css`, `buttons.module.css`,
  `sideList.module.css`, `a11y.module.css`(`srOnly`·`rowLink`). 바뀌는 값은 변수다(`--tab-*`·`--tabs-margin-left`, `--section-head-height`, `--button-height`·`--button-padding-x`).
  **등락 글자색(`.up`·`.down`·`.flat`)은 공용 모듈로 모으지 않는다**(함께 붙는 색 클래스와 순서가 뒤집힌다).
- **밑줄 탭**: 고른 것은 먹 글자 + 아래 2px 브랜드 막대, 클래스 `tabActive`로 그린다. 알약·채운 탭은 쓰지 않는다(예외 커뮤니티). 제목 줄 오른쪽 탭은 제목 `flex-grow: 1` +
  `--tabs-margin-left: 0`(내려가면 왼쪽부터 선다). **막대는 놓인 선을 그 두께만큼 덮는다**(`--tab-bar-offset` 가는 선 -1px 기본, 굵은 먹 선 머리 안 -2px) —
  선 바로 위에 얹으면 막대와 선이 두 줄로 겹쳐 보인다(judge consistency C9).
- **단추는 세 종류뿐이다**: primary(주 행동), secondary(흰 바탕 + 먹 테두리), ghost. 높이 md 40px·lg 48px(600px 이하 md 44px). 화면 CSS는 자리만 정하고
  색·테두리·높이·`display`·`padding`·`gap`을 덮어쓰지 않는다. 한 요소에 두 종류를 달지 않는다. 되돌릴 수 없는 확정은 primary, 취소는 secondary.
  제목 줄·줄 끝 글자 동작("+ 새 대화"·"새 글 N")은 상자 없는 초록 굵은 글자다. 카카오만 회사 색이다(가입 경로는 `utils/social.ts SOCIAL_PROVIDERS` 한 표).
- 기다리는 표시는 셋: 크기를 아는 자리는 뼈대, 글 한 줄 자리는 `Spinner`, 화면 묶음은 머리글 아래 줄.
- **나란한 두 열의 선은 같은 높이이거나 확실히 떨어져 있다**(홈 subgrid, 백테스트 '전략 고르기' = '도움말' 먹 선, 마이페이지, 사용설명서 — `lines.mjs`).
  글 길이에 따라 선이 움직이는 열은 선 대신 여백으로 나눈다.
- 머리글 메뉴 링크는 줄지 않고(`flex-shrink: 0`) 넘치면 메뉴 줄 안에서만 민다. 두 곳 이상에 그리면 부품 하나로 둔다(`NewsCard`·`GuideSteps`·`HeartIcon`·`LoginModal` — 비로그인이 하트를 누르면 홈·상세가 같이 쓴다). 고치기 쉬운 글은 `src/content/`.
- `Modal`: 포커스는 상자 자체, 닫으면 연 단추로. `onClose`는 ref에 담는다(의존성에 넣으면 칠 때마다 포커스가 튄다). 배경은 배경에서 누르기 시작했을 때만 닫는다.
- **휴대폰**: 320px까지 가로 넘침이 없다. 누르는 넓이 44px(데스크톱 40px) — 여백 + 음수 margin이나 투명 `::after`(스크롤 상자 안에서는 잘리니 칸을 키운다).
  입력칸 안내 글은 한 줄 말줄임. 한 열 격자는 `minmax(0, 1fr)`. 대화창 높이는 `dvh`.
  **flex로 늘리는 입력칸은 `width: 0`**(기본 폭 = 글자 20개 × 글꼴 평균 폭이 부모의 최소 폭이 된다 — 리눅스 한글 글꼴에서 홈 오른쪽 열이 넘쳤다, judge market S9).

## 예외 처리 규칙

- 목록 행은 종목코드가 없거나 틀리면 빼고(콘솔에 개수), 이름이 비면 종목코드로 적는다(`nameOrCode`).
- **포맷 함수(`utils/format.ts`)는 유한한 숫자가 아니면 "-"다**(`toPercent(null)`도 "0.00%"가 아니다).
- **정렬은 빈 값을 방향과 상관없이 맨 뒤로 보낸다** — `sortStocks`·`sortBy`. 비교식을 따로 쓰지 않는다.
- **실패와 빈 값은 다른 문구이고 실패에는 다시 할 수단을 준다.** 홈 카드는 실패로 비지 않는다(고정 목록). 뉴스 더 보기 실패는 받아 둔 목록을 둔다.
- **조용히 되돌리지 않는다.** 낙관적 갱신은 실패하면 되돌리고 `role="status"`로 알린다. 진행 중인 항목은 ref의 Set으로 연타를 막는다.
- 서버 `message` 대신 아는 코드만 코드별 문구(`useBacktestRun describeFailure`), 나머지는 고정 문구, 원문은 콘솔에.
- **성향 없음(404 `MEMBER404_2`)은 실패가 아니다** — `getMyPersonality()`가 `null`로 바꾼다. 실패면 검사를 권하지 않고 다시 시도만 준다(다시 검사하면 성향을 덮어쓴다).
- **성향 검사**: 저장 실패는 마지막 문항에 머물러 "다시 저장". 로그인 상태에서는 예비 문항으로 물러서지 않는다. 비로그인 예비 7문항(`MOCK_QUESTIONS`)의 결과는
  제출할 때 로그인돼 있어도 서버에 보내지 않는다.
- 서버가 준 주소로 여는 링크는 http·https만(`utils/link.ts safeLink`), 글 필드는 `textOf`로 문자열만 받는다.

## 백엔드 사정

실서버는 `https://api.juby.store`(스웨거 `/swagger-ui/index.html`). 개발 프록시·배포 중계(`vercel.json`)·소셜 로그인·재발급(`API_ORIGIN`)이 이 주소다. 백엔드가 바뀌면 이 절을 고친다.

- 인증: 성공은 `/oauth2/callback#accessToken=<AT>`(해시, 30분), 실패는 `/oauth2/error?error=<코드>`. refresh token은 HttpOnly 쿠키(`Path=/api/auth`, 재발급마다 바뀜)라
  프론트는 받지도 저장하지도 않는다. 사파리처럼 다른 사이트 쿠키를 막는 브라우저는 프론트가 `juby.store` 아래여야 재발급된다.
- **공개 경로는 `/api/stocks/**`·`/api/market-indices`·`/api/stream/**`·`/api/auth/reissue`와 커뮤니티 GET(댓글 목록 빼고)이다.**
  공개 경로에 만료된 토큰을 실어도 401이 아니다(필터가 실패를 적어 두기만 한다). 나머지는 토큰 없으면 401 `COMMON401_1`, 틀리면 `AUTH401_1~6`.
- CORS 허용 출처는 `http://localhost:5173`과 `https://juby-fe.vercel.app`이다. 로컬에서 로그인해도 돌아오는 곳은 배포 사이트다.

쓰는 API는 위 "증권사 호출" 표의 것과 백테스트(`/api/backtest/preset`·`/preset/options`·`/run`), 성향(`GET·POST /api/personality-tests`),
회원(`/api/members/me`·`/me/personality`·`/me/like-stocks`·`/me/nickname`·`/nickname/check`), 커뮤니티(`/api/community/**`), AI(`/api/chat-sessions`·`POST /api/open-ai/ask`), 뉴스 검색(`/api/news`·`/api/vectordb/search`)이다.
붙이지 않은 것: `PATCH /api/members/me/personality`(DB 행 번호만 받는다), `/api/market/{code}/daily-stock`(임시 차트와 겹친다), 관리용(`/api/initiate`·`/api/vectordb/all`·`/api/token/*`).

| 백엔드 빈틈(프론트에서 못 고친다) | 프론트가 하는 것 |
| --- | --- |
| 상세가 증권사 토큰을 읽기 전용 트랜잭션에서 저장하지 못해 주말엔 1분 1건만 성공한다 | 실패 뒤 기다림·토큰 심기·`canSpendKisCall` |
| 백테스트가 끝 포지션을 청산하지 않고 축별 점수를 주지 않는다 | `isHeldToEnd`, `calculateAxisScores` |
| 성향 변경이 DB 행 번호만 받는다 | 저장 단추 없음 |
| 이름 `@Size`가 `javax`라 돌지 않고, `null`은 "안 바꿈"이라 생일을 지울 수 없다 | 화면이 이름을 검사, 생일 지우기 막음 |
| 거래대금 순위 응답에 종목코드·등락률이 없다 | 이름으로 상세를 찾는다 |
| DB 일봉이 모의투자 시세라 실제와 다를 수 있고, 종목 뉴스에 무관한 기사가 섞인다 | 받은 대로 그린다 |
| 채팅 서버·설명서 API가 없다 | 채팅은 목업(`api/chat.ts`), 설명서 글은 `src/content/` |
