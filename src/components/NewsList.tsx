import { useEffect, useRef, useState } from 'react'
import { NEWS_LAST_PAGE, NEWS_PAGE_SIZE, getStockNews } from '../api/stock'
import type { NewsItem, NewsSort } from '../types/news'
import styles from './NewsList.module.css'

const TABS: { key: NewsSort; label: string }[] = [
  { key: 'LATEST', label: '최신순' },
  { key: 'RELEVANCE', label: '관련도순' },
]

interface Props {
  stockCode: string
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
 * 10건씩 오고 page는 0~9까지라 최대 100건이다.
 */
export default function NewsList({ stockCode }: Props) {
  const [sort, setSort] = useState<NewsSort>('LATEST')
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  /** 더 보기가 실패했다. 받아 둔 목록은 두고 목록 끝에 알린 뒤 버튼을 다시 누르게 한다 */
  const [moreFailed, setMoreFailed] = useState(false)
  /** 첫 페이지 '다시 시도'. 올리면 아래 effect가 다시 돈다 */
  const [retryCount, setRetryCount] = useState(0)
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
    } catch (error: unknown) {
      if (seq !== listSeqRef.current) return
      console.warn('뉴스 더 보기 실패', error)
      setMoreFailed(true)
    } finally {
      // 새 목록의 버튼 상태는 새 목록 것이다. 거기서 누른 더 보기가 오는 중일 수 있다
      if (seq === listSeqRef.current) setIsLoadingMore(false)
    }
  }

  const hasMore =
    state.kind === 'ready' &&
    state.page < NEWS_LAST_PAGE &&
    (state.totalCount === null
      ? state.lastReceived >= NEWS_PAGE_SIZE
      : state.received < state.totalCount)

  return (
    <>
      <div className={styles.headingRow}>
        <h2 className={styles.heading}>뉴스 모아보기</h2>

        <div className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={
                sort === tab.key ? `${styles.tab} ${styles.tabActive}` : styles.tab
              }
              onClick={() => setSort(tab.key)}
              aria-pressed={sort === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/*
        기사 카드와 같은 모양의 뼈대. 한 줄짜리 "불러오는 중…"만 두면 목록 자리가 비어 있다가
        기사가 오는 순간 아래가 한꺼번에 밀린다. 읽어 주는 글은 남겨 둔다.
      */}
      {state.kind === 'loading' && (
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
      {state.kind === 'error' && (
        <div className={styles.errorBox}>
          <p className={styles.errorText}>뉴스를 불러오지 못했습니다.</p>
          <button
            type="button"
            className={styles.errorRetry}
            onClick={() => setRetryCount((count) => count + 1)}
          >
            다시 시도
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.items.length === 0 && (
        <p className={styles.empty}>관련 뉴스를 찾지 못했습니다.</p>
      )}

      {state.kind === 'ready' && (
        <ul className={styles.list}>
          {state.items.map((item, index) => (
            // 같은 기사가 두 페이지에 걸쳐 올 수 있어 링크만으로는 키가 겹친다
            <li key={`${index}-${item.link}`}>
              <a
                className={styles.card}
                href={item.link}
                target="_blank"
                rel="noreferrer"
              >
                <p className={styles.meta}>
                  {item.source}
                  <span className={styles.dot}>·</span>
                  {item.timeAgo}
                </p>
                <p className={styles.title}>{item.title}</p>
                <p className={styles.description}>{item.description}</p>
              </a>
            </li>
          ))}
        </ul>
      )}

      {moreFailed && (
        <p className={styles.moreFailed} role="status">
          더 불러오지 못했어요. 아래 버튼을 다시 눌러 주세요.
        </p>
      )}

      {hasMore && (
        <button
          type="button"
          className={styles.more}
          onClick={() => void loadMore()}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '불러오는 중…' : '뉴스 더 보기'}
        </button>
      )}
    </>
  )
}
