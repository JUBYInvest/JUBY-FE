// 사용설명서 판정(2026-11-03 사용자 "사용설명서에 그대로 반영해줘" — 노션에서 쓴 네 장: 1 JUBY 소개 · 2 투자성향 · 3 주식 백테스트(그림 다섯 장) · 4 AI 투자 챗봇).
// 장 목록은 src/content/guide/index.ts, 기대값은 각 장의 .md에서 짓는다 — 글을 바꾸거나 장을 더해도 판정을 고치지 않는다.
//  U1 원문 그대로(장마다): 장 제목·꼭지·소제목·표·그림·인용·식·예시 상자·가는 선 개수가 글과 같고, 글의 모든 줄(꾸밈을 걷은 글자)이 화면에 있다
//  U2 그림: 모두 받아 그려지고(무손실 WebP), 자리를 미리 잡고(width·height), 그림을 설명하는 대체 글이 있다
//  U3 장 목록(왼쪽): 장 순서, 글이 없는 장은 "준비 중"이고 링크가 아니다, 지금 장은 aria-current. "이 장에서"(오른쪽)는 그 장의 꼭지
//  U4 꼭지로 옮기기: 그 제목이 화면 위에 서고 포커스를 받는다, 주소·기록은 그대로. 움직임 줄이기면 곧바로, 아니면 부드럽게
//  U5 장 목록·"이 장에서"가 읽는 동안 위에 붙어 따라온다(넓은 화면). 좁은 화면은 장 목록이 본문 앞, 꼭지는 빼고 단추는 본문 뒤
//  U9 배치(2026-11-03 사용자 "가운데 허전함"): 1200px~ 세 열 — 장 목록은 화면 제목 왼쪽 끝, "이 장에서"는 오른쪽 끝, 본문(760px까지)은
//     두 열 사이 가운데(양쪽 사이가 같고 200px 안). 1101~1199px은 "이 장에서"가 장 목록 아래. 본문 글 안에 굵은 먹 선이 없다
//  U10 "이 장에서" 단추: 장마다 그 기능 화면으로(index.ts action), 좁은 화면에서도 보인다
//  U6 주소: 첫 장이 /guide, 나머지는 /guide/<장>, 없는 장은 /guide로, 머리글 '사용설명서'가 지금 메뉴
//  U7 가로 넘침 없음(320~1920, 장마다), 휴대폰 두 칸 표의 첫 칸은 한 줄, 제목 단계를 건너뛰지 않는다(장마다), 넓은 화면 장 목록·꼭지 링크 40px 이상
//  U8 장 끝의 이전 장·다음 장: 첫 장은 다음만, 끝 장은 이전만, 누르면 그 장 맨 위
// node guide.mjs <BASE> [--only U1,U2] [--headed]
import { readFileSync } from 'node:fs'
import { cli, judge, noOverflow, REPO, sleep } from './lib.mjs'

const j = await judge(cli())
const NAV = 'nav[aria-label="사용설명서 장"]'
const SIDE = 'aside[aria-labelledby="guide-side-title"]'
const strip = (s) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim()

/** 장 목록(index.ts)과 글에서 지은 기대값 */
const index = readFileSync(`${REPO}src/content/guide/index.ts`, 'utf8')
const files = Object.fromEntries([...index.matchAll(/import (\w+) from '\.\/([^']+)\?raw'/g)].map((m) => [m[1], m[2]]))
const chapters = [...index.matchAll(/\{ id: '([^']+)', name: '([^']+)', markdown: (\w+), action: \{ to: '([^']+)', label: '([^']+)' \} \}/g)]
  .map((m, i) => ({ id: m[1], name: m[2], number: i + 1, file: m[3] === 'null' ? null : files[m[3]], action: { to: m[4], label: m[5] } }))
const ready = chapters.filter((c) => c.file !== null).map((c) => ({ ...c, ...expect(readFileSync(`${REPO}src/content/guide/${c.file}`, 'utf8')) }))
const first = ready[0]
const pathOf = (c) => (c === first ? '/guide' : `/guide/${c.id}`)

function expect(markdown) {
  const lines = markdown.split('\n')
  let fenced = false
  const outside = lines.map((l) => { const fence = /^\s*```/.test(l); if (fence) fenced = !fenced; return fence || fenced ? null : l })
  const body = outside.slice(outside.findIndex((l) => l !== null && /^# /.test(l)) + 1)
  return {
    title: strip(lines.find((l) => /^# /.test(l)).slice(2)),
    sections: body.filter((l) => l !== null && /^## /.test(l)).map((l) => strip(l.slice(3))),
    subheadings: body.filter((l) => l !== null && /^#{3,6} /.test(l)).length,
    tables: lines.filter((l) => /^\|\s*-{3}/.test(l)).length,
    images: lines.filter((l) => /^!\[/.test(l)).map((l) => /\]\(([^)]+)\)/.exec(l)[1]),
    quotes: lines.filter((l, i) => /^>/.test(l) && !/^>/.test(lines[i - 1] ?? '')).length,
    formulas: lines.filter((l) => /^`[^`]+`$/.test(l.trim())).length,
    pres: lines.filter((l) => /^\s*```/.test(l)).length / 2,
    rules: outside.filter((l) => l !== null && /^-{3,}\s*$/.test(l)).length,
    // 화면에 있어야 할 글 조각: 표는 칸마다, 나머지는 줄마다(제목 줄·그림·표 구분 줄·가는 선·코드 울타리 빼고)
    texts: body.length === 0 ? [] : lines.slice(1).flatMap((l) => {
      if (l.trim() === '' || /^\|\s*-{3}/.test(l) || /^!\[/.test(l) || /^\s*```/.test(l) || /^-{3,}\s*$/.test(l)) return []
      if (/^\|/.test(l)) return l.split('|').slice(1, -1).map(strip).filter(Boolean)
      return [strip(l.trim().replace(/^#+\s+/, '').replace(/^>\s?/, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))].filter(Boolean)
    }),
  }
}

async function openGuide(opts = {}, path = '/guide') {
  const t = await j.open({ width: 1440, height: 900, ...opts })
  await t.goto(path, 1500)
  await t.page.evaluate(() => document.fonts.ready)
  return t
}

await j.run('U1', async () => {
  for (const c of ready) {
    const t = await openGuide({}, pathOf(c))
    const got = await t.page.evaluate(() => {
      const article = document.querySelector('main article')
      if (article === null) return null
      return {
        title: document.getElementById('guide-chapter-title')?.textContent.trim() ?? null,
        sections: [...article.querySelectorAll('h3')].map((h) => h.textContent.trim()),
        subheadings: article.querySelectorAll('h4, h5, h6').length,
        tables: article.querySelectorAll('table').length,
        images: article.querySelectorAll('img').length,
        quotes: article.querySelectorAll('blockquote').length,
        formulas: [...article.querySelectorAll('p')].filter((p) => getComputedStyle(p).borderLeftWidth === '3px').length,
        pres: article.querySelectorAll('pre').length,
        rules: article.querySelectorAll('hr').length,
        text: article.innerText.replace(/\s+/g, ' '),
      }
    })
    const tag = `U1 ${c.number}장`
    if (got === null) {
      j.report(tag, false, `${pathOf(c)} 본문(article)이 없다`)
    } else {
      const counts = ['subheadings', 'tables', 'quotes', 'formulas', 'pres', 'rules'].map((k) => [k, got[k], c[k]])
      const same = got.title === c.title && JSON.stringify(got.sections) === JSON.stringify(c.sections) && got.images === c.images.length && counts.every(([, a, b]) => a === b)
      const missing = c.texts.filter((s) => !got.text.includes(s))
      // 마크다운이 못 읽은 굵게(**-18.40%**로)는 별표가 글자로 남는다
      if (got.text.includes('**')) missing.unshift(`별표가 글자로 남음: …${got.text.slice(Math.max(0, got.text.indexOf('**') - 12), got.text.indexOf('**') + 16)}…`)
      j.report(tag, same && missing.length === 0, `${pathOf(c)} "${got.title}" — 꼭지 ${got.sections.length}/${c.sections.length}, 그림 ${got.images}/${c.images.length}, ${counts.map(([k, a, b]) => `${k} ${a}/${b}`).join(', ')}; 글 ${c.texts.length}조각 중 없는 것 ${missing.length}${missing.length ? '\n    ' + missing.slice(0, 6).join('\n    ') : ''}`)
    }
    await t.close()
  }
})

await j.run('U2', async () => {
  const withImages = ready.filter((c) => c.images.length > 0)
  j.report('U2', withImages.length > 0 ? null : false, `그림이 있는 장 ${withImages.map((c) => c.number + '장').join('·')}`)
  for (const c of withImages) {
    const t = await j.open({ width: 1440, height: 900 })
    const types = new Map()
    t.page.on('response', (r) => { if (/\/guide\/.+\.(webp|png)$/.test(new URL(r.url()).pathname)) types.set(new URL(r.url()).pathname, r.headers()['content-type']) })
    await t.goto(pathOf(c), 1500)
    const rows = []
    for (const img of await t.page.locator('main article img').all()) {
      await img.scrollIntoViewIfNeeded()
      await t.page.waitForFunction((el) => el.complete, await img.elementHandle(), { timeout: 4000 }).catch(() => {})
      rows.push(await img.evaluate((el) => ({ src: new URL(el.src).pathname, natural: el.naturalWidth, attr: el.getAttribute('width') !== null && el.getAttribute('height') !== null,
        ratio: el.naturalHeight > 0 && Math.abs(el.getBoundingClientRect().width / el.getBoundingClientRect().height - el.naturalWidth / el.naturalHeight) < 0.02, alt: el.alt, lazy: el.loading === 'lazy' })))
    }
    const loaded = rows.length === c.images.length && rows.every((r, i) => r.src === c.images[i] && r.natural > 0 && r.ratio)
    j.report(`U2a ${c.number}장`, loaded, `그림 ${rows.length}장, 글의 순서·주소와 같고 다 그려졌다 — ${rows.map((r) => `${r.src.split('/').pop()} ${r.natural}px`).join(', ')}`)
    j.report(`U2b ${c.number}장`, rows.length > 0 && rows.every((r) => r.attr && r.lazy), '그림이 오기 전에 자리를 잡고(width·height) 화면 가까이 와서 받는다(loading=lazy)')
    j.report(`U2c ${c.number}장`, rows.length > 0 && rows.every((r) => r.alt.length >= 20 && !/\.(png|webp)$/i.test(r.alt)), `대체 글이 그림을 설명한다(노션 이름 image.png가 아니다) — ${rows.map((r) => r.alt.slice(0, 18) + '…').join(' | ')}`)
    j.report(`U2d ${c.number}장`, types.size === c.images.length && [...types.values()].every((v) => v === 'image/webp'), `WebP로 받는다 — ${JSON.stringify([...types.values()])}`)
    await t.close()
  }
})

await j.run('U3', async () => {
  const t = await openGuide()
  const got = await t.page.evaluate(([navSel, sideSel]) => {
    const nav = document.querySelector(navSel)
    const side = document.querySelector(sideSel)
    if (nav === null || side === null) return null
    return {
      toc: [...nav.querySelectorAll(':scope > ol > li')].map((li) => {
        const head = li.firstElementChild
        return { text: head.textContent.replace(/\s+/g, ' ').trim(), link: head.tagName === 'A', href: head.getAttribute('href'), current: head.getAttribute('aria-current') }
      }),
      sections: [...side.querySelectorAll('ol a')].map((a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
    }
  }, [NAV, SIDE])
  if (got === null) j.report('U3', false, '장 목록이나 "이 장에서"가 없다')
  else {
    const toc = got.toc.map((c, i) => ({ ...c, sections: i === chapters.findIndex((x) => x.id === first.id) ? got.sections : [] }))
    const names = toc.map((c) => c.text)
    const want = chapters.map((c) => `${c.number} ${c.name}${c.file === null ? ' 준비 중' : ''}`)
    const links = chapters.map((c) => (c.file === null ? null : pathOf(ready.find((r) => r.id === c.id))))
    const at = chapters.findIndex((c) => c.id === first.id)
    const ok = JSON.stringify(names) === JSON.stringify(want) && toc.every((c, i) => (links[i] === null ? !c.link : c.link && c.href === links[i]))
      && toc.filter((c) => c.current === 'page').length === 1 && toc[at].current === 'page'
      && JSON.stringify(toc[at].sections.map((s) => s.text)) === JSON.stringify(first.sections) && toc[at].sections.every((s, i) => s.href === `#${first.id}-${i + 1}`)
      && toc.every((c, i) => i === at || c.sections.length === 0)
    j.report('U3', ok, `장 목록 ${JSON.stringify(names)}, 링크 ${JSON.stringify(toc.map((c) => c.href))}, "이 장에서"(${first.number}장) 꼭지 ${JSON.stringify(toc[at]?.sections.map((s) => s.text))}`)
  }
  await t.close()
})

await j.run('U4', async () => {
  const k = Math.min(2, first.sections.length)
  const target = first.sections[k - 1]
  const id = `${first.id}-${k}`
  const measure = (page) => page.evaluate((id) => {
    const h = document.getElementById(id)
    return h === null ? null : { top: Math.round(h.getBoundingClientRect().top), focused: document.activeElement === h, url: location.pathname + location.search + location.hash, len: history.length }
  }, id)
  const t = await openGuide()
  const before = await t.page.evaluate(() => ({ url: location.pathname + location.search + location.hash, len: history.length }))
  await t.page.locator(`${SIDE} a`, { hasText: target }).click()
  await sleep(60)
  const early = await measure(t.page)
  await sleep(1200)
  const after = await measure(t.page)
  j.report('U4a', after !== null && after.top >= 0 && after.top <= 48 && after.focused && after.url === before.url && after.len === before.len,
    `"${target}"을 누르면 그 제목이 화면 위(${after?.top}px)에 서고 포커스를 받는다, 주소·기록 그대로(${after?.url}, ${before.len} → ${after?.len})`)
  j.report('U4b', early !== null && early.top > 100, `부드럽게 옮긴다 — 60ms 뒤 아직 ${early?.top}px`)
  await t.close()

  const r = await j.open({ width: 1440, height: 900 })
  await r.page.emulateMedia({ reducedMotion: 'reduce' })
  await r.goto('/guide', 1500)
  await r.page.locator(`${SIDE} a`, { hasText: target }).click()
  await sleep(60)
  const instant = await measure(r.page)
  j.report('U4c', instant !== null && instant.top >= 0 && instant.top <= 48, `움직임 줄이기 설정에서는 곧바로 선다 — 60ms 뒤 ${instant?.top}px`)
  await r.close()
})

await j.run('U5', async () => {
  // 가장 긴 장에서 잰다
  const longest = [...ready].sort((a, b) => b.texts.length - a.texts.length)[0]
  const t = await openGuide({}, pathOf(longest))
  await t.page.evaluate(() => window.scrollTo(0, 4000))
  await sleep(300)
  const wide = await t.page.evaluate((sels) => sels.map((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null }).concat([{ y: Math.round(scrollY) }]), [NAV, SIDE])
  const stuck = (r) => r !== null && r.top >= 0 && r.top <= 40 && r.bottom < 900 - 44
  j.report('U5a', wide[2].y >= 3000 && stuck(wide[0]) && stuck(wide[1]), `넓은 화면(${longest.number}장): 내려도 장 목록·"이 장에서"가 위에 붙어 다 보인다 — ${JSON.stringify(wide)}`)
  await t.close()

  const m = await openGuide({ width: 390, height: 844 }, pathOf(longest))
  const narrow = await m.page.evaluate(([navSel, sideSel]) => {
    const nav = document.querySelector(navSel)
    const side = document.querySelector(sideSel)
    const article = document.querySelector('main article')
    if (nav === null || side === null || article === null) return null
    const action = [...side.querySelectorAll('a')].find((a) => !a.closest('ol'))
    const result = {
      navBefore: nav.getBoundingClientRect().bottom <= article.getBoundingClientRect().top + 1,
      sectionsShown: [...side.querySelectorAll('ol, h2')].some((el) => el.offsetParent !== null),
      actionAfter: action !== undefined && action.offsetParent !== null && action.getBoundingClientRect().top >= article.getBoundingClientRect().bottom - 1,
    }
    window.scrollTo(0, 2000)
    return result
  }, [NAV, SIDE])
  await sleep(200)
  const scrolled = await m.page.evaluate((sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0), NAV)
  j.report('U5b', narrow !== null && narrow.navBefore && !narrow.sectionsShown && narrow.actionAfter && scrolled < 0, `좁은 화면: 장 목록이 본문 앞이고 따라오지 않는다, 꼭지는 빼고 단추는 본문 뒤 — ${JSON.stringify(narrow)}, 2000px 내린 뒤 장 목록 아래 끝 ${scrolled}`)
  await m.close()
})

await j.run('U6', async () => {
  const t = await j.open({ width: 1440, height: 900 })
  const seen = []
  for (const c of ready) {
    for (const path of [...new Set([pathOf(c), `/guide/${c.id}`])]) {
      await t.goto(path, 1200)
      const got = await t.page.evaluate((sel) => ({ path: location.pathname, title: document.getElementById('guide-chapter-title')?.textContent.trim(),
        current: document.querySelector(`${sel} a[aria-current="page"]`)?.textContent.replace(/\s+/g, ' ').trim(),
        menu: document.querySelector('header nav a[aria-current="page"]')?.dataset.label, doc: document.title }), NAV)
      seen.push({ want: c, asked: path, ...got })
    }
  }
  const bad = seen.filter((s) => s.path !== s.asked || s.title !== s.want.title || s.current !== `${s.want.number} ${s.want.name}` || s.menu !== '사용설명서' || !s.doc.startsWith(`${s.want.name} 사용설명서`))
  j.report('U6a', bad.length === 0, `장마다 주소·제목·지금 장·머리글 메뉴·탭 제목 — ${seen.map((s) => `${s.path} "${s.doc}"`).join(', ')}${bad.length ? '\n    틀림 ' + JSON.stringify(bad.map((b) => `${b.asked} → ${b.path} "${b.title}" ${b.current} ${b.menu}`)) : ''}`)
  const paths = []
  for (const path of ['/guide/nope', ...chapters.filter((c) => c.file === null).map((c) => `/guide/${c.id}`)]) {
    await t.goto(path, 1000)
    paths.push(await t.page.evaluate(() => location.pathname + ' ' + (document.getElementById('guide-chapter-title')?.textContent.trim() ?? '')))
  }
  j.report('U6b', paths.every((p) => p === `/guide ${first.title}`), `없는 장(·글 없는 장)은 /guide로 — ${JSON.stringify(paths)}`)
  await t.goto('/', 1200)
  await t.page.locator('header nav a[data-label="사용설명서"]').click()
  await sleep(1200)
  const viaMenu = await t.page.evaluate(() => location.pathname + ' ' + (document.getElementById('guide-chapter-title')?.textContent.trim() ?? ''))
  j.report('U6c', viaMenu === `/guide ${first.title}`, `머리글 메뉴로 오면 주소를 바꾸지 않고(/guide) 첫 장이 선다 — ${viaMenu}`)
  await t.close()
})

await j.run('U7', async () => {
  const over = []
  const wrapped = []
  const skips = []
  for (const c of ready) {
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      const t = await openGuide({ width, height: 900 }, pathOf(c))
      if (!(await noOverflow(t.page))) over.push(`${c.number}장 ${width}: ${await t.page.evaluate(() => document.documentElement.scrollWidth)}`)
      if (width === 390) {
        wrapped.push(...(await t.page.evaluate(() => [...document.querySelectorAll('main article table')]
          .filter((table) => table.querySelectorAll('thead th').length === 2)
          .flatMap((table) => [...table.querySelectorAll('tbody td:first-child')])
          .filter((td) => { const r = document.createRange(); r.selectNodeContents(td); return r.getBoundingClientRect().height > 30 })
          .map((td) => td.textContent.trim()))).map((s) => `${c.number}장 ${s}`))
      }
      if (width === 1440) {
        const levels = await t.page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map((h) => Number(h.tagName[1])))
        if (levels[0] !== 1 || levels.filter((l) => l === 1).length !== 1 || levels.some((level, i) => i > 0 && level > levels[i - 1] + 1)) skips.push(`${c.number}장 ${levels.join('')}`)
        if (c === first) {
          const short = await t.page.evaluate((sels) => sels.flatMap((sel) => [...document.querySelectorAll(`${sel} a`)]).filter((a) => a.getBoundingClientRect().height < 40).map((a) => `${a.textContent.trim().slice(0, 12)} ${Math.round(a.getBoundingClientRect().height)}px`), [NAV, SIDE])
          j.report('U7d', short.length === 0, `넓은 화면 장 목록·"이 장에서" 링크가 모두 40px 이상 — 모자란 것 ${JSON.stringify(short)}`)
        }
      }
      await t.close()
    }
  }
  j.report('U7a', over.length === 0, `가로 넘침 없음(장마다 320·390·768·1024·1440·1920)${over.length ? ' — ' + over.join(', ') : ''}`)
  j.report('U7b', wrapped.length === 0, `390px 두 칸 표의 첫 칸이 한 줄 — 꺾인 칸 ${JSON.stringify(wrapped)}`)
  j.report('U7c', skips.length === 0, `장마다 h1 하나, 제목 단계를 건너뛰지 않는다${skips.length ? ' — ' + skips.join(' / ') : ''}`)
})

await j.run('U8', async () => {
  if (ready.length < 2) { j.report('U8', null, '글이 있는 장이 하나라 장 넘기기가 없다'); return }
  const pager = (page) => page.evaluate(() => [...document.querySelectorAll('nav[aria-label="장 넘기기"] a')].map((a) => `${a.getAttribute('rel')} ${a.getAttribute('href')}`))
  const t = await openGuide()
  const atFirst = await pager(t.page)
  const last = ready[ready.length - 1]
  j.report('U8a', JSON.stringify(atFirst) === JSON.stringify([`next ${pathOf(ready[1])}`]), `첫 장은 다음 장만 — ${JSON.stringify(atFirst)}`)
  await t.page.locator('nav[aria-label="장 넘기기"] a[rel="next"]').scrollIntoViewIfNeeded()
  await t.page.locator('nav[aria-label="장 넘기기"] a[rel="next"]').click()
  await sleep(1200)
  const moved = await t.page.evaluate(() => ({ path: location.pathname, y: Math.round(scrollY), title: document.getElementById('guide-chapter-title')?.textContent.trim() }))
  j.report('U8b', moved.path === pathOf(ready[1]) && moved.y === 0 && moved.title === ready[1].title, `다음 장을 누르면 그 장 맨 위 — ${JSON.stringify(moved)}`)
  await t.goto(pathOf(last), 1200)
  const atLast = await pager(t.page)
  j.report('U8c', JSON.stringify(atLast) === JSON.stringify([`prev ${pathOf(ready[ready.length - 2])}`]), `끝 장은 이전 장만 — ${JSON.stringify(atLast)}`)
  await t.close()
})

await j.run('U9', async () => {
  const bad = []
  const seen = []
  for (const width of [1280, 1440, 1800, 1920]) {
    const t = await openGuide({ width, height: 900 })
    const g = await t.page.evaluate(([navSel, sideSel]) => {
      const box = (el) => el?.getBoundingClientRect() ?? null
      const h1 = box(document.querySelector('main h1')), nav = box(document.querySelector(navSel)), side = box(document.querySelector(sideSel)), article = box(document.querySelector('main article'))
      if ([h1, nav, side, article].includes(null)) return null
      return { h1: [h1.left, h1.right], nav: [nav.left, nav.right, nav.top], side: [side.left, side.right, side.top], article: [article.left, article.right, article.top], width: article.width }
    }, [NAV, SIDE])
    if (g === null) { bad.push(`${width}: 세 열을 못 찾음`); await t.close(); continue }
    const gapL = g.article[0] - g.nav[1], gapR = g.side[0] - g.article[1]
    seen.push(`${width}: 사이 ${Math.round(gapL)}·${Math.round(gapR)}, 본문 ${Math.round(g.width)}`)
    if (Math.abs(g.nav[0] - g.h1[0]) > 1 || Math.abs(g.side[1] - g.h1[1]) > 1) bad.push(`${width}: 양 끝이 화면 제목과 다름 ${JSON.stringify(g)}`)
    if (Math.abs(g.nav[2] - g.article[2]) > 1 || Math.abs(g.side[2] - g.article[2]) > 1) bad.push(`${width}: 세 열 위 끝이 다름`)
    if (Math.abs(gapL - gapR) > 2 || gapL > 200 || g.width > 760.5) bad.push(`${width}: 본문이 가운데가 아니거나 사이가 넓다 — ${Math.round(gapL)}·${Math.round(gapR)}, 본문 ${Math.round(g.width)}`)
    await t.close()
  }
  j.report('U9a', bad.length === 0, `세 열(1280~1920): 장 목록·"이 장에서"가 화면 제목 양 끝, 본문이 가운데 — ${seen.join(' / ')}${bad.length ? '\n    ' + bad.join('\n    ') : ''}`)

  const mid = await openGuide({ width: 1100, height: 900 })
  const two = await mid.page.evaluate(([navSel, sideSel]) => {
    const nav = document.querySelector(navSel).getBoundingClientRect(), side = document.querySelector(sideSel).getBoundingClientRect(), article = document.querySelector('main article').getBoundingClientRect()
    return { sideBelowNav: side.top >= nav.bottom, sameColumn: Math.abs(side.left - nav.left) < 1, articleRight: article.left > nav.right }
  }, [NAV, SIDE])
  j.report('U9b', two.sideBelowNav && two.sameColumn && two.articleRight, `1100px 두 열: "이 장에서"가 장 목록 아래, 본문은 오른쪽 — ${JSON.stringify(two)}`)
  await mid.close()

  const rules = []
  for (const c of ready) {
    const t = await openGuide({}, pathOf(c))
    const thick = await t.page.evaluate(() => [...document.querySelectorAll('main article *')].filter((el) => ['Top', 'Bottom'].some((side) => parseFloat(getComputedStyle(el)[`border${side}Width`]) >= 2)).map((el) => el.tagName.toLowerCase() + ' ' + el.textContent.trim().slice(0, 12)))
    if (thick.length > 0) rules.push(`${c.number}장 ${JSON.stringify(thick.slice(0, 4))}`)
    await t.close()
  }
  j.report('U9c', rules.length === 0, `본문 글 안에 굵은 먹 선이 없다(장 제목·꼭지 모두)${rules.length ? ' — ' + rules.join(' / ') : ''}`)
})

await j.run('U10', async () => {
  const bad = []
  for (const c of ready) {
    for (const width of [1440, 390]) {
      const t = await openGuide({ width, height: 900 }, pathOf(c))
      const a = await t.page.evaluate((sel) => {
        const link = [...document.querySelectorAll(`${sel} a`)].find((el) => !el.closest('ol'))
        return link === undefined ? null : { href: link.getAttribute('href'), text: link.textContent.trim(), shown: link.offsetParent !== null, h: Math.round(link.getBoundingClientRect().height) }
      }, SIDE)
      if (a === null || a.href !== c.action.to || a.text !== c.action.label || !a.shown || a.h < 40) bad.push(`${c.number}장 ${width}: ${JSON.stringify(a)}`)
      await t.close()
    }
  }
  j.report('U10', bad.length === 0, `장마다 "이 장에서" 단추가 그 기능 화면으로(${ready.map((c) => `${c.action.label} → ${c.action.to}`).join(', ')}), 넓은·좁은 화면 모두 보인다${bad.length ? '\n    ' + bad.join('\n    ') : ''}`)
})

await j.finish()
