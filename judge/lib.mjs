// 흐름·재현·AI 판정이 같이 쓰는 도구 — 크롬 띄우기, 시계·토큰을 심은 탭 열기, PASS/FAIL 적기, 끝에 실제 응답·콘솔 오류 세기.
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { mock, seedLogin, THU_11, tokenFor } from './mock.mjs'

export { THU_11, tokenFor }
/** 저장소 루트(이 폴더의 부모) */
export const REPO = fileURLToPath(new URL('..', import.meta.url))
export const kst = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h - 9, min)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 명령줄: node x.mjs <BASE> [--only A,B] [--headed] [--이름 값] */
export function cli(argv = process.argv.slice(2)) {
  const flag = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }
  return { BASE: argv[0], ONLY: flag('--only')?.split(',') ?? null, HEADED: argv.includes('--headed'), flag }
}

/**
 * 판정 한 벌. open()이 여는 탭은 전부 가짜 /api(mock.mjs)이고 시계를 못박는다.
 *   const j = await judge(cli())
 *   await j.run('H', async () => { const t = await j.open(); ...; j.report('H1', ok, '…'); await t.close() })
 *   await j.finish()
 */
export async function judge({ BASE, ONLY = null, HEADED = false } = {}) {
  if (!BASE) { console.error('사용법: node <판정>.mjs <BASE> [--only A,B] [--headed]'); process.exit(2) }
  const browser = await chromium.launch({ channel: 'chrome', headless: !HEADED })
  const results = []
  const consoleErrors = []
  let realHits = 0
  const report = (id, ok, msg) => { const line = `${ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`; results.push(line); console.log(line) }

  /**
   * 시계를 at에 못박고(기본 목 11:00) 로그인 토큰(user번 회원)을 심은 새 탭. seed는 localStorage에 넣을 값, timezoneId는 보는 사람의
   * 시간대(기본은 이 컴퓨터 — 한국 시각으로 적는지 보려면 다른 시간대를 준다), touch는 손가락 화면(hover: none·pointer: coarse — 마우스 전용 단추가 숨는지), 나머지는 mock 옵션
   */
  async function open(opts = {}) {
    const { loggedIn = true, user = 1, at = THU_11, width = 1440, height = 900, seed = null, timezoneId = undefined, touch = false, ...mockOpts } = opts
    const context = await browser.newContext({ viewport: { width, height }, timezoneId, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
    await seedLogin(context, loggedIn, { at, user, seed })
    const log = await mock(context, { now: at, ...mockOpts })
    const page = await context.newPage()
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(`${page.url()} :: ${m.text().slice(0, 160)}`) })
    page.on('pageerror', (e) => consoleErrors.push(`${page.url()} :: pageerror ${String(e).slice(0, 160)}`))
    page.on('response', (r) => { if (r.headers()['x-vercel-id']) realHits += 1 })
    const count = (re) => log.filter((l) => re.test(l)).length
    const goto = async (path, wait = 1200) => { await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await sleep(wait) }
    /** BLOCKED 줄과 화면 아래 지수 띠의 요청(지수·실시간 연결 — market.mjs가 따로 본다)을 뺀 /api 요청 순서 */
    const api = () => log.filter((l) => !l.startsWith('BLOCKED') && !/^GET \/api\/(stream\/|market-indices)/.test(l))
    return { page, context, log, count, goto, api, close: () => context.close() }
  }
  const run = async (key, fn) => {
    if (ONLY !== null && !ONLY.includes(key)) return
    try { await fn() } catch (e) { report(`${key}-crash`, false, String(e).split('\n')[0].slice(0, 200)) }
  }
  /** 끝: 실제 백엔드 응답·콘솔 오류를 세고 요약을 찍는다. FAIL이 있으면 종료 코드 1 */
  async function finish() {
    report('X1', realHits === 0, `실제 백엔드로 나간 응답 ${realHits}건`)
    report('X2', consoleErrors.length === 0, `콘솔 오류 ${consoleErrors.length}건${consoleErrors.length ? '\n    ' + [...new Set(consoleErrors)].slice(0, 12).join('\n    ') : ''}`)
    await browser.close()
    const pass = results.filter((l) => l.startsWith('PASS')).length, fail = results.filter((l) => l.startsWith('FAIL')).length
    console.log(`\n${pass} PASS / ${fail} FAIL`)
    process.exitCode = fail > 0 ? 1 : 0
    return { pass, fail, results }
  }
  return { browser, open, run, report, finish, results, BASE }
}

/** 가로 넘침이 없는가 */
export const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
export const hexToRgb = (hex) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }
