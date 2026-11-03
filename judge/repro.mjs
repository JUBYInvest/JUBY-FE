// 결함 재현 판정 — 코드 검토에서 찾은 것들. 고치기 전 빌드에서 FAIL, 고친 뒤 PASS여야 한다(CLAUDE.md "버그 수정" 순서).
//   node repro.mjs <BASE> [--only B,C,D,E,S]
import { cli, hexToRgb, judge, sleep, tokenFor, THU_11 } from './lib.mjs'

const j = await judge(cli())
const { open, run, report } = j

/* ── B. 백테스트 ───────────────────────────────────────────────────── */
await run('B', async () => {
  // B1 만료된 토큰: 기간 목록 401(재발급 실패) — 아무것도 누르지 않았는데 로그인으로 끌려가면 안 된다
  let t = await open({ optionsStatus: 401 })
  await t.goto('/backtest', 1500)
  report('B1', t.page.url().endsWith('/backtest') && t.count(/preset\/options/) === 1, `기간 목록 401 → 머문다 (${new URL(t.page.url()).pathname}${new URL(t.page.url()).search})`)
  await t.close()

  // B2 수익률 0.00%는 오름 빨강이 아니다
  t = await open({ zeroReturns: true })
  await t.goto('/backtest', 1200)
  await t.page.locator('#backtest-stock').fill('삼성전자')
  await t.page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
  await t.page.locator('#backtest-period').selectOption('ONE_YEAR')
  await t.page.getByRole('button', { name: '백테스트 시작하기' }).click()
  await t.page.getByRole('heading', { name: '백테스트 결과' }).waitFor({ timeout: 8000 })
  const zero = await t.page.evaluate(() => {
    const up = getComputedStyle(document.documentElement).getPropertyValue('--color-up-text').trim()
    const items = [...document.querySelectorAll('li')].filter((li) => /^(누적수익률|연평균수익률)/.test(li.textContent ?? '') && li.querySelector(':scope > strong'))
    return items.map((li) => { const strong = li.querySelector(':scope > strong'); return { text: strong?.textContent, color: strong ? getComputedStyle(strong).color : null } }).concat([{ text: 'token', color: up }])
  })
  const upRgb = hexToRgb(zero.at(-1).color)
  const metrics = zero.slice(0, -1)
  report('B2', metrics.length === 2 && metrics.every((m) => m.text === '0.00%' && m.color !== upRgb), `0.00% 색: ${metrics.map((m) => `${m.text}=${m.color}`).join(', ')} (오름 ${upRgb})`)
  await t.close()

  // B3 기간을 고른 뒤 서버 목록이 와서 그 기간이 빠지면 비우고 단추를 잠근다
  t = await open({ optionsDelay: 2500, optionsPeriods: (type) => (type === 1 ? ['THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR'] : ['ONE_MONTH', 'THREE_MONTHS', 'SIX_MONTHS', 'ONE_YEAR']) })
  await t.goto('/backtest', 800)
  await t.page.locator('#backtest-stock').fill('삼성전자')
  await t.page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
  await t.page.locator('#backtest-strategy').selectOption('1')
  await t.page.locator('#backtest-period').selectOption('ONE_MONTH')
  const picked = await t.page.locator('#backtest-period').inputValue()
  await sleep(3000)
  const after = await t.page.locator('#backtest-period').inputValue()
  const disabled = await t.page.getByRole('button', { name: '백테스트 시작하기' }).isDisabled()
  report('B3', picked === 'ONE_MONTH' && after === '' && disabled, `1개월 고른 뒤 목록 도착(1개월 없음) → 기간 "${after}", 단추 잠김 ${disabled}`)
  await t.close()

  // B4 결과가 오기 전에 떠나면 '최근 본 백테스트'에 남기지 않는다
  t = await open({ presetDelay: 1500 })
  await t.goto('/backtest', 1200)
  await t.page.locator('#backtest-stock').fill('삼성전자')
  await t.page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
  await t.page.locator('#backtest-period').selectOption('ONE_YEAR')
  await t.page.getByRole('button', { name: '백테스트 시작하기' }).click()
  await sleep(200)
  await t.page.getByRole('link', { name: '마이페이지' }).click()
  await sleep(2500)
  const recent = await t.page.evaluate(() => localStorage.getItem('recentBacktests'))
  report('B4', recent === null || recent === '[]', `떠난 뒤 온 결과: recentBacktests=${recent}`)
  await t.close()

  // B5 배너는 고른 전략이 추천과 다르면 "골라 뒀어요"라고 하지 않는다
  t = await open()
  await t.goto('/backtest', 1200)
  await t.page.locator('#backtest-strategy').selectOption('1')
  await sleep(200)
  const banner = (await t.page.getByText(/내 투자성향은/).innerText()).replace(/\s+/g, ' ')
  report('B5', !/골라 뒀어요/.test(banner), `전략을 바꾼 뒤 배너: "${banner}"`)
  await t.close()
})

/* ── C. 홈·상세 ───────────────────────────────────────────────────── */
await run('C', async () => {
  // C1 하트를 눌러도 차트(확대·범례)가 초기화되지 않는다
  let t = await open()
  await t.goto('/stocks/005930', 1800)
  const canvas = t.page.locator('canvas').first()
  const box = await canvas.boundingBox()
  await t.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await t.page.mouse.wheel(0, -400); await sleep(200)
  await t.page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2); await sleep(200)
  const legendBefore = await t.page.locator('div[class*="legend"]').count()
  const shotBefore = await canvas.screenshot()
  await t.page.waitForFunction(() => !document.querySelector('button[aria-label^="관심종목"]')?.disabled, null, { timeout: 5000 })
  await t.page.evaluate(() => document.querySelector('button[aria-label^="관심종목"]').click())
  await sleep(500)
  const legendAfter = await t.page.locator('div[class*="legend"]').count()
  const shotAfter = await canvas.screenshot()
  report('C1', legendBefore === 1 && legendAfter === 1 && shotBefore.equals(shotAfter), `하트 클릭 전후 범례 ${legendBefore}→${legendAfter}, 차트 그림 같음 ${shotBefore.equals(shotAfter)}`)
  await t.close()

  // C2 첫 방문(담아 둔 것 없음)에 대장주가 고정 목록과 다르면 카드 그래프 요청이 두 벌 나갔다 → 한 벌(3건)
  t = await open({ leading: 'alt' })
  await t.goto('/', 2500)
  const yearCalls = t.log.filter((l) => /GET \/api\/stocks\/\d{6}\?period=ONE_YEAR/.test(l))
  report('C2', yearCalls.length === 3 && yearCalls.every((l) => /005930|006400|034730/.test(l)), `카드 그래프 요청 ${yearCalls.length}건: ${yearCalls.map((l) => l.match(/\d{6}/)[0]).join(',')}`)
  await t.close()

  // C3 시세표 기준일이 비어 오면("") 담아 둔 그래프가 영영 "신선"했다 → 3일 지난 그래프는 다시 묻는다
  const stale = Object.fromEntries(['000660', '012450', '207940'].map((code) => [code, { stockCode: code, lastDate: '20250101', prices: [1, 2, 3], volumes: [1, 1, 1], changeRate: 1.5, savedAt: THU_11 - 10 * 86400_000 }]))
  t = await open({ stocksBaseDate: null, seed: { cardSeriesYear: JSON.stringify(stale) } })
  await t.goto('/', 2500)
  const staleCalls = t.log.filter((l) => /GET \/api\/stocks\/\d{6}\?period=ONE_YEAR/.test(l)).length
  report('C3', staleCalls === 3, `기준일 없음 + 열흘 묵은 그래프 → 카드 그래프 요청 ${staleCalls}건(기대 3)`)
  await t.close()

  // C4 기다리는 중(65초)에도 탭 제목은 종목명이다
  t = await open({ detailStatus: 500, loggedIn: false })
  await t.goto('/', 1200)
  await t.page.getByRole('link', { name: '삼성전자', exact: true }).first().click()
  await t.page.getByText(/초 뒤에 차트를 다시 불러옵니다/).waitFor({ timeout: 15000 })
  const title = await t.page.title()
  report('C4', /삼성전자/.test(title), `기다리는 중 탭 제목: "${title}"`)
  await t.close()

  // C5 같은 탭에서 로그아웃(다른 탭 포함)하면 홈 하트가 꺼진다
  t = await open()
  await t.goto('/', 1500)
  const pressedBefore = await t.page.locator('button[aria-pressed="true"][aria-label*="관심종목"]').count()
  await t.page.evaluate(() => { localStorage.removeItem('accessToken'); window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: null })) })
  await sleep(500)
  const header = await t.page.getByRole('navigation', { name: '계정' }).innerText()
  const pressedAfter = await t.page.locator('button[aria-pressed="true"][aria-label*="관심종목"]').count()
  report('C5', pressedBefore === 1 && /로그인/.test(header) && pressedAfter === 0, `로그아웃 뒤 켜진 하트 ${pressedBefore}→${pressedAfter}, 머리글 "${header.trim()}"`)
  await t.close()

  // C6 목록이 늦게 와도 같은 글자로 서버 검색이 두 번 나가지 않는다
  t = await open({ stocksDelay: 1500 })
  await t.goto('/', 300)
  await t.page.getByRole('combobox').fill('삼성')
  await sleep(2800)
  report('C6', t.count(/GET \/api\/stocks\/search\?keyword=/) === 1, `목록 도착 전 입력 → 서버 검색 ${t.count(/stocks\/search/)}건`)
  await t.close()

  // C7 마이페이지 관심종목 줄에서 상세로 가면 이름·종가를 먼저 보여 준다
  t = await open({ detailDelay: 3000 })
  await t.goto('/mypage', 1500)
  await t.page.getByRole('region', { name: '관심종목' }).getByRole('link', { name: /삼성전자/ }).click()
  await sleep(400)
  const h1 = (await t.page.locator('h1').first().innerText()).replace(/\s+/g, ' ')
  const pending = await t.page.getByText(/10월 28일 종가/).count()
  report('C7', /삼성전자/.test(h1) && pending === 1, `상세 응답 전: h1 "${h1}", 기준일 종가 줄 ${pending}`)
  await t.close()
})

/* ── D. AI ─────────────────────────────────────────────────────────── */
await run('D', async () => {
  // D1 대화방을 못 불러온 화면에서는 질문을 보내지 않는다
  let t = await open({ sessionDetailStatus: 500 })
  await t.goto('/ai', 1500)
  await t.page.getByRole('button', { name: /삼성전자 주가 어때\?/ }).first().click()
  await t.page.getByText('대화를 불러오지 못했습니다.').waitFor({ timeout: 5000 })
  const input = t.page.getByRole('textbox', { name: '질문 입력' })
  await input.fill('그 종목 전망은?')
  await input.press('Enter'); await sleep(800)
  const sendDisabled = await t.page.getByRole('button', { name: '보내기' }).isDisabled()
  report('D1', t.count(/POST \/api\/open-ai\/ask/) === 0 && sendDisabled, `오류 화면에서 Enter → 질문 ${t.count(/open-ai\/ask/)}건, 보내기 잠김 ${sendDisabled}`)
  await t.close()

  // D2 그만 기다린 뒤 새 질문을 보내면 서버가 끝낸 앞 답도 보인다
  t = await open({ askDelay: 2000 })
  await t.goto('/ai', 1500)
  const box = t.page.getByRole('textbox', { name: '질문 입력' })
  await box.fill('첫 질문'); await box.press('Enter')
  await t.page.getByRole('button', { name: '그만 기다리기' }).click({ timeout: 3000 })
  await sleep(2600)
  await box.fill('둘째 질문'); await box.press('Enter')
  await t.page.getByText('둘째 질문').waitFor()
  await sleep(3500)
  const answers = await t.page.getByText('요약입니다.').count()
  report('D2', answers === 2 && t.count(/POST \/api\/open-ai\/ask/) === 2, `그만 기다리기 → 새 질문 뒤 답 말풍선 ${answers}개 (질문 ${t.count(/open-ai\/ask/)}건)`)
  await t.close()
})

/* ── E. 최근 본 백테스트는 계정별이다 ───────────────────────────────── */
await run('E', async () => {
  const runBacktest = async (t) => {
    await t.goto('/backtest', 1200)
    await t.page.locator('#backtest-stock').fill('삼성전자')
    await t.page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
    await t.page.locator('#backtest-period').selectOption('ONE_YEAR')
    await t.page.getByRole('button', { name: '백테스트 시작하기' }).click()
    await t.page.getByRole('heading', { name: '백테스트 결과' }).waitFor({ timeout: 8000 })
  }
  const recentRows = (t) => t.page.getByRole('region', { name: '최근 본 백테스트' }).getByRole('link', { name: /삼성전자/ }).count()
  const switchTo = (t, token) => t.page.evaluate((token) => {
    if (token === null) localStorage.removeItem('accessToken'); else localStorage.setItem('accessToken', token)
    window.dispatchEvent(new StorageEvent('storage', { key: 'accessToken', newValue: token }))
  }, token)

  // E1 1번 회원이 본 결과는, 로그아웃 없이 2번 회원으로 로그인하면(다른 탭·콜백) 보이지 않는다(2026-10-31)
  let t = await open({ user: 1 })
  await runBacktest(t)
  await switchTo(t, tokenFor(2))
  await t.goto('/mypage', 1500)
  const other = await recentRows(t)
  const emptyText = await t.page.getByText('아직 본 백테스트가 없어요').count()
  report('E1', other === 0 && emptyText === 1, `2번 회원으로 바꾼 뒤 1번 회원의 최근 본 백테스트 ${other}줄, 빈 안내 ${emptyText}`)
  await t.close()

  // E2 토큰이 만료돼 풀렸다가 같은 회원이 다시 로그인하면 그대로 보인다(2026-10-30 결정 — 토큰 만료만으로는 지우지 않는다)
  t = await open({ user: 1 })
  await runBacktest(t)
  await switchTo(t, null)
  await sleep(300)
  await switchTo(t, tokenFor(1))
  await t.goto('/mypage', 1500)
  const same = await recentRows(t)
  report('E2', same === 1, `같은 회원이 다시 로그인하면 최근 본 백테스트 ${same}줄`)
  await t.close()
})

/* ── S. 공용 CSS를 다시 덮는 규칙(2026-11-03 리팩토링 검토) ────────────────────────
 * 공용 모듈(buttons·section)은 그걸 쓰는 화면 묶음마다 한 벌씩 들어온다. 화면 CSS가 가져온 값을 같은 속성으로 다시 적으면
 * 처음엔 화면 규칙이 이기지만, 다른 화면 묶음이 들어와 공용 모듈 한 벌이 뒤에 붙으면 공용 값이 이긴다 — 같은 화면이
 * 다녀온 뒤 다르게 보인다(2026-11-02 로그인 단추 L10과 같은 까닭). 처음 연 때와 다른 화면에 다녀온 뒤를 견준다.
 */
await run('S', async () => {
  const menu = (page, nav, label) => page.locator(`nav[aria-label="${nav}"] a[data-label="${label}"]`).click()
  async function roundTrip(id, { path, width = 390, height = 844, measure, away, back = 'goBack', label, expect = null }) {
    const t = await open({ width, height })
    await t.goto(path, 1800)
    await t.page.evaluate(() => document.fonts.ready)
    const first = await t.page.evaluate(measure)
    for (const step of away) { await step(t.page); await sleep(1500) }
    if (back === 'goBack') for (let i = 0; i < away.length; i += 1) { await t.page.goBack(); await sleep(700) }
    else { await back(t.page); await sleep(1500) }
    const after = await t.page.evaluate(measure)
    const same = first !== null && JSON.stringify(first) === JSON.stringify(after)
    const meant = expect === null || JSON.stringify(first) === JSON.stringify(expect)
    report(id, same && meant, `${label} — 처음 ${JSON.stringify(first)} / 다른 화면에 다녀온 뒤 ${JSON.stringify(after)}${expect === null ? '' : ` (화면 CSS가 정한 값 ${JSON.stringify(expect)})`}`)
    await t.close()
  }
  const titleSize = () => { const h = document.querySelector('main h1'); return h ? getComputedStyle(h).fontSize : null }
  const toAi = (page) => menu(page, '서비스', 'AI 주가분석')
  const toBacktest = (page) => menu(page, '서비스', '주식 백테스트')
  await roundTrip('S1', { path: '/ai', measure: titleSize, away: [toBacktest], label: '휴대폰 AI 주가분석 화면 제목 글자', expect: '24px' })
  await roundTrip('S2', { path: '/backtest', measure: titleSize, away: [toAi], label: '휴대폰 백테스트 화면 제목 글자', expect: '24px' })
  await roundTrip('S3', { path: '/guide', measure: titleSize, away: [toAi], label: '휴대폰 사용설명서 화면 제목 글자', expect: '24px' })
  await roundTrip('S4', { path: '/mypage', measure: titleSize, away: [toAi], label: '휴대폰 마이페이지 화면 제목 글자', expect: '24px' })
  await roundTrip('S5', {
    path: '/', away: [toBacktest], label: '휴대폰 홈 검색 단추(글자·높이·안 여백)',
    measure: () => { const b = document.querySelector('form button[type="submit"]'); if (!b) return null; const c = getComputedStyle(b); return [c.fontSize, Math.round(b.getBoundingClientRect().height), c.paddingLeft] },
  })
  await roundTrip('S6', {
    path: '/stocks/005930', away: [toAi], label: '휴대폰 종목 상세 바로 가기 단추(높이·안 여백)',
    // 상세 바로 가기 단추는 설명 한 줄(화면에서 숨김)을 안에 품어 글자가 "이 종목 백테스트…"로 이어진다
    measure: () => { const a = [...document.querySelectorAll('main a')].find((x) => x.textContent?.trim().startsWith('이 종목 백테스트')); if (!a) return null; const c = getComputedStyle(a); return [Math.round(a.getBoundingClientRect().height), c.paddingLeft, c.fontSize] },
  })
  await roundTrip('S7', {
    path: '/likes', width: 1440, height: 900, away: [toAi], label: '주식 모아보기 담은 종목 줄의 작은 단추 글자',
    measure: () => { const a = [...document.querySelectorAll('main a')].find((x) => x.textContent?.trim() === '이 종목 백테스트'); return a ? getComputedStyle(a).fontSize : null },
  })
})

await j.finish()
