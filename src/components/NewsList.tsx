import { useEffect, useRef, useState } from 'react'
import { NEWS_LAST_PAGE, NEWS_PAGE_SIZE, getStockNews } from '../api/news'
import NewsAsk from './NewsAsk'
import NewsCard from './NewsCard'
import Spinner from './Spinner'
import type { NewsItem, NewsSort } from '../types/news'
import styles from './NewsList.module.css'

const TABS: { key: NewsSort; label: string }[] = [
  { key: 'LATEST', label: '최신순' },
  { key: 'RELEVANCE', label: '관련도순' },
]

/**
 * 한 번에 펼치는 기사 수. 서버는 10건씩 주지만 10건을 다 펼치면 뉴스가 1,600px 남짓이라 첫 화면에 한 건도 안 보인다.
 * 받아 둔 기사가 남았으면 '뉴스 더 보기'가 서버에 묻지 않고 더 펼친다 — 요청 수는 그대로다.
 * 짝수다 — 넓은 칸에서는 두 줄로 서서 둘씩 짝짓는다(NewsList.module.css). 홀수면 끝 기사가 홀로 남는다
 */
const NEWS_STEP = 6

interface Props {
  stockCode: string
  /** 종목명. 아직 모르면 null — '기사 검색하기' 탭을 두지 않는다(서버가 종목명으로 찾는다) */
  stockName: string | null
}

type State =
  | { kind: 'loading' }
  | {
      kind: 'ready'
      items: NewsItem[]
      page: number
      /** 서버가 비워 주면 null — 그때는 마지막으로 받은 페이지가 꽉 찼는지로 가린다 */
      totalCount: number | null
      /** 지금까지 서버가 준 기사 수(거르기 전). 마지막 페이지 판단에 쓴다 */
      received: number
      /** 마지막으로 받은 페이지의 기사 수(거르기 전) */
      lastReceived: number
    }
  | { kind: 'error' }

/**
 * 종목 뉴스. 정렬과 더 보기를 이 안에서 처리한다.
 *
 * 정렬은 서버가 한다(`GET /api/stocks/{code}/news?sort=`). 최신순은 발행일 순,
 * 관련도순은 벡터 검색이 매긴 순서라 화면에서 흉내 낼 수 없어 탭을 바꾸면 다시 받는다.
 * 10건씩 오고 page는 0~9까지라 최대 100건이다. 화면에는 6건씩 펼친다(NEWS_STEP).
 */
export default function NewsList({ stockCode, stockName }: Props) {
  const [sort, setSort] = useState<NewsSort>('LATEST')
  /**
   * '기사 검색하기'(NewsAsk)를 펼쳤는가. 펼쳐도 정렬 목록은 받아 둔 채로 두어, 정렬 탭으로 돌아오면 다시 받지 않는다
   */
  const [asking, setAsking] = useState(false)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  /** 더 보기가 실패했다. 받아 둔 목록은 두고 목록 끝에 알린 뒤 버튼을 다시 누르게 한다 */
  const [moreFailed, setMoreFailed] = useState(false)
  /** 첫 페이지 '다시 시도'. 올리면 아래 effect가 다시 돈다 */
  const [retryCount, setRetryCount] = useState(0)
  /** 지금 펼친 기사 수. 받아 둔 기사(state.items)보다 적을 수 있다 */
  const [visibleCount, setVisibleCount] = useState(NEWS_STEP)
  /*
   * 목록 번호. 종목·정렬이 바뀌거나 첫 페이지를 다시 받을 때마다 올라간다.
   * 더 보기는 누른 순간의 번호를 들고 가서, 받아 왔을 때 번호가 달라져 있으면 버린다.
   * 안 그러면 최신순 2페이지가 관련도순 목록 뒤에 붙고, 그 실패가 새 목록에 뜬다.
   */
  const listSeqRef = useRef(0)

  // 종목이나 정렬이 바뀌면 첫 페이지부터 다시
  useEffect(() => {
    let isStale = false
    listSeqRef.current += 1
    setState({ kind: 'loading' })
    setVisibleCount(NEWS_STEP)
    setMoreFailed(false)
    // 앞 목록의 더 보기가 아직 오는 중이어도 새 목록의 버튼은 풀어 둔다
    setIsLoadingMore(false)

    getStockNews(stockCode, sort, 0)
      .then((result) => {
        if (isStale) return
        setState({
          kind: 'ready',
          items: result.items,
          page: 0,
          totalCount: result.totalCount,
          received: result.receivedCount,
          lastReceived: result.receivedCount,
        })
      })
      .catch((error: unknown) => {
        if (isStale) return
        console.warn('뉴스 조회 실패', error)
        setState({ kind: 'error' })
      })

    return () => {
      isStale = true
    }
  }, [stockCode, sort, retryCount])

  async function loadMore() {
    if (state.kind !== 'ready' || isLoadingMore) return
    // 받아 둔 기사가 남았으면 서버에 묻지 않고 더 펼친다
    if (visibleCount < state.items.length) {
      setVisibleCount((count) => count + NEWS_STEP)
      return
    }
    const seq = listSeqRef.current
    const nextPage = state.page + 1

    setIsLoadingMore(true)
    setMoreFailed(false)
    try {
      const result = await getStockNews(stockCode, sort, nextPage)
      // 받는 사이 종목이나 정렬이 바뀌었으면 이 페이지는 다른 목록의 것이다
      if (seq !== listSeqRef.current) return
      setState((current) =>
        current.kind === 'ready'
          ? {
              ...current,
              items: [...current.items, ...result.items],
              page: nextPage,
              totalCount: current.totalCount ?? result.totalCount,
              received: current.received + result.receivedCount,
              lastReceived: result.receivedCount,
            }
          : current,
      )
      setVisibleCount((count) => count + NEWS_STEP)
    } catch (error: unknown) {
      if (seq !== listSeqRef.current) return
      console.warn('뉴스 더 보기 실패', error)
      setMoreFailed(true)
    } finally {
      // 새 목록의 버튼 상태는 새 목록 것이다. 거기서 누른 더 보기가 오는 중일 수 있다
      if (seq === listSeqRef.current) setIsLoadingMore(false)
    }
  }

  /** 서버에 다음 페이지가 있는가 */
  const serverHasMore =
    state.kind === 'ready' &&
    state.page < NEWS_LAST_PAGE &&
    (state.totalCount === null
      ? state.lastReceived >= NEWS_PAGE_SIZE
      : state.received < state.totalCount)
  const hasMore = state.kind === 'ready' && (visibleCount < state.items.length || serverHasMore)

  return (
    <>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>뉴스 모아보기</h2>

        <div className={styles.tabs}>
          {TABS.map((tab) => {
            const active = !asking && sort === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                className={active ? styles.tabActive : styles.tab}
                onClick={() => {
                  setAsking(false)
                  setSort(tab.key)
                }}
                aria-pressed={active}
              >
                {tab.label}
              </button>
            )
          })}
          {stockName !== null && (
            <button
              type="button"
              className={asking ? styles.tabActive : styles.tab}
              onClick={() => setAsking(true)}
              aria-pressed={asking}
            >
              기사 검색하기
            </button>
          )}
        </div>
      </div>

      {/* 종목이 바뀌면 적던 질문과 결과를 버린다 */}
      {asking && stockName !== null && <NewsAsk key={stockCode} stockName={stockName} />}

      {/*
        기사 카드와 같은 모양의 뼈대. 한 줄짜리 "불러오는 중…"만 두면 목록 자리가 비어 있다가
        기사가 오는 순간 아래가 한꺼번에 밀린다. 읽어 주는 글은 남겨 둔다.
      */}
      {!asking && state.kind === 'loading' && (
        <div className={styles.list} aria-busy="true">
          <p className={styles.srOnly}>불러오는 중…</p>
          {[0, 1, 2].map((index) => (
            <div key={index} className={styles.newsSkeleton} aria-hidden="true">
              <span className={`${styles.bone} ${styles.boneMeta}`} />
              <span className={`${styles.bone} ${styles.boneTitle}`} />
              <span className={`${styles.bone} ${styles.boneLine}`} />
              <span className={`${styles.bone} ${styles.boneLineShort}`} />
            </div>
          ))}
        </div>
      )}

      {/* 실패는 목록 자리를 지키는 상자 안에 알리고, 빈 결과(아래)와 다른 문구로 둔다 */}
      {!asking && state.kind === 'error' && (
        <div className={styles.errorBox}>
          <p className={styles.errorText}>뉴스를 불러오지 못했습니다</p>
          <button
            type="button"
            className={styles.errorRetry}
            onClick={() => setRetryCount((count) => count + 1)}
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 첫 쪽이 모두 걸러졌어도 서버에 다음 쪽이 있으면 "찾지 못했다"고 하지 않는다 — 더 보기만 둔다 */}
      {!asking && state.kind === 'ready' && state.items.length === 0 && !hasMore && (
        <p className={styles.empty}>관련 뉴스를 찾지 못했습니다</p>
      )}

      {!asking && state.kind === 'ready' && (
        <ul className={styles.list}>
          {state.items.slice(0, visibleCount).map((item, index) => (
            // 같은 기사가 두 페이지에 걸쳐 올 수 있어 링크만으로는 키가 겹친다
            <li key={`${index}-${item.link}`}>
              <NewsCard item={item} />
            </li>
          ))}
        </ul>
      )}

      {!asking && moreFailed && (
        <p className={styles.moreFailed} role="status">
          더 불러오지 못했어요. 아래 버튼을 다시 눌러 주세요.
        </p>
      )}

      {!asking && hasMore && (
        <button
          type="button"
          className={styles.more}
          onClick={() => void loadMore()}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? (
            <>
              <Spinner size={18} /> 불러오는 중…
            </>
          ) : (
            '뉴스 더 보기'
          )}
        </button>
      )}
    </>
  )
}
