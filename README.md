# JUBY 프론트엔드

주식 백테스트 · AI 주가분석 서비스 JUBY의 웹 화면.
React 19 + TypeScript + Vite, 시장 데이터는 전부 JUBY-BE(Spring Boot)를 거친다.

## 시작하기

```bash
npm install
cp .env.example .env   # 값은 그대로 둬도 된다
npm run dev
```

개발 환경: Node 24 / npm 11

## 화면 주소

시작 파일은 `index.html` 하나다. 주소는 전부 그 안의 라우터가 가른다.

| 주소 | 내용 |
| --- | --- |
| `/` | 홈 |
| `/stocks/:stockCode` | 종목 상세 |
| `/backtest` | 주식 백테스트 |
| `/ai` | AI 주가분석 |
| `/personality-test` | 투자성향 테스트 |
| `/mypage/personality`·`/likes`·`/profile` | 마이페이지 |
| `/guide` | 사용설명서 |
| `/login`·`/oauth2/callback`·`/oauth2/error` | 로그인(뒤의 둘은 백엔드가 로그인을 마치고 보내는 자리) |

투자성향 테스트에 `?from=mypage`(또는 `ai`)를 붙이면 검사를 마친 뒤 그 화면으로 돌아간다.

주소가 전부 한 파일에서 갈리므로, **배포할 때 없는 경로는 `index.html`을 돌려주도록**
정적 호스팅을 설정해야 새로고침에서 404가 나지 않는다. Vercel 설정은 `vercel.json`에 있다.

어느 라우트에도 걸리지 않은 주소는 `NotFoundPage`로 간다("없는 주소예요").
만들다 만 화면이 생기면 그 경로에만 따로 안내를 붙인다 — 남는 주소 전부에 붙일 말이 아니다.

## 명령어

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 후 빌드 |
| `npm run lint` | oxlint |
| `npm run preview` | 빌드 결과 확인 |

## 백엔드 연결

`.env`의 `VITE_API_BASE_URL`을 비워두면 `vite.config.ts`의 프록시를 타서
`/api` 요청이 백엔드로 넘어간다. 개발 중에는 비워두는 편이 CORS를 안 겪는다.

`VITE_API_ORIGIN`은 소셜 로그인 이동에만 쓴다.
브라우저 주소창이 직접 찾아가는 곳이라 프록시를 탈 수 없어 절대주소가 필요하다.

## 배포 (Vercel)

`vercel.json`이 두 가지를 한다. **순서가 중요하다** — 위에서부터 맞는 것을 쓴다.

1. `/api/*` → `http://3.35.191.42:8080/api/*`. 개발의 vite 프록시와 같은 역할을 배포에서 한다.
2. 나머지 전부 → `/index.html`. 없는 경로를 새로고침해도 404가 나지 않게 한다.
   (실제 파일이 있으면 Vercel이 그걸 먼저 주므로 `/assets/**`는 이 규칙에 걸리지 않는다)

1번이 필요한 이유는 CORS가 아니라 **mixed content**다. 사이트는 https인데 백엔드는 http라,
브라우저에서 곧바로 부르면 요청이 아예 나가지 못하고 막힌다. Vercel이 서버 쪽에서 대신
받아 넘기면 브라우저 눈에는 같은 출처의 https 요청 하나뿐이다.

그래서 **`VITE_API_BASE_URL`은 배포에서도 비워 둔다.** 여기에 백엔드 주소를 적으면
그 우회를 건너뛰고 브라우저가 직접 http를 불러 막힌다.
`VITE_API_ORIGIN`은 주소창 이동이라 mixed content 규칙을 받지 않아 그대로 둔다.

`index.html`의 `og:image`는 절대주소여야 해서 배포 도메인이 정해진 뒤에 채운다.

## 규칙

- 증권사(KIS) API를 프론트에서 직접 부르지 않는다. 반드시 백엔드 `/api/**`를 거친다.
- 화면 컴포넌트에서 `fetch`를 직접 쓰지 않는다. `src/api/`를 거친다.
  소셜 로그인 이동(`window.location.href`)만 예외다.
- `localStorage`의 토큰 접근은 `src/utils/auth.ts` 안에서만. 캐시용은 `src/utils/cache.ts`.
- 화면에서 로그인 여부는 `useIsLoggedIn()`으로 읽는다. 토큰이 생기거나 사라지면 따라 바뀐다.
  `isLoggedIn()`을 직접 부르는 건 화면 밖(`src/api/*`)이나 한 번만 읽으면 되는 자리다.
- 새 화면에는 `useDocumentTitle('화면 이름')`을 넣는다. 안 넣으면 앞 화면의 탭 제목이 남는다.
- 상승은 빨강(`--color-up`), 하락은 파랑(`--color-down`), 보합은 검정(`--color-text`).
- `.env`는 커밋하지 않는다. `.env.example`만 올린다.
