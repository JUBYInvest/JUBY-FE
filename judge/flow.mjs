// 블랙박스 흐름 판정 — 홈(순위 탭·검색 최근)·건너뛰기·지수 띠 장 상태·상세(정상·실패·임시 차트·기사 검색하기)·주식 모아보기·마이페이지 한눈에.
// /api는 전부 가짜(mock.mjs), 백엔드 호스트는 막는다. 운영 빌드(vite preview)에서 잰다.
// M1의 가입 경로는 2026-11-02부터 "Google로 가입한 계정"이다(로그인 단추 "Google로 로그인"과 같은 표기 — utils/social.ts 한 표).
//   node flow.mjs <BASE> [--only H,S,K,I,D,L,M] [--headed]
import { cli, judge, kst, noOverflow, sleep } from './lib.mjs'

const j = await judge(cli())
const { open, run, report } = j

/* ── H. 홈 — 실시간 거래대금 순위 탭 ───────────────────────────────── */
await run('H', async () => {
  const t = await open()
  await t.goto('/')
  const rows = await t.page.getByRole('button', { name: /관심종목 (추가|해제)/ }).count()
  report('H1', rows >= 13, `홈 시세표 ${rows}행`)
  await t.page.getByRole('tab', { name: '실시간 거래대금 순위' }).click()
  await t.page.getByText('기준 실시간 순위').waitFor({ timeout: 5000 })
  const rankRows = await t.page.locator('ol li').filter({ hasText: /\d/ }).count()
  report('H2', t.count(/GET \/api\/market\/volume-rank/) === 1 && rankRows >= 30, `순위 탭: volume-rank ${t.count(/volume-rank/)}건, ${rankRows}줄`)
  const samsung = t.page.getByRole('link', { name: '삼성전자', exact: true })
  const unknown = t.page.getByText('없는종목A', { exact: true })
  report('H3', (await samsung.count()) >= 1 && (await samsung.first().getAttribute('href')) === '/stocks/005930' && (await unknown.count()) >= 1 && (await t.page.getByRole('link', { name: '없는종목A' }).count()) === 0,
    `삼성전자는 상세 링크(${await samsung.count()}), 없는종목A는 글자만(${await unknown.count()})`)
  const spaced = await t.page.getByRole('link', { name: /SK\s*하이닉스/ }).count()
  report('H3b', spaced >= 1, `띄어쓴 " SK 하이닉스 "도 이름으로 찾아 링크 (${spaced})`)
  await t.page.getByRole('tab', { name: '전체 종목' }).click(); await sleep(300)
  await t.page.getByRole('tab', { name: '실시간 거래대금 순위' }).click(); await sleep(500)
  report('H4', t.count(/volume-rank/) === 1, `탭을 오가도 1분 안에는 다시 묻지 않는다 (${t.count(/volume-rank/)}건)`)
  // 순위에서 종목을 눌렀다 뒤로 오면 순위 탭 그대로
  await samsung.first().click(); await sleep(1200)
  await t.page.goBack(); await sleep(1000)
  const liveSelected = await t.page.getByRole('tab', { name: '실시간 거래대금 순위' }).getAttribute('aria-selected')
  report('H7', liveSelected === 'true', `순위에서 상세 갔다 뒤로 오면 순위 탭 유지 (aria-selected=${liveSelected})`)
  report('H8', await noOverflow(t.page), '순위 탭 1440 가로 넘침 없음')
  await t.close()

  const e = await open({ rank: '500' })
  await e.goto('/')
  await e.page.getByRole('tab', { name: '실시간 거래대금 순위' }).click()
  await e.page.getByRole('alert').waitFor({ timeout: 5000 })
  const alertText = await e.page.getByRole('alert').innerText()
  await e.page.getByRole('button', { name: '다시 시도' }).click(); await sleep(500)
  report('H5', /불러오지 못했어요/.test(alertText) && e.count(/volume-rank/) === 2, `순위 500 → 안내 + 다시 시도가 다시 묻는다 (${e.count(/volume-rank/)}건)`)
  await e.close()

  const o = await open({ loggedIn: false })
  await o.goto('/')
  await o.page.getByRole('tab', { name: '실시간 거래대금 순위' }).click(); await sleep(500)
  const loginLink = await o.page.getByRole('tabpanel').getByRole('link', { name: '로그인' }).getAttribute('href')
  report('H6', o.count(/volume-rank/) === 0 && loginLink === '/login', `비로그인 순위 탭: 묻지 않고 로그인 안내 (href=${loginLink}, 요청 ${o.count(/volume-rank/)}건)`)
  await o.close()
})

/* ── S. 검색창 최근 본 종목 ─────────────────────────────────────────── */
await run('S', async () => {
  const t = await open()
  await t.goto('/stocks/005930', 1500)
  await t.goto('/')
  const input = t.page.getByRole('combobox')
  await input.click(); await sleep(300)
  const listbox = t.page.getByRole('listbox')
  const title = await t.page.getByText('최근 본 종목').count()
  const option = await listbox.getByRole('option').filter({ hasText: '삼성전자' }).count()
  report('S1', title === 1 && option === 1, `입력칸이 비면 최근 본 종목(삼성전자) 후보 (${title}/${option})`)
  await input.press('ArrowDown'); await input.press('Enter'); await sleep(1000)
  report('S2', t.page.url().endsWith('/stocks/005930'), `방향키+Enter로 최근 종목으로 간다 (${t.page.url()})`)
  await t.goto('/')
  await input.click(); await sleep(200)
  await t.page.getByRole('button', { name: '기록 지우기' }).click(); await sleep(200)
  const after = await t.page.getByRole('listbox').count()
  const stored = await t.page.evaluate(() => localStorage.getItem('recentStocks'))
  report('S3', after === 0 && stored === '[]', `기록 지우기 → 후보 사라지고 저장값 비움 (${stored})`)
  await input.fill('삼성'); await sleep(600)
  const typed = await t.page.getByRole('listbox').getByRole('option').count()
  report('S4', typed >= 1 && t.count(/GET \/api\/stocks\/search\?keyword=/) === 1, `글자를 치면 검색 후보 ${typed}개, 서버 검색 ${t.count(/stocks\/search/)}건`)
  await t.close()
})

/* ── K. 키보드 건너뛰기 ─────────────────────────────────────────────── */
await run('K', async () => {
  const t = await open()
  await t.goto('/')
  await t.page.keyboard.press('Tab')
  const first = await t.page.evaluate(() => document.activeElement?.textContent?.trim())
  report('K1', first === '본문으로 건너뛰기', `첫 Tab = "${first}"`)
  await t.page.keyboard.press('Enter'); await sleep(200)
  const focused = await t.page.evaluate(() => ({ id: document.activeElement?.id, hash: location.hash, path: location.pathname }))
  report('K2', focused.id === 'main' && focused.hash === '' && focused.path === '/', `Enter → main 포커스, 해시 없음 (${JSON.stringify(focused)})`)
  await t.close()
})

/* ── I. 지수 띠 장 상태(휴장일) ─────────────────────────────────────── */
await run('I', async () => {
  const status = async (page) => {
    const bar = page.getByRole('complementary', { name: '국내 지수' })
    await bar.waitFor({ timeout: 5000 })
    const strong = bar.locator('strong')
    return (await strong.count()) === 0 ? null : (await bar.locator('p').first().innerText()).replace(/\s+/g, ' ').trim()
  }
  let t = await open()
  await t.goto('/')
  let s = await status(t.page)
  report('I1', s === '장 중 15:30 마감' && t.count(/GET \/api\/market\/holiday\?basedate=20261029/) === 1, `목 11:00 로그인: "${s}", 휴장일 ${t.count(/holiday/)}건`)
  await t.page.getByRole('link', { name: 'AI 주가분석' }).click(); await sleep(800)
  report('I2', t.count(/holiday/) === 1, `화면을 옮겨도 휴장일을 다시 묻지 않는다 (${t.count(/holiday/)}건)`)
  await t.page.reload(); await sleep(1000)
  report('I2b', t.count(/holiday/) === 1 && (await status(t.page)) === '장 중 15:30 마감', `새로고침해도 받아 둔 휴장일을 쓴다 (${t.count(/holiday/)}건)`)
  await t.close()

  t = await open({ holidayClosed: ['20261029'] })
  await t.goto('/')
  s = await status(t.page)
  report('I3', s === '오늘 휴장 다음 개장 10월 30일(금)', `공휴일: "${s}"`)
  await t.close()

  t = await open({ at: kst(2026, 10, 29, 16) })
  await t.goto('/')
  s = await status(t.page)
  report('I4', s === '장 마감 다음 개장 10월 30일(금)', `목 16:00: "${s}"`)
  await t.close()

  t = await open({ at: kst(2026, 10, 29, 8, 30) })
  await t.goto('/')
  s = await status(t.page)
  report('I4b', s === '장 시작 전 9:00 개장', `목 08:30: "${s}"`)
  await t.close()

  // I12 장 진행 막대(2026-11-03 사용자가 시안 비교 4번을 고름): 상태 글은 그대로 두고 그 뒤에 9:00~15:30 막대와 남은 시간.
  // 목 11:00 → 지난 몫 31%·"4시간 30분 남음", 08:30 → 0·"30분 뒤 개장", 16:00·토요일 → 막대 없음. 900px 이하는 띠 위 끝 가는 줄(지난 몫만큼)
  const session = (page) => page.evaluate(() => {
    const bar = document.querySelector('aside[aria-label="국내 지수"]')
    const track = bar?.querySelector('[role="progressbar"]')
    const edge = bar?.querySelector('[class*="_edge_"]')
    const shown = (el) => el !== null && el !== undefined && getComputedStyle(el).display !== 'none'
    return {
      now: track ? track.getAttribute('aria-valuenow') : null,
      text: track ? track.getAttribute('aria-valuetext') : null,
      trackShown: shown(track?.parentElement),
      edge: shown(edge) ? Math.round((edge.getBoundingClientRect().width / bar.getBoundingClientRect().width) * 100) : null,
    }
  })
  const sessions = []
  for (const [at, label, want] of [
    [kst(2026, 10, 29, 11), '목 11:00', { now: '31', text: '4시간 30분 남음' }],
    [kst(2026, 10, 29, 8, 30), '목 08:30', { now: '0', text: '30분 뒤 개장' }],
    [kst(2026, 10, 29, 16), '목 16:00', { now: null, text: null }],
    [kst(2026, 10, 31, 12), '토 12:00', { now: null, text: null }],
  ]) {
    t = await open({ at })
    await t.goto('/')
    const got = await session(t.page)
    sessions.push(`${label} ${got.now ?? '없음'}${got.text ? ` "${got.text}"` : ''}`)
    if (got.now !== want.now || got.text !== want.text || (want.now !== null && !got.trackShown)) sessions.push('← 틀림')
    await t.close()
  }
  t = await open({ width: 800 })
  await t.goto('/')
  const narrow = await session(t.page)
  await t.close()
  report('I12', !sessions.includes('← 틀림') && !narrow.trackShown && narrow.edge === 31, `장 진행 막대 — ${sessions.join(' · ')} / 800px 막대 ${narrow.trackShown ? '보임' : '숨김'}·띠 위 끝 줄 ${narrow.edge}%`)

  // I5·I6 비로그인: 지수는 로그인 없이 열려 띠가 뜨지만(JUBY-BE dc44e2b) 휴장일은 묻지 않는다 — 평일엔 상태를 적지 않고, 주말은 휴장만 안다
  t = await open({ loggedIn: false })
  await t.goto('/', 1500)
  const guestBar = await t.page.getByRole('complementary', { name: '국내 지수' }).count()
  s = await status(t.page)
  report('I5', guestBar === 1 && s === null && t.count(/holiday/) === 0, `비로그인 평일: 띠 ${guestBar}개, 상태 없음(${s}), 휴장일 ${t.count(/holiday/)}건`)
  await t.close()

  t = await open({ loggedIn: false, at: kst(2026, 10, 31, 12) })
  await t.goto('/', 1500)
  s = await status(t.page)
  report('I6', s === '오늘 휴장', `비로그인 토요일: "${s}"(다음 개장일은 모른다)`)
  await t.close()

  t = await open({ at: kst(2026, 10, 31, 12) })
  await t.goto('/')
  s = await status(t.page)
  report('I6b', s === '오늘 휴장 다음 개장 11월 2일(월)', `로그인 토요일: "${s}"`)
  await t.close()

  t = await open({ holiday: '500' })
  await t.goto('/')
  s = await status(t.page)
  await t.goto('/ai')
  const skip = await t.page.evaluate(() => Number(localStorage.getItem('marketCalendarSkipUntil')) - Date.now())
  report('I7', s === null && t.count(/holiday/) === 1 && skip > 25 * 60_000 && skip <= 30 * 60_000, `휴장일 500: 상태 없음, 1건만 묻고 ${Math.round(skip / 60000)}분 쉰다`)
  await t.close()

  t = await open({ width: 375, height: 800 })
  await t.goto('/')
  report('I8', await noOverflow(t.page), '375px 띠 가로 넘침 없음')
  await t.close()
})

/* ── D. 종목 상세 ───────────────────────────────────────────────────── */
await run('D', async () => {
  let t = await open()
  await t.goto('/stocks/005930', 1800)
  const h1 = await t.page.locator('h1').first().innerText()
  const price = await t.page.getByText('71,500').count()
  const tabs = await t.page.getByRole('tablist', { name: '기간' }).getByRole('tab').count()
  const summary = await t.page.getByRole('region', { name: '시세 요약' }).count()
  report('D1', /삼성전자/.test(h1) && price >= 1 && tabs === 7 && summary === 1, `상세: h1 "${h1.replace(/\s+/g, ' ')}", 가격 ${price}, 탭 ${tabs}, 시세 요약 ${summary}`)
  const heart = t.page.getByRole('button', { name: /관심종목 (추가|해제)/ })
  await t.page.waitForFunction(() => !document.querySelector('button[aria-label^="관심종목"]')?.disabled, null, { timeout: 5000 })
  const before = await heart.getAttribute('aria-pressed')
  await heart.click(); await sleep(400)
  const after = await heart.getAttribute('aria-pressed')
  report('D2', before === 'true' && after === 'false' && t.count(/DELETE \/api\/members\/me\/like-stocks\/005930/) === 1, `하트: 담김(${before}) → 누르면 해제(${after}), DELETE ${t.count(/DELETE/)}건`)
  const stats = await t.page.getByRole('region', { name: '기간별 주가 변화' }).count()
  report('D1b', stats === 1, `기간별 주가 변화 칸 ${stats}`)
  // 기사 검색하기(2026-11-04까지 이름 '물어서 찾기')
  await t.page.getByRole('button', { name: '기사 검색하기' }).click()
  const askInput = t.page.getByRole('searchbox')
  await askInput.fill('실적 전망'); await askInput.press('Enter')
  await t.page.getByText('가장 가까운 기사 3건').waitFor({ timeout: 5000 })
  const hits = await t.page.locator('a', { hasText: '가까운 기사' }).count()
  report('D5', hits === 3 && t.count(/GET \/api\/vectordb\/search\?question=/) === 1, `기사 검색하기: vectordb ${t.count(/vectordb/)}건, 기사 ${hits}건`)
  await t.page.getByRole('button', { name: '최신순' }).click(); await sleep(300)
  await t.page.getByRole('button', { name: '기사 검색하기' }).click(); await sleep(200)
  report('D6', t.count(/\/news\?sort=/) === 1, `정렬 탭으로 돌아와도 뉴스를 다시 묻지 않는다 (${t.count(/\/news\?sort=/)}건)`)
  report('D7', await noOverflow(t.page), '상세 1440 가로 넘침 없음')
  await t.close()

  // 상세 500 + 로그인 → 임시 차트
  t = await open({ detailStatus: 500 })
  await t.goto('/stocks/005930', 500)
  await t.page.getByText('임시 차트를 그렸어요').waitFor({ timeout: 15000 })
  const title = await t.page.getByRole('heading', { name: /거래일 차트/ }).innerText()
  const countdown = await t.page.getByText(/초 뒤에 종목 정보를 다시 불러와요/).count()
  report('D3', title === '최근 100거래일 차트' && countdown === 1 && t.count(/daily_itemchartprice/) === 1, `상세 500(로그인): "${title}", 남은 초 ${countdown}, 기간별 시세 ${t.count(/daily_itemchartprice/)}건, 상세 ${t.count(/GET \/api\/stocks\/005930\?period/)}건`)
  const sumRows = await t.page.getByRole('region', { name: '시세 요약' }).locator('dd').allInnerTexts()
  report('D3b', sumRows.length === 4 && sumRows.every((v) => v !== '-' && v !== ''), `임시 차트의 시세 요약 ${JSON.stringify(sumRows)}`)
  await t.close()

  t = await open({ detailStatus: 500, loggedIn: false })
  await t.goto('/stocks/005930', 500)
  // 비로그인은 1.5초 뒤 한 번 더 실패하면 65초를 기다린다(그 뒤에야 실패 상자). 기다리는 안내와 임시 차트 0건을 본다
  await t.page.getByText(/초 뒤에 차트를 다시 불러옵니다/).waitFor({ timeout: 15000 })
  report('D4', t.count(/daily_itemchartprice/) === 0 && t.count(/GET \/api\/stocks\/005930\?period/) === 2, `상세 500(비로그인): 65초 기다림 안내, 기간별 시세 ${t.count(/daily_itemchartprice/)}건, 상세 ${t.count(/GET \/api\/stocks\/005930\?period/)}건`)
  await t.close()

  t = await open({ width: 375, height: 800 })
  await t.goto('/stocks/005930', 1800)
  report('D8', await noOverflow(t.page), '상세 375 가로 넘침 없음')
  await t.close()
})

/* ── L. 주식 모아보기 ───────────────────────────────────────────────── */
await run('L', async () => {
  let t = await open()
  await t.goto('/likes', 1500)
  const h1 = await t.page.locator('h1').innerText()
  const tiles = await t.page.locator('a[data-market]').count()
  const rows = await t.page.getByRole('button', { name: /관심종목 해제/ }).count()
  report('L1', h1 === '관심종목 2개 중 1개가 올랐어요' && tiles === 2 && rows === 2, `"${h1}", 지도 ${tiles}칸, 목록 ${rows}줄`)
  await t.page.getByText('관련 네이버 기사 1').first().waitFor({ timeout: 5000 })
  const cards = await t.page.locator('a', { hasText: '네이버 기사' }).count()
  report('L2', t.count(/GET \/api\/news\?query=%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90/) === 1 && cards === 6 && (await t.page.getByRole('button', { name: '뉴스 더 보기' }).count()) === 1, `관심종목 뉴스: 삼성전자 ${t.count(/\/api\/news/)}건, 기사 ${cards}건 + 더 보기`)
  await t.page.getByRole('group', { name: '뉴스를 볼 종목' }).getByRole('button', { name: 'SK하이닉스' }).click(); await sleep(600)
  await t.page.getByRole('group', { name: '뉴스를 볼 종목' }).getByRole('button', { name: '삼성전자' }).click(); await sleep(400)
  report('L3', t.count(/\/api\/news/) === 2, `탭을 바꾸면 1건 더, 돌아오면 받아 둔 것 (${t.count(/\/api\/news/)}건)`)
  await t.page.getByRole('button', { name: 'SK하이닉스 관심종목 해제' }).click(); await sleep(400)
  const left = await t.page.getByRole('button', { name: /관심종목 해제/ }).count()
  report('L4', left === 1 && t.count(/DELETE \/api\/members\/me\/like-stocks\/000660/) === 1, `해제 → 줄 ${left}, DELETE ${t.count(/DELETE/)}건`)
  report('L7', await noOverflow(t.page), '모아보기 1440 가로 넘침 없음')
  await t.close()

  t = await open({ likeWrite: '500' })
  await t.goto('/likes', 1500)
  await t.page.getByRole('button', { name: 'SK하이닉스 관심종목 해제' }).click(); await sleep(800)
  const notice = await t.page.getByRole('status').first().innerText().catch(() => '')
  const restored = await t.page.getByRole('button', { name: /관심종목 해제/ }).count()
  report('L5', /해제하지 못했어요/.test(notice) && restored === 2 && t.count(/GET \/api\/members\/me\/like-stocks/) === 2, `해제 500 → "${notice}", 목록 복구 ${restored}줄 (목록 GET ${t.count(/GET \/api\/members\/me\/like-stocks/)}건)`)
  await t.close()

  t = await open({ naver: '429' })
  await t.goto('/likes', 1500)
  const limited = await t.page.getByText('뉴스 검색이 잠시 몰렸어요').count()
  report('L6', limited === 1, `네이버 429 → 몰렸어요 안내 (${limited})`)
  await t.close()

  t = await open({ loggedIn: false })
  await t.goto('/likes')
  const login = await t.page.getByRole('link', { name: '로그인' }).last().getAttribute('href')
  report('L8', login === '/login?next=%2Flikes' && t.log.filter((l) => /^GET \/api\/members/.test(l)).length === 0, `비로그인: 로그인 안내(${login}), 회원 요청 0`)
  await t.close()

  t = await open({ width: 375, height: 800 })
  await t.goto('/likes', 1500)
  report('L9', await noOverflow(t.page), '모아보기 375 가로 넘침 없음')
  await t.close()
})

/* ── M. 마이페이지 한눈에 보기 ──────────────────────────────────────── */
await run('M', async () => {
  let t = await open()
  // 2026-10-31부터 저장값에 주인(토큰의 subject = 회원 번호)이 있다 — 다른 계정의 줄은 보이지 않는다(repro E)
  await t.page.context().addInitScript(() => { localStorage.setItem('recentBacktests', JSON.stringify({ owner: '1', rows: [{ stockCode: '005930', stockName: '삼성전자', investType: 3, period: 'ONE_YEAR', finalScore: 64, viewedAt: Date.now() - 3600_000 }] })) })
  await t.goto('/mypage', 1500)
  const sections = await t.page.locator('section[aria-label]').count()
  const member = await t.page.getByText('허광엽 님').count()
  const social = await t.page.getByText('Google로 가입한 계정').count()
  const strategy = await t.page.getByText('이동평균 교차 전략').count()
  const likesLead = await t.page.getByText('2개 중 1개 올랐고 1개 내렸어요').count()
  const session = await t.page.getByRole('link', { name: /삼성전자 주가 어때\?/ }).count()
  const recent = await t.page.getByRole('link', { name: /이동평균 교차 전략.*64\.0점/ }).count()
  report('M1', sections === 4 && member === 1 && social === 1 && strategy >= 1 && likesLead === 1 && session === 1 && recent === 1,
    `구역 ${sections}, 회원 ${member}, 가입 경로 ${social}, 전략 ${strategy}, 관심종목 문장 ${likesLead}, 대화 ${session}, 최근 백테스트 ${recent}`)
  report('M1b', t.count(/GET \/api\/members\/me$/) === 1 && t.count(/GET \/api\/members\/me\/personality/) === 1 && t.count(/GET \/api\/members\/me\/like-stocks/) === 1 && t.count(/GET \/api\/chat-sessions$/) === 1,
    `요청: 내 정보 ${t.count(/GET \/api\/members\/me$/)}, 성향 ${t.count(/personality/)}, 관심종목 ${t.count(/like-stocks/)}, 대화 목록 ${t.count(/GET \/api\/chat-sessions$/)}`)
  // 최근 본 백테스트 줄 → 같은 조건으로 한 번 계산
  await t.page.getByRole('link', { name: /64\.0점/ }).click()
  await t.page.waitForURL('**/backtest', { timeout: 5000 })
  await t.page.getByRole('heading', { name: '백테스트 결과' }).waitFor({ timeout: 8000 })
  const presets = t.log.filter((l) => /GET \/api\/backtest\/preset\?/.test(l))
  report('M4', t.page.url().endsWith('/backtest') && presets.some((l) => /stockCode=005930&investType=3&period=ONE_YEAR/.test(l)) && presets.length <= 6,
    `최근 백테스트 줄 → /backtest에서 그 조건으로 계산 (프리셋 ${presets.length}건)`)
  await t.page.reload(); await sleep(1000)
  report('M4b', t.log.filter((l) => /GET \/api\/backtest\/preset\?/.test(l)).length === presets.length, `새로고침해도 다시 계산하지 않는다`)
  // 최근 AI 대화 줄 → 그 방을 연다
  await t.goto('/mypage', 1500)
  await t.page.getByRole('link', { name: /삼성전자 주가 어때\?/ }).click()
  await t.page.getByText('완만히 올랐어요').waitFor({ timeout: 8000 })
  report('M5', t.page.url().endsWith('/ai') && t.count(/GET \/api\/chat-sessions\/1$/) === 1 && t.count(/POST \/api\/chat-sessions/) === 0, `최근 대화 줄 → 그 방을 연다 (방 조회 ${t.count(/GET \/api\/chat-sessions\/1$/)}, 새 방 ${t.count(/POST \/api\/chat-sessions/)})`)
  report('M6', await noOverflow(t.page), 'AI 1440 가로 넘침 없음')
  await t.close()

  t = await open({ personality: 'none' })
  await t.goto('/mypage', 1500)
  const none = await t.page.getByText('아직 투자성향 검사를 하지 않았어요').count()
  const go = await t.page.getByRole('link', { name: '검사하러 가기' }).getAttribute('href')
  report('M2', none === 1 && go === '/personality-test?from=mypage', `성향 없음: 안내 ${none}, 링크 ${go}`)
  await t.close()

  t = await open({ likeList: (n) => (n === 1 ? '500' : 'ok') })
  await t.goto('/mypage', 1500)
  const failed = await t.page.getByText('관심종목을 불러오지 못했어요.').count()
  await t.page.getByRole('region', { name: '관심종목' }).getByRole('button', { name: '다시 시도' }).click(); await sleep(600)
  const recovered = await t.page.getByText('2개 중 1개 올랐고 1개 내렸어요').count()
  report('M3', failed === 1 && recovered === 1 && t.count(/like-stocks/) === 2, `관심종목 칸만 실패(${failed}) → 다시 시도로 복구(${recovered}), 다른 칸은 그대로`)
  await t.close()

  t = await open({ width: 375, height: 800 })
  await t.goto('/mypage', 1500)
  report('M7', await noOverflow(t.page), '마이페이지 375 가로 넘침 없음')
  await t.close()
})

await j.finish()
