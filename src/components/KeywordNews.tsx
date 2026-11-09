import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { searchNews } from '../api/news'
import type { NewsItem } from '../types/news'
import NewsCard from './NewsCard'
import newsStyles from './NewsList.module.css'

/** 처음 보여 주는 기사 수와 "뉴스 더 보기" 한 번에 늘리는 수. 서버는 한 번에 20건을 준다 */
const STEP = 6

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; items: NewsItem[] }
  /** limited: 네이버 호출 한도(429) — 기다리면 된다고 알린다 */
  | { kind: 'error'; limited: boolean }

/**
 * 검색어(종목명)로 찾은 네이버 뉴스 목록(주식 모아보기의 관심종목 뉴스). 생김새는 종목 상세의 뉴스 목록과 같다(NewsList의 스타일을 그대로 쓴다).
 * 검색어가 바뀌면 새로 받고, 늦게 온 옛 검색어의 응답은 버린다. 같은 검색어는 api 쪽이 10분 동안 다시 쓴다.
 */
export default function KeywordNews({ query }: { query: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [visibleCount, setVisibleCount] = useState(STEP)
  const [retryCount, setRetryCount] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    seqRef.current += 1
    const seq = seqRef.current
    setState({ kind: 'loading' })
    setVisibleCount(STEP)
    searchNews(query)
      .then((items) => {
        if (seq === seqRef.current) setState({ kind: 'ready', items })
      })
      .catch((error: unknown) => {
        if (seq !== seqRef.current) return
        console.warn('네이버 뉴스 검색 실패', error)
        setState({ kind: 'error', limited: error instanceof ApiError && error.status === 429 })
      })
  }, [query, retryCount])

  if (state.kind === 'loading') {
    return (
      <div className={newsStyles.list} aria-busy="true">
        <p className={newsStyles.srOnly}>불러오는 중…</p>
        {[0, 1, 2].map((index) => (
          <div key={index} className={newsStyles.newsSkeleton} aria-hidden="true">
            <span className={`${newsStyles.bone} ${newsStyles.boneMeta}`} />
            <span className={`${newsStyles.bone} ${newsStyles.boneTitle}`} />
            <span className={`${newsStyles.bone} ${newsStyles.boneLine}`} />
          </div>
        ))}
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className={newsStyles.errorBox}>
        <p className={newsStyles.errorText}>
          {state.limited ? '뉴스 검색이 잠시 몰렸어요. 조금 뒤에 다시 시도해 주세요.' : '뉴스를 불러오지 못했어요'}
        </p>
        <button type="button" className={newsStyles.errorRetry} onClick={() => setRetryCount((count) => count + 1)}>
          다시 시도
        </button>
      </div>
    )
  }

  if (state.items.length === 0) {
    return <p className={newsStyles.empty}>{query} 뉴스를 찾지 못했어요</p>
  }

  return (
    <>
      {/* 6건씩 펼친다 — 넓은 칸에서 두 줄로 설 때 둘씩 짝이 맞는다(NewsList.module.css) */}
      <ul className={newsStyles.list}>
        {state.items.slice(0, visibleCount).map((item) => (
          <li key={item.link}>
            <NewsCard item={item} />
          </li>
        ))}
      </ul>
      {visibleCount < state.items.length && (
        <button type="button" className={newsStyles.more} onClick={() => setVisibleCount((count) => count + STEP)}>
          뉴스 더 보기
        </button>
      )}
    </>
  )
}
