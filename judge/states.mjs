// 응답 상태 넷(2026-11-08): 화면마다 /api 응답을 정상 · 빈 데이터 · 500 · 3초 지연으로 바꿔 열고, 흰 화면·ErrorBoundary·구역 경계·런타임 오류·
// 글자 찌꺼기(NaN·undefined…)가 없는지, 지연 중 로딩 표시·500에 오류 안내·빈 데이터에 빈 안내가 뜨는지 잰다.
//   node states.mjs <BASE> [--only home,stock] [--shots <폴더>]   (--shots면 상태마다 화면을 찍는다 — 지연은 1초째와 끝 두 장)
// 500·지연은 탭에 page.route('**/api/**')를 덧건다(탭 가로채기가 mock.mjs의 문맥 가로채기보다 먼저 받는다 — 지연은 기다린 뒤 route.fallback()으로 넘긴다).
// 빈 데이터는 mock.mjs의 shape로 짓는다 — 응답 모양은 그대로, 배열만 비우고 개수는 0. 탭에서 진짜 응답을 받아 고치려면 route.fetch()가 실제 망으로 나간다.
import { mkdirSync } from 'node:fs'
import { cli, judge, sleep } from './lib.mjs'
import { fail } from './mock.mjs'

const { BASE, ONLY, flag } = cli()
const SHOTS = flag('--shots')
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/** [이름, 주소, 로그인, 처음 기다림(ms)] */
const SCREENS = [
  ['home', '/', true, 1800], ['home-out', '/', false, 1800], ['stock', '/stocks/005930', true, 2000], ['likes', '/likes', true, 1500],
  ['backtest', '/backtest', true, 1500], ['ai', '/ai', true, 1500], ['community', '/community', true, 1500], ['community-post', '/community/1', true, 1500],
  ['community-write', '/community/write', true, 1200], ['community-edit', '/community/3/edit', true, 1500], ['guide', '/guide', true, 1200],
  ['mypage', '/mypage', true, 1500], ['mypage-personality', '/mypage/personality', true, 1500], ['mypage-profile', '/mypage/profile', true, 1500],
  ['personality-test', '/personality-test', true, 1500], ['personality-result', '/personality-test/result', true, 1500], ['login', '/login', false, 1000],
]
const STATES = ['ok', 'empty', '500', 'slow']
const SLOW = 3000

/** 빈 데이터: 배열은 [], 개수(…Count)는 0, 다음 쪽은 없음. 글자·숫자 칸은 그대로 둔다 */
function emptify(v) {
  if (Array.isArray(v)) return []
  if (v === null || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /count$/i.test(k) && typeof x === 'number' ? 0 : k === 'hasNext' ? false : k === 'nextCursor' ? null : emptify(x)]))
}
const shape = (m, p, status, body) => {
  if (m !== 'GET' || status !== 200) return body
  const o = JSON.parse(body)
  return JSON.stringify({ ...o, result: emptify(o.result) })
}

/** 그 순간의 화면 — 본문(#main) 글, 경계, 로딩·오류 표시, 찌꺼기 글자 */
const look = (page) => page.evaluate(() => {
  const main = document.getElementById('main')
  const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const text = (main?.innerText ?? '').trim()
  const loading = [...document.querySelectorAll('[aria-busy="true"], [class*="keleton"], [class*="pinner"], [role="status"]')]
    .filter((el) => shown(el) && (el.getAttribute('role') !== 'status' || el.innerText.trim() !== '' || el.querySelector('svg, [class*="pinner"]')))
  const alerts = [...document.querySelectorAll('[role="alert"]')].filter(shown).map((el) => el.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)
  const junk = [...new Set(document.body.innerText.match(/NaN|undefined|Infinity|Invalid Date|\[object Object\]|null(?=원|%|주|건)/g) ?? [])]
  return {
    rootEmpty: (document.getElementById('root')?.childElementCount ?? 0) === 0,
    textLen: text.length,
    boundary: text.includes('화면을 표시하지 못했어요'),
    section: (text.match(/이 부분을 표시하지 못했어요/g) ?? []).length,
    loading: loading.length,
    alerts,
    junk,
    /** 빈 안내로 보이는 문장 */
    emptyMsg: (text.match(/[^\n]*(없어요|없습니다|아직|비어)[^\n]*/g) ?? []).slice(0, 3),
  }
})

const j = await judge({ BASE, ONLY: null })
for (const [name, path, loggedIn, wait] of SCREENS) {
  if (ONLY !== null && !ONLY.includes(name)) continue
  for (const state of STATES) {
    await j.run(`${name}/${state}`, async () => {
      const t = await j.open({ loggedIn, ...(state === 'empty' ? { shape } : {}) })
      const errors = []
      t.page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 140)}`))
      t.page.on('console', (m) => { if (m.type() === 'error' && /그리다 멈췄습니다/.test(m.text())) errors.push(m.text().slice(0, 140)) })
      // 끝난 줄 모르는 요청(실시간 스트림)은 기다리지 않는다
      let inflight = 0
      if (state === '500' || state === 'slow') {
        await t.page.route('**/api/**', async (route) => {
          const p = new URL(route.request().url()).pathname
          if (state === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: fail() }).catch(() => {})
          const counted = !p.startsWith('/api/stream/')
          if (counted) inflight += 1
          await sleep(SLOW)
          if (counted) inflight -= 1
          return route.fallback().catch(() => {})
        })
      }
      const id = `${name}/${state}`
      const verdict = (when, s) => {
        const white = s.rootEmpty || (s.textLen < 5 && s.loading === 0)
        const bad = [white && '흰 화면', s.boundary && 'ErrorBoundary', s.section && `구역 경계 ${s.section}`, s.junk.length && `글자 ${s.junk.join('·')}`].filter(Boolean)
        return bad.length ? `${when} ${bad.join(', ')}` : null
      }
      const shot = (suffix) => (SHOTS ? t.page.screenshot({ path: `${SHOTS}/${name}-${state}${suffix}.png` }) : null)
      await t.page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
      const problems = []
      let early = null
      if (state === 'slow') {
        await sleep(1000)
        early = await look(t.page)
        problems.push(verdict('1초째', early))
        await shot('-1s')
        await sleep(SLOW - 1000)
      }
      await sleep(wait)
      // 지연은 이어 부르는 요청(내 정보 → 목록)이 겹으로 늦는다 — 걸린 요청이 다 끝날 때까지(최대 15초)
      for (let i = 0; i < 60 && inflight > 0; i++) await sleep(250)
      if (state === 'slow') await sleep(800)
      const end = await look(t.page)
      problems.push(verdict('끝', end))
      await shot('')
      if (errors.length) problems.push(`오류 ${[...new Set(errors)].join(' | ')}`)
      const bad = problems.filter(Boolean)
      j.report(id, bad.length === 0, bad.length ? bad.join(' / ') : '흰 화면·경계·오류·찌꺼기 글자 없음')
      const note = [
        early && `1초째 로딩 표시 ${early.loading}`,
        `끝 로딩 표시 ${end.loading}`,
        end.alerts.length && `안내 ${end.alerts.slice(0, 3).map((a) => `"${a.slice(0, 40)}"`).join(' ')}`,
        end.emptyMsg.length && `빈 문장 ${end.emptyMsg.map((a) => `"${a.slice(0, 40)}"`).join(' ')}`,
        `본문 글 ${end.textLen}자`,
      ].filter(Boolean).join(' · ')
      j.report(`${id}-보임`, null, note)
      await t.close()
    })
  }
}
await j.finish()
