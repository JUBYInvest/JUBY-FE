# 판정 (judge/)

앱이 제대로 도는지 재는 스크립트. 2026-10-31까지는 세션 임시 폴더에 두다가(며칠 지나면 macOS가 지웠다) 사용자 결정으로 저장소에 들였다.
앱의 `package.json`과는 별개다 — 여기 `package.json`의 Playwright는 앱 번들에 들어가지 않는다.

## 준비 (한 번)

```bash
cd judge && npm install        # Playwright 1.64.1. 브라우저는 설치된 크롬을 쓴다(channel: 'chrome') — 따로 받지 않는다
```

사파리(WebKit)까지 재려면 `npx playwright install webkit`(`~/Library/Caches/ms-playwright`). `quick.mjs`의 `webkit` 묶음만 쓴다.

## 돌리는 법

화면 판정은 **운영 빌드**에서 잰다(개발 서버는 StrictMode라 요청 수가 틀린다).

```bash
npm run build && node node_modules/vite/bin/vite.js preview --port 4198 --strictPort   # 저장소 루트에서. 다시 빌드하면 미리보기도 다시 띄운다
cd judge
node --import ./register.mjs unit.test.mjs            # 함수 단위(utils·api 계층) — 브라우저 없이 Node가 .ts 원본을 읽는다
node flow.mjs http://localhost:4198                   # 흐름: 홈 순위 탭·검색 최근·건너뛰기·지수 띠 장 상태·상세·주식 모아보기·마이페이지
node repro.mjs http://localhost:4198                  # 결함 재현: 고치기 전 빌드에서 FAIL, 고친 뒤 PASS
node ai.mjs http://localhost:4198                     # AI 주가분석: 방 목록·열기·보내기·그만 기다리기·다시 시도·이름·지우기·넘어오기·실패
node common.mjs http://localhost:4198 judge           # 16화면 공통: 색 리터럴·대비·포커스·누르는 넓이·넘침·등락 색·요청 순서(expect/api-order.json)·실제 백엔드
node quick.mjs http://localhost:4198 --only layout,heart,backtest,ai,regress,extra   # 상세 바로 가기(webkit 묶음은 WebKit을 받은 뒤)
node ui.mjs http://localhost:4198                     # UI 규칙(10-29 리디자인 + 10-30 재정비)
node backtest.mjs http://localhost:4198               # 백테스트 즉석 실행
node feature.mjs http://localhost:4198                # 10-30 재정비 화면별(홈·상세·주식 모아보기)
node community.mjs http://localhost:4198              # 커뮤니티 게시판(11-03, 11-02 채팅 판정을 바꿈): 메뉴 자리·홈 다섯 줄·최신/인기 탭·종목 카드 줄·목업 새 글(시계 앞당김)·잠긴 글쓰기 화면·두 열 첫 선·좁은 폭·글 /api 0건·종목 검색·앞뒤 단추·글 상세·등락률(11-04)·휴대폰 375 누름 답과 붙는 단추 줄(B17)·당겨서 새로고침(B18). `--ws <웹소켓 빌드>`면 실제 연결 글쓰기(B16)·종목 30개 카드 줄(B19, CLAUDE.md "커뮤니티")
node lines.mjs http://localhost:4198                  # 나란한 열의 선(11-02): 홈·백테스트·마이페이지 다섯 쌍 + 홈의 다른 상태가 같은 높이, 두 열 화면 전부 옆 열 선 어긋남 0
node motion.mjs http://localhost:4198                 # 화면 전환(11-03): 메뉴 막대 미끄러짐·본문 떠오름(같은 때·곡선)·뒤로 가기·움직임 줄이기·줄이 다른 메뉴·묶음 받는 동안 띠 아래 줄
node login.mjs http://localhost:4198                  # 로그인 화면(11-02): 글자 든 단추 셋·가운데 한 줄·떠나는 주소·최근 사용(적기·지우기)·실패 안내·좁은 폭·다른 화면에 다녀온 뒤·고대비
node guide.mjs http://localhost:4198                  # 사용설명서(11-03): 글 파일과 같은 글·그림 다섯 장(WebP·자리·대체 글)·네 장 차례·꼭지로 옮기기·따라오는 차례·주소·넘침·홈 사용설명서 칸
node consistency.mjs http://localhost:4198            # 화면 사이 위계·세부(11-03): 화면 제목 크기·높이·먹 선, 백테스트 결과 머리·칸 선·지표 칸, 모아보기 제목 바닥선·하트, AI 머리, 마이페이지 크기·이름, 테스트 판, 마이페이지 휴대폰 메뉴 밑줄 탭·줄 바뀌는 탭(11-04 C7·C8)
```

`--only A,B`로 묶음을 고르고, `flow`·`repro`·`ai`는 `--headed`로 창을 보며 돌린다. 끝줄이 `N PASS / M FAIL`이고 FAIL이 있으면 종료 코드 1이다.

그 밖의 도구: `open.mjs <BASE> [경로]`(가짜 API·가짜 토큰으로 사용자가 직접 둘러보는 창), `shot.mjs`(캡처 — `judge/shots/`는 커밋하지 않는다),
`overflow-scan.mjs`(폭마다 가로 넘침), `market.mjs`(지수 띠 — 예시 값 빌드와 API 빌드 둘이 필요하다, 머리 주석 참고).

## 규칙

- **`/api`는 전부 가짜다**(`mock.mjs`). 증권사(KIS) 경로를 실제로 부르지 않는다. 백엔드 호스트(`api.juby.store`)로 가는 요청은 막고(`BLOCKED`), 응답에
  `x-vercel-id`가 붙으면(실제 응답) 판정이 센다(`X1`). 가로채기 안에서 `route.fetch()`를 부르지 않는다 — 실제 망으로 나간다.
- **바깥 글꼴(Pretendard CDN·Google Fonts)은 처음 한 번만 받아 `judge/.cache/fonts`에 담고 다음부터 거기서 준다**(`mock.mjs serveFont`, 2026-11-03).
  글꼴 CSS가 첫 그림을 막아 화면 열기(`domcontentloaded`)가 CDN 응답을 기다렸다 — 평소 0.3초가 CDN이 늦으면 1.4초, 더 늦으면 4~5초짜리 `page.goto` 시간 초과로
  판정이 띄엄띄엄 멈췄다. 담은 뒤 0.07초다. 글꼴을 바꾸면(index.html 주소가 바뀌면) 열쇠가 달라 저절로 새로 받는다. 지워도 된다(`.gitignore`).
- 가짜 응답은 스웨거(`GET /v3/api-docs`)와 백엔드 소스에서 옮긴 `*Response` 모양대로다. 값은 지은 것이라 **화면 동작 판정에만** 쓴다.
  옵션(지연·실패·빈 값)은 `mock.mjs`의 `mock()` 주석에 있다.
- 로그인은 가짜 access token(`tokenFor(회원번호)` — 백엔드 JwtUtil 모양, subject가 회원 번호)을 localStorage에 심어 흉내 낸다. 소셜 로그인은 하지 않는다.
  시계는 2026-10-29(목) 11:00 KST에 못박는다(`THU_11`) — 증권사 토큰·휴장일 판정이 실제 시계에 기대지 않게.
- **버그는 고치기 전 빌드에서 판정이 먼저 FAIL하는 걸 본 뒤 고친다**(CLAUDE.md "브라우저로 검증하는 법"의 순서). 재현 판정은 `repro.mjs`에 더한다.
- 구조를 바꾸기 전에 `node common.mjs <BASE> apilog`로 화면별 요청 순서를 `expect/api-order.json`에 적어 두고, 바꾼 뒤 `judge`의 7번으로 견준다.
  AI 화면은 `ai.mjs`가 `expect/ai-order.json`에 같은 방식으로 적는다(`--record`).
- 판정이 옛 동작을 전제로 적혀 깨졌으면, 새 동작이 맞는지 확인한 뒤 판정을 고치고 어디를 왜 고쳤는지 머리 주석에 남긴다.
