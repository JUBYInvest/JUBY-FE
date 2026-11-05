import { Suspense, lazy, useEffect, useRef } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import MarketIndexBar from './components/MarketIndexBar'
import ScrollToTop from './components/ScrollToTop'
import SectionBoundary from './components/SectionBoundary'
import HomePage from './pages/HomePage'
import { PAGE_MOTION, prefersReducedMotion } from './utils/motion'
import { setNavigator } from './utils/navigation'
import { loadStockChartPage } from './utils/preload'
import { trackRouteChunk } from './utils/routeLoading'
import styles from './App.module.css'

/*
 * 홈만 미리 넣어 두고 나머지는 들어갈 때 받는다.
 *
 * 홈은 첫 화면이라 늦게 받으면 흰 화면이 한 번 더 생긴다.
 * 상세(lightweight-charts)와 AI는 홈에서 쓰지 않으므로 같은 묶음에 넣으면 홈 첫 로딩만 늦어진다.
 *
 * 묶음을 부르는 함수는 trackRouteChunk로 감싼다 — 받는 동안 머리글 띠 아래 끝에 줄이 흐른다(utils/routeLoading.ts, Header).
 */
// 홈·관심종목이 한가할 때 미리 받아 둔다(utils/preload.ts). 미리 받기가 실패했을 때의 대처가
// loadStockChartPage 안에 있으므로 import를 따로 쓰지 않는다
const StockChartPage = lazy(trackRouteChunk(loadStockChartPage))
const AiPage = lazy(trackRouteChunk(() => import('./pages/AiPage')))
const LoginPage = lazy(trackRouteChunk(() => import('./pages/LoginPage')))
const OAuthCallbackPage = lazy(trackRouteChunk(() => import('./pages/OAuthCallbackPage')))
/*
 * 마이페이지는 껍데기(사이드바)와 안쪽 세 화면(한눈에 보기·투자유형·내 정보)을 **한 묶음**으로 받는다(pages/mypageBundle.ts).
 * 셋을 따로 lazy로 두면 껍데기 묶음이 온 뒤에야 안쪽 화면 묶음을 받기 시작해, 들어올 때마다
 * 왕복이 하나 더 낀다(껍데기 → 안쪽 → 요청). 셋을 합쳐도 압축 20KB 남짓이다.
 */
const mypageBundle = trackRouteChunk(() => import('./pages/mypageBundle'))
const MypageLayout = lazy(() => mypageBundle().then((m) => ({ default: m.MypageLayout })))
const MypageHomePage = lazy(() => mypageBundle().then((m) => ({ default: m.MypageHomePage })))
const MypagePersonalityPage = lazy(() =>
  mypageBundle().then((m) => ({ default: m.MypagePersonalityPage })),
)
const MypageProfilePage = lazy(() => mypageBundle().then((m) => ({ default: m.MypageProfilePage })))
const LikesPage = lazy(trackRouteChunk(() => import('./pages/LikesPage')))
const GuidePage = lazy(trackRouteChunk(() => import('./pages/GuidePage')))
/* 커뮤니티 목록·글 상세·글쓰기도 한 묶음이다(pages/communityBundle.ts — 목록에서 글을 누를 때 왕복이 하나 더 끼지 않게) */
const communityBundle = trackRouteChunk(() => import('./pages/communityBundle'))
const CommunityPage = lazy(() => communityBundle().then((m) => ({ default: m.CommunityPage })))
const CommunityPostPage = lazy(() => communityBundle().then((m) => ({ default: m.CommunityPostPage })))
const CommunityWritePage = lazy(() => communityBundle().then((m) => ({ default: m.CommunityWritePage })))
const BacktestPage = lazy(trackRouteChunk(() => import('./pages/BacktestPage')))
const PersonalityTestPage = lazy(trackRouteChunk(() => import('./pages/PersonalityTestPage')))
const PersonalityResultPage = lazy(trackRouteChunk(() => import('./pages/PersonalityResultPage')))
const NotFoundPage = lazy(trackRouteChunk(() => import('./pages/NotFoundPage')))

/**
 * 로그인 화면은 회색 배경을 가장자리까지 채워야 해서 공통 좌우 여백을 쓰지 않는다.
 * useLocation은 BrowserRouter 안에서만 쓸 수 있어 App에서 한 겹 나눈다.
 */
function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()

  /*
   * 컴포넌트가 아닌 client.ts가 401을 받았을 때 쓸 이동 수단을 맡겨 둔다.
   * 이게 없으면 그쪽은 주소창을 통째로 바꾸는 수밖에 없어 화면이 한 번 깜빡인다.
   */
  useEffect(() => {
    setNavigator((path) => navigate(path, { replace: true }))
    return () => setNavigator(null)
  }, [navigate])

  /*
   * 새 화면으로 가면 본문이 8px 아래에서 떠오르며 나타난다(220ms). 머리글 메뉴의 막대가 누른 메뉴로 미끄러지는 것(Header)과
   * 같은 때·같은 감속 곡선이라, 누른 곳과 바뀐 곳이 한 동작으로 읽힌다.
   * **뒤로·앞으로 가기에는 걸지 않는다** — 돌아가는 길은 떠났던 자리(홈은 스크롤까지 되살린다)로 바로 서는 게 맞다.
   * 본문 요소 하나에 Web Animations로 건다 — CSS 키프레임을 key로 다시 거는 방식은 같은 화면 안에서 종목만 바뀔 때(/stocks/A → /stocks/B)
   * 화면을 통째로 다시 만들어 받아 둔 상태가 날아간다. 처음 들어올 때와 움직임을 줄인 설정에서는 걸지 않는다.
   * 화면 묶음을 아직 못 받았으면 빈 자리(아래 Suspense fallback)가 떠오르고 내용은 뒤에 온다 — 두 번째 방문부터는 묶음이 있어 함께 떠오른다
   */
  const mainRef = useRef<HTMLElement>(null)
  const isFirstRef = useRef(true)
  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false
      return
    }
    if (navigationType === 'POP') return
    const main = mainRef.current
    if (main === null || typeof main.animate !== 'function') return
    if (prefersReducedMotion()) return
    const animation = main.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: PAGE_MOTION.duration, easing: PAGE_MOTION.easing },
    )
    return () => animation.cancel()
    // 주소가 바뀔 때만 건다. navigationType은 그때의 값을 읽기만 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <div className={styles.page}>
      {/*
        키보드로 들어오면 첫 Tab이 여기다. 머리글 메뉴(여섯)를 건너 본문으로 간다.
        주소 뒤 #main으로 옮기지 않고 본문에 포커스만 준다 — 해시가 붙으면 라우터가 새 주소 기록으로 보고 홈이 보던 자리를 잃는다
      */}
      <a
        href="#main"
        className={styles.skipLink}
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        본문으로 건너뛰기
      </a>
      <Header />

      <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
        {/*
          머리글은 경계 밖에 둔다. 아래가 멈춰도 메뉴로 빠져나갈 수 있어야 한다.
          resetKey에 현재 경로를 넘겨, 다른 화면으로 옮기면 오류 상태가 풀리게 한다.
        */}
        <ErrorBoundary resetKey={pathname}>
          {/*
            주소를 직접 열었을 때 화면 묶음을 받는 동안의 빈 자리. 아래 지수 띠가 올라붙지 않게 높이만 잡는다 —
            받는 중이라는 표시는 머리글 띠 아래 끝의 흐르는 줄 하나다(메뉴로 옮길 때도 같은 줄, utils/routeLoading.ts)
          */}
          <Suspense fallback={<div className={styles.routeFallback} />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/ai" element={<AiPage />} />
              <Route path="/stocks/:stockCode" element={<StockChartPage />} />
              {/* 주식 모아보기(관심종목을 한 번에) */}
              <Route path="/likes" element={<LikesPage />} />
              {/* 사이드바는 MypageLayout이 들고, 오른쪽 내용만 자식 라우트가 갈아끼운다 */}
              <Route path="/mypage" element={<MypageLayout />}>
                {/* 첫 화면은 한눈에 보기 */}
                <Route index element={<MypageHomePage />} />
                <Route path="personality" element={<MypagePersonalityPage />} />
                {/* 옛 주소. 북마크·뒤로 가기로 와도 주식 모아보기로 보낸다 */}
                <Route path="likes" element={<Navigate to="/likes" replace />} />
                <Route path="profile" element={<MypageProfilePage />} />
              </Route>

              {/* 사용설명서. 글이 있는 첫 장이 /guide, 나머지 장은 /guide/<장> */}
              <Route path="/community" element={<CommunityPage />} />
              <Route path="/community/write" element={<CommunityWritePage />} />
              <Route path="/community/:postId" element={<CommunityPostPage />} />
              <Route path="/community/:postId/edit" element={<CommunityWritePage />} />
              <Route path="/guide/:chapterId?" element={<GuidePage />} />
              <Route path="/backtest" element={<BacktestPage />} />

              {/*
                결과 화면은 문항 화면이 navigate로 들고 온 state로 그린다.
                주소를 직접 열면 보여줄 게 없어 스스로 문항 화면으로 되돌린다.
              */}
              <Route
                path="/personality-test"
                element={<PersonalityTestPage />}
              />
              <Route
                path="/personality-test/result"
                element={<PersonalityResultPage />}
              />

              <Route path="/login" element={<LoginPage />} />
              {/* 백엔드가 로그인을 마치고 보내는 두 자리(성공·실패) */}
              <Route path="/oauth2/callback" element={<OAuthCallbackPage />} />
              <Route path="/oauth2/error" element={<OAuthCallbackPage failed />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/*
        머리글처럼 화면 경계 밖에 한 번만 둔다 — 화면을 옮겨도 다시 그리거나 다시 묻지 않는다.
        띠가 그리다 멈추면 안내 없이 띠만 빠진다(quiet). 화면 경계 밖이라 이게 없으면 앱 전체가 흰 화면이 된다
      */}
      <SectionBoundary quiet>
        <MarketIndexBar />
      </SectionBoundary>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Layout />
    </BrowserRouter>
  )
}
