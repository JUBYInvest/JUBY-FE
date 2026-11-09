// 백테스트 즉석 실행(/api/backtest/run) 연결 판정(2026-10-29). /api는 전부 가짜(mock.mjs). 실제 응답이 섞이면 "!! 실제 응답"을 찍는다.
// node backtest.mjs <BASE>
import { chromium } from 'playwright'
import { mock, seedLogin } from './mock.mjs'

const BASE = process.argv[2]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const report = (id, ok, msg) => out.push(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`)
const browser = await chromium.launch({ channel: 'chrome' })

async function run(opts, period) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await seedLogin(context)
  const log = await mock(context, opts)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.headers()['x-vercel-id']) console.log('!! 실제 응답:', u.pathname) })
  await page.goto(BASE + '/backtest', { waitUntil: 'domcontentloaded' })
  await sleep(1200)
  await page.locator('#backtest-stock').fill('삼성전자')
  await page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click()
  await sleep(300)
  await page.locator(`button[data-period="${period}"]`).click()
  await sleep(200)
  await page.locator('[class*="submit"]').first().click()
  await sleep(1500)
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
  const runs = log.filter((l) => l.startsWith('GET /api/backtest/run'))
  const presets = log.filter((l) => l.startsWith('GET /api/backtest/preset?'))
  const ranks = await page.locator('[class*="rankScore"]').allInnerTexts()
  const score = await page.locator('[class*="score"]').filter({ hasNotText: /적합도|점/ }).first().innerText().catch(() => '')
  const meta = await page.locator('[class*="meta"]').first().innerText().catch(() => '')
  await context.close()
  return { text, runs, presets, ranks, score, meta, errors }
}

// B1 프리셋이 다 있으면 즉석 실행을 부르지 않는다
{
  const r = await run({}, 'ONE_YEAR')
  report('B1-a', r.runs.length === 0 && r.presets.length === 5, `프리셋 ${r.presets.length}건(기대 5: 고른 조합 = 비교 5건 중 하나), 즉석 실행 ${r.runs.length}건(기대 0)`)
  report('B1-b', /2025년 10월 28일 ~ 10월 28일 일봉 기준 · 매일 새벽 4시/.test(r.meta), `바닥 글 "${r.meta}"`)
  report('B1-c', r.ranks.length === 5 && !/불러오지 못했어요/.test(r.text), `순위 ${r.ranks.length}개, 못 받음 안내 ${/불러오지 못했어요/.test(r.text)}`)
  report('B1-d', r.errors.length === 0, `페이지 예외 ${JSON.stringify(r.errors)}`)
}

// B2 고른 조합의 프리셋이 없으면(404_5) 같은 조건으로 즉석 실행해 그 결과를 보여 준다
{
  const r = await run({ presetMissing: (c, t, p) => t === 3 && p === 'ONE_YEAR' }, 'ONE_YEAR')
  const query = r.runs[0]?.split('?')[1] ?? ''
  report('B2-a', r.runs.length === 1 && query === 'stockCode=005930&investType=3&period=ONE_YEAR', `즉석 실행 ${r.runs.length}건, 조건 "${query}"`)
  report('B2-b', /66\.6/.test(r.text) && /지금 바로 계산했어요/.test(r.meta) && /1년/.test(r.meta), `점수 66.6 보임 ${/66\.6/.test(r.text)}, 바닥 글 "${r.meta}"`)
  report('B2-c', r.ranks.length === 5 && r.ranks.includes('66.6') && !/불러오지 못했어요/.test(r.text), `순위 ${JSON.stringify(r.ranks)} (즉석 결과가 비교에도 쓰임)`)
  report('B2-d', r.errors.length === 0, `페이지 예외 ${JSON.stringify(r.errors)}`)
}

// B3 즉석 실행이 일봉 부족(404_6)으로 거절하면 더 짧은 기간을 권한다
{
  const r = await run({ presetMissing: (c, t, p) => t === 3 && p === 'SIX_MONTHS', run: () => 'BACKTEST404_6' }, 'SIX_MONTHS')
  report('B3-a', r.runs.length === 1 && /그 기간을 계산할 일봉이 모자라요/.test(r.text) && /더 짧은 기간을 골라 주세요/.test(r.text), `즉석 실행 ${r.runs.length}건, 안내 보임 ${/일봉이 모자라요/.test(r.text)}`)
  report('B3-b', !/아직 계산되지 않은 조합/.test(r.text) && r.errors.length === 0, `옛 안내(아직 계산되지 않은 조합) ${/아직 계산되지 않은 조합/.test(r.text)}, 예외 ${r.errors.length}`)
}

// B4 비교 5건 중 둘이 404_5: 하나는 즉석 실행으로 채우고, 하나는 즉석 실행도 실패(404_6) → 4개로 순위 + "1개 전략은 불러오지 못했어요"
{
  const r = await run({ presetMissing: (c, t, p) => (t === 2 || t === 4) && p === 'ONE_YEAR', run: (c, t) => (t === 2 ? 'ok' : 'BACKTEST404_6') }, 'SIX_MONTHS')
  report('B4-a', r.runs.length === 2, `즉석 실행 ${r.runs.length}건(기대 2)`)
  report('B4-b', r.ranks.length === 4 && r.ranks.includes('66.6') && /1개 전략은 불러오지 못했어요/.test(r.text), `순위 ${JSON.stringify(r.ranks)}, 안내 ${/1개 전략은 불러오지 못했어요/.test(r.text)}`)
  report('B4-c', /2025년 10월 28일 ~ 10월 28일/.test(r.meta) && r.errors.length === 0, `고른 조합(프리셋) 바닥 글 "${r.meta}", 예외 ${r.errors.length}`)
}

// B5 비교 5건이 전부 일봉 부족이면 "1년치 일봉이 모자라 비교할 수 없어요"
{
  const r = await run({ presetMissing: (c, t, p) => p === 'ONE_YEAR', run: () => 'BACKTEST404_6' }, 'SIX_MONTHS')
  report('B5-a', r.runs.length === 5 && r.ranks.length === 0 && /1년치 일봉이 모자라 비교할 수 없어요/.test(r.text), `즉석 실행 ${r.runs.length}건, 순위 ${r.ranks.length}개, 안내 ${/1년치 일봉이 모자라/.test(r.text)}`)
  report('B5-b', /적합도/.test(r.text) && r.errors.length === 0, `고른 조합 결과는 보임 ${/적합도/.test(r.text)}, 예외 ${r.errors.length}`)
}

// B6 즉석 실행이 서버 오류(500)면 일반 안내 + 비교는 "불러오지 못했어요"
{
  const r = await run({ presetMissing: (c, t, p) => p === 'ONE_YEAR', run: () => '500' }, 'ONE_YEAR')
  report('B6', /결과를 불러오지 못했어요/.test(r.text) && /잠시 후 다시 시도/.test(r.text) && r.errors.length === 0, `안내 ${/결과를 불러오지 못했어요/.test(r.text)}, 예외 ${r.errors.length}`)
}

// B7 두 열(2026-11-07 사용자가 고른 시안 3, 같은 날 다듬음): 왼쪽 = 성향 배너(맨 앞) → ①종목 ②전략 ③기간(원형 번호), 오른쪽 = '돌릴 조합' 판(종목·전략·기간 + 시작 단추).
//    굵은 먹 선은 화면 제목 아래 하나뿐이다(구역 머리 먹 선 두 줄이 겹쳐 보이던 것 — 사용자). 배너와 '돌릴 조합' 판의 위끝이 같다.
//    전략을 고르는 곳은 카드 하나, 카드에는 성향 이름(안정형 등)을 적지 않는다. 고른 전략 설명은 화면에 한 번.
//    이동평균 교차(6개월 이상)를 고르면 1개월·3개월이 잠기고, 1년을 누르면 조합에 1년. 1440에서 두 열이 본문 폭의 95% 넘게 쓴다.
//    390은 한 열 — 조건 아래에 시작 단추, 가로 넘침 없음
// B8 종목 검색은 키보드로 고른다: "삼성전자" + Enter → 삼성전자(005930)가 골라지고 조합에 적힌다. "삼성" + ↓↓ + Enter → 두 번째 후보가 골라진다
//    (↓마다 입력칸의 aria-activedescendant가 그 후보를 가리킨다). Esc는 후보를 닫는다
{
  const result = {}
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    await seedLogin(context)
    await mock(context, {})
    const page = await context.newPage()
    await page.goto(BASE + '/backtest', { waitUntil: 'domcontentloaded' })
    await sleep(1500)
    const form = page.locator('[aria-labelledby="backtest-form-title"]')
    const summary = page.locator('[aria-labelledby="backtest-summary-title"]')
    const r = {
      formCards: await form.locator('[data-invest-type]').count(),
      oldAside: await page.locator('aside[aria-labelledby="backtest-strategies-title"]').count(),
      select: await page.locator('main select').count(),
      periods: await form.locator('button[data-period]').count(),
      steps: await page.$$eval('[class*="_stepNum_"]', (els) => els.map((e) => e.textContent.trim()).join('')),
      cardText: (await form.locator('[class*="_strategyList_"]').innerText().catch(() => '')).replace(/\s+/g, ' '),
    }
    await page.locator('[data-invest-type="1"]').first().click().catch(() => {})
    await sleep(300)
    r.pressed = await page.locator('[data-invest-type="1"]').first().getAttribute('aria-pressed').catch(() => null)
    r.summaryName = (await summary.innerText().catch(() => '')).includes('RSI 역추세 전략')
    r.desc = await page.getByText('너무 많이 팔려 눌린 종목이 제자리로 돌아오는 힘을 노리는 전략이에요').count()
    await page.locator('[data-invest-type="3"]').first().click().catch(() => {})
    await sleep(200)
    r.locked = await page.$$eval('button[data-period]', (bs) => bs.filter((b) => b.disabled).map((b) => b.dataset.period).join(','))
    await page.locator('button[data-period="ONE_YEAR"]').click({ timeout: 2000 }).catch(() => {})
    await sleep(200)
    r.summaryPeriod = /1년/.test(await summary.innerText().catch(() => ''))
    Object.assign(r, await page.evaluate(() => {
      const main = document.querySelector('main'), style = getComputedStyle(main), box = main.getBoundingClientRect()
      const inner = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const form = document.querySelector('[aria-labelledby="backtest-form-title"]')?.getBoundingClientRect()
      const side = document.querySelector('[aria-labelledby="backtest-summary-title"]')?.getBoundingClientRect()
      const banner = document.querySelector('[class*="_myBanner_"]')?.getBoundingClientRect()
      const firstStep = document.querySelector('[class*="_stepNum_"]')?.getBoundingClientRect()
      const submit = [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('백테스트 시작하기'))?.getBoundingClientRect()
      const rule = getComputedStyle(document.documentElement).getPropertyValue('--color-rule').trim()
      const thick = [...main.querySelectorAll('*')].filter((el) => { const cs = getComputedStyle(el); return cs.borderBottomWidth === '2px' && cs.borderBottomStyle === 'solid' && el.getBoundingClientRect().height > 0 }).length
      return {
        span: form && side ? Math.round(((Math.max(form.right, side.right) - Math.min(form.left, side.left)) / inner) * 100) : 0,
        bannerFirst: banner && firstStep ? banner.bottom <= firstStep.top : false,
        topsEqual: banner && side ? Math.abs(banner.top - side.top) <= 1 : false,
        thick, rule: rule !== '',
        submitBelowForm: form && submit ? submit.top >= form.bottom - 1 : false,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    }))

    // B8 — 키보드로 종목 고르기
    const input = page.locator('#backtest-stock')
    await input.fill('삼성전자'); await sleep(250)
    await input.press('Enter'); await sleep(250)
    r.enterPick = { value: await input.inputValue(), code: (await page.locator('[class*="_control_"] [class*="_code_"]').first().innerText().catch(() => '')).trim() }
    await input.fill('삼성'); await sleep(250)
    const options = await page.$$eval('[role="listbox"] [role="option"]', (os) => os.map((o) => o.textContent.replace(/\d{6}/, '').trim()))
    await input.press('ArrowDown'); await input.press('ArrowDown'); await sleep(150)
    r.active = await input.getAttribute('aria-activedescendant')
    r.activeText = r.active ? (await page.locator(`#${r.active}`).innerText().catch(() => '')).replace(/\d{6}/, '').trim() : ''
    await input.press('Enter'); await sleep(250)
    r.arrowPick = { want: options[1] ?? null, got: await input.inputValue() }
    await input.fill('SK'); await sleep(250)
    const before = await page.locator('[role="listbox"]').count()
    await input.press('Escape'); await sleep(150)
    r.escape = before === 1 && (await page.locator('[role="listbox"]').count()) === 0
    result[width] = r
    await context.close()
  }
  const wide = result[1440], narrow = result[390]
  const common = (r) => r.formCards === 5 && r.oldAside === 0 && r.select === 0 && r.periods === 4 && r.steps === '123' && !/안정형|안정추구형|적극투자형|공격투자형/.test(r.cardText) &&
    r.pressed === 'true' && r.desc === 1 && r.locked === 'ONE_MONTH,THREE_MONTHS' && r.bannerFirst && r.thick === 1 && !r.overflow
  report('B7', common(wide) && wide.summaryName && wide.summaryPeriod && wide.span >= 95 && wide.topsEqual && common(narrow) && narrow.submitBelowForm,
    JSON.stringify(Object.fromEntries(Object.entries(result).map(([w, r]) => [w, { ...r, enterPick: undefined, arrowPick: undefined, active: undefined, activeText: undefined, escape: undefined }]))))
  const keys = (r) => r.enterPick.value === '삼성전자' && r.enterPick.code === '005930' && r.arrowPick.want !== null && r.arrowPick.got === r.arrowPick.want && r.activeText === r.arrowPick.want && r.escape
  report('B8', keys(wide) && keys(narrow), JSON.stringify(Object.fromEntries(Object.entries(result).map(([w, r]) => [w, { enter: r.enterPick, arrow: r.arrowPick, active: r.activeText, escape: r.escape }]))))
}

// B9 (2026-11-07 사용자) 종목 칸을 누르면 빛번짐 대신 고른 기간 칸과 같은 모양(진한 브랜드 테두리 + 옅은 브랜드 바탕, 그림자 없음).
//    비어 있는 칸을 누르기만 해도 시가총액 순 후보(삼성전자 · SK하이닉스 · 삼성전자우 …)가 뜨고 목록 안에서 굴러간다. ↓ 열두 번 + Enter → 열두 번째 종목.
//    결과의 "백테스트 다시하기"는 결과 머리(먹 선 줄)가 아니라 "이 종목으로 이어서" 맨 앞 주 단추(호박 바탕 + 먹 글자 — 11-08 색 테마 전엔 초록 + 흰 글자)이고, 단추 줄은 가운데
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await seedLogin(context)
  await mock(context, {})
  const page = await context.newPage()
  await page.goto(BASE + '/backtest', { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  const input = page.locator('#backtest-stock')
  await input.click(); await sleep(300)
  const r = await page.evaluate(() => {
    const box = document.querySelector('[class*="_control_"]'), cs = getComputedStyle(box)
    const root = getComputedStyle(document.documentElement)
    const rgb = (hex) => { const n = parseInt(hex.trim().slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }
    const list = document.querySelector('[role="listbox"]')
    return {
      shadow: cs.boxShadow, border: cs.borderTopColor === rgb(root.getPropertyValue('--color-brand-700')), fill: cs.backgroundColor === rgb(root.getPropertyValue('--color-brand-50')),
      names: list ? [...list.querySelectorAll('[role="option"]')].map((o) => o.textContent.replace(/\d{6}/, '').trim()) : [],
      scrolls: list ? list.scrollHeight > list.clientHeight : false,
    }
  })
  for (let i = 0; i < 12; i++) await input.press('ArrowDown')
  await sleep(150)
  r.activeSeen = await page.evaluate(() => {
    const list = document.querySelector('[role="listbox"]'), active = list?.querySelector('[aria-selected="true"]')
    if (!list || !active) return false
    const a = active.getBoundingClientRect(), l = list.getBoundingClientRect()
    return a.top >= l.top - 1 && a.bottom <= l.bottom + 1
  })
  await input.press('Enter'); await sleep(300)
  r.picked = await input.inputValue()
  // 지금 코드에서 종목이 안 골라지면 시작 단추가 잠긴다 — 멈추지 않고 결과 없이 적는다
  await page.locator('button[data-period="ONE_YEAR"]').click({ timeout: 2000 }).catch(() => {})
  await page.getByRole('button', { name: '백테스트 시작하기' }).click({ timeout: 2000 }).catch(() => {})
  if (r.picked === '') { await input.fill('삼성전자'); await sleep(300); await page.getByRole('button', { name: /삼성전자\s*005930/ }).first().click({ timeout: 2000 }).catch(() => {}); await page.getByRole('button', { name: '백테스트 시작하기' }).click({ timeout: 2000 }).catch(() => {}) }
  await page.getByRole('heading', { name: '백테스트 결과' }).waitFor({ timeout: 8000 }).catch(() => {})
  await sleep(800)
  Object.assign(r, await page.evaluate(() => {
    const head = document.querySelector('[class*="_resultHead_"]')
    const next = document.querySelector('[class*="_nextActions_"]')
    const first = next?.firstElementChild
    const root = getComputedStyle(document.documentElement)
    const rgb = (hex) => { const n = parseInt(hex.trim().slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})` }
    const section = next?.parentElement.getBoundingClientRect()
    const items = next ? [...next.children].map((c) => c.getBoundingClientRect()) : []
    const left = Math.min(...items.map((b) => b.left)), right = Math.max(...items.map((b) => b.right))
    return {
      headRetry: head ? [...head.querySelectorAll('button')].some((b) => b.textContent.includes('다시하기')) : null,
      firstText: first?.textContent.trim() ?? null,
      firstPrimary: first ? getComputedStyle(first).backgroundColor === rgb(root.getPropertyValue('--color-brand-400')) && getComputedStyle(first).color === rgb(root.getPropertyValue('--color-text-on-accent')) : false,
      centered: section ? Math.abs((left + right) / 2 - (section.left + section.right) / 2) <= 2 : false,
    }
  }))
  await context.close()
  report('B9', r.shadow === 'none' && r.border && r.fill && r.names.slice(0, 3).join('|') === '삼성전자|SK하이닉스|삼성전자우' && r.names.length > 50 && r.scrolls && r.activeSeen &&
    r.picked === (r.names[11] ?? '?') && r.headRetry === false && r.firstText === '백테스트 다시하기' && r.firstPrimary && r.centered,
    JSON.stringify({ ...r, names: `${r.names.length}개 ${r.names.slice(0, 3).join(' · ')} … 12번째 ${r.names[11]}` }))
}

// B10 (2026-11-07 코드 점검) 종목 칸: Esc로 닫은 뒤 Enter는 안 보이는 후보를 고르지 않는다. 마우스를 올린 줄은 Enter로 골라지지 않는다(방향키만).
//     결과가 오면 포커스가 결과로 간다(휴대폰은 결과가 시작 단추보다 DOM 앞이라 Tab으로 못 간다). "백테스트 다시하기" 뒤 포커스는 화면 제목(사라진 단추에 남지 않는다)
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await seedLogin(context)
  await mock(context, {})
  const page = await context.newPage()
  await page.goto(BASE + '/backtest', { waitUntil: 'domcontentloaded' })
  await sleep(1500)
  const input = page.locator('#backtest-stock')
  await input.fill('삼성'); await sleep(250)
  await input.press('Escape'); await input.press('Enter'); await sleep(250)
  const r = { escEnter: await input.inputValue() }
  await input.fill(''); await sleep(250)
  await page.locator('[role="listbox"] [role="option"]').nth(3).hover().catch(() => {}); await sleep(150)
  await input.press('Enter'); await sleep(250)
  r.hoverEnter = await input.inputValue()
  await input.fill('삼성전자'); await sleep(250); await input.press('Enter')
  await page.locator('button[data-period="ONE_YEAR"]').click({ timeout: 2000 }).catch(() => {})
  await page.getByRole('button', { name: '백테스트 시작하기' }).click({ timeout: 2000 }).catch(() => {})
  await page.getByRole('heading', { name: '백테스트 결과' }).waitFor({ timeout: 8000 }).catch(() => {})
  await sleep(600)
  r.resultFocus = await page.evaluate(() => document.activeElement?.id ?? document.activeElement?.tagName)
  await page.getByRole('button', { name: '백테스트 다시하기' }).click({ timeout: 2000 }).catch(() => {})
  await sleep(500)
  r.retryFocus = await page.evaluate(() => document.activeElement?.tagName)
  await context.close()
  report('B10', r.escEnter === '삼성' && r.hoverEnter === '' && r.resultFocus === 'backtest-result' && r.retryFocus === 'H1', JSON.stringify(r))
}

await browser.close()
console.log(out.join('\n'))
console.log(`backtest PASS ${out.filter((l) => l.startsWith('PASS')).length} FAIL ${out.filter((l) => l.startsWith('FAIL')).length}`)
