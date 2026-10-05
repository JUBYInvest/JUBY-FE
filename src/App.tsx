import { Suspense, lazy, useEffect } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Header from './components/Header'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './pages/HomePage'
import { setNavigator } from './utils/navigation'
import { loadStockChartPage } from './utils/preload'
import styles from './App.module.css'

/*
 * 홈만 미리 넣어 두고 나머지는 들어갈 때 받는다.
 *
 * 홈은 첫 화면이라 늦게 받으면 흰 화면이 한 번 더 생긴다.
 * 반면 상세(lightweight-charts)와 AI는 홈에서 쓰지 않는데도 같은 묶음에 들어 있어
 * 홈 첫 로딩을 통째로 늦추고 있었다.
 */
// 홈·관심종목이 한가할 때 미리 받아 둔다(utils/preload.ts). 미리 받기가 실패했을 때의 대처가
// loadStockChartPage 안에 있으므로 import를 따로 쓰지 않는다
const StockChartPage = lazy(loadStockChartPage)
const AiPage = lazy(() => import('./pages/AiPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'))
/*
 * 마이페이지는 껍데기(사이드바)와 안쪽 세 화면을 **한 묶음**으로 받는다(pages/mypageBundle.ts).
 * 넷을 따로 lazy로 두면 껍데기 묶음이 온 뒤에야 안쪽 화면 묶음을 받기 시작해, 들어올 때마다
 * 왕복이 하나 더 끼었다(껍데기 → 안쪽 → 요청, 2026-10-05 측정). 셋을 합쳐도 압축 20KB 남짓이다.
 */
const mypageBundle = () => import('./pages/mypageBundle')
const MypageLayout = lazy(() => mypageBundle().then((m) => ({ default: m.MypageLayout })))
const MypagePersonalityPage = lazy(() =>
  mypageBundle().then((m) => ({ default: m.MypagePersonalityPage })),
)
const MypageProfilePage = lazy(() => mypageBundle().then((m) => ({ default: m.MypageProfilePage })))
const MypageLikesPage = lazy(() => mypageBundle().then((m) => ({ default: m.MypageLikesPage })))
const GuidePage = lazy(() => import('./pages/GuidePage'))
const BacktestPage = lazy(() => import('./pages/BacktestPage'))
const PersonalityTestPage = lazy(() => import('./pages/PersonalityTestPage'))
const PersonalityResultPage = lazy(
  () => import('./pages/PersonalityResultPage'),
)
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

/**
 * 로그인 화면은 회색 배경을 가장자리까지 채워야 해서 공통 좌우 여백을 쓰지 않는다.
 * useLocation은 BrowserRouter 안에서만 쓸 수 있어 App에서 한 겹 분리했다.
 */
function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  /*
   * 컴포넌트가 아닌 client.ts가 401을 받았을 때 쓸 이동 수단을 맡겨 둔다.
   * 이게 없으면 그쪽은 주소창을 통째로 바꾸는 수밖에 없어 화면이 한 번 깜빡인다.
   */
  useEffect(() => {
    setNavigator((path) => navigate(path, { replace: true }))
    return () => setNavigator(null)
  }, [navigate])

  return (
    <div className={styles.page}>
      <Header />

      <main className={styles.main}>
        {/*
          머리글은 경계 밖에 둔다. 아래가 멈춰도 메뉴로 빠져나갈 수 있어야 한다.
          resetKey에 현재 경로를 넘겨, 다른 화면으로 옮기면 오류 상태가 풀리게 한다.
        */}
        <ErrorBoundary resetKey={pathname}>
          {/*
            화면 묶음을 받는 동안 자리를 비워 둔다. 스피너를 넣으면 이미 캐시된 뒤에도
            껌뻑여서, 받아오는 시간이 짧을수록 오히려 어수선해진다.
          */}
          <Suspense fallback={<div className={styles.routeFallback} />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/ai" element={<AiPage />} />
              <Route path="/stocks/:stockCode" element={<StockChartPage />} />
              {/* 사이드바는 MypageLayout이 들고, 오른쪽 내용만 자식 라우트가 갈아끼운다 */}
              <Route path="/mypage" element={<MypageLayout />}>
                <Route
                  index
                  element={<Navigate to="/mypage/personality" replace />}
                />
                <Route path="personality" element={<MypagePersonalityPage />} />
                <Route path="likes" element={<MypageLikesPage />} />
                <Route path="profile" element={<MypageProfilePage />} />
              </Route>

              <Route path="/guide" element={<GuidePage />} />
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
              {/* 백엔드가 로그인을 마치고 보내는 두 자리(성공·실패). 예전 /oauth/callback은 더 오지 않아 지웠다 */}
              <Route path="/oauth2/callback" element={<OAuthCallbackPage />} />
              <Route path="/oauth2/error" element={<OAuthCallbackPage failed />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
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
