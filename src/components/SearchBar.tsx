import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { rankStocks, searchStocks, searchStocksRemote } from '../api/search'
import { forgetRecentStocks, readRecentStocks } from '../utils/recentStocks'
import { toPreviewState } from '../utils/stockPreview'
import type { StockInfo } from '../types/stock'
import styles from './SearchBar.module.css'

/** 글자를 멈춘 뒤 서버에 묻기까지 기다리는 시간 */
const SEARCH_DEBOUNCE = 250

interface Props {
  /** 검색 대상. 홈이 GET /api/stocks 로 받은 목록을 넘긴다(도착 전엔 로컬 사본) */
  stocks: StockInfo[]
  /** 고른 종목을 받는다. 없으면 그 종목 상세로 간다(홈). 커뮤니티는 그 종목 글만 보이게 쓴다 */
  onPick?: (stock: StockInfo) => void
  /** 칸이 열리자마자 입력칸에 포커스(커뮤니티 "종목 검색" 단추로 여는 칸) */
  autoFocus?: boolean
  placeholder?: string
  /** 후보 목록이 닫힌 채 Esc를 누르면 — 단추로 연 칸을 닫는 쪽이 받는다 */
  onDismiss?: () => void
}

export default function SearchBar({
  stocks,
  onPick,
  autoFocus = false,
  placeholder = '종목명이나 종목코드로 검색 (예: 삼성전자)',
  onDismiss,
}: Props) {
  const [keyword, setKeyword] = useState('')
  const [suggestions, setSuggestions] = useState<StockInfo[]>([])
  /** 화살표로 고른 후보. -1이면 아직 아무것도 안 골랐다 */
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  /**
   * 최근 본 종목(utils/recentStocks.ts). 입력칸이 비어 있을 때 후보 자리에 보인다 — 다시 찾는 종목을 치지 않고 고른다.
   * 다른 탭에서 상세를 봤을 수 있어 입력칸을 누를 때마다 다시 읽는다
   */
  const [recent, setRecent] = useState(readRecentStocks)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  /** 서버 검색이 마지막으로 찾아 준 것. 그 사이 가진 목록(stocks)이 바뀌어도 다시 합치려고 들고 있는다 */
  const remoteRef = useRef<{ keyword: string; found: StockInfo[] } | null>(null)
  const stocksRef = useRef(stocks)
  stocksRef.current = stocks

  /** 가진 목록과 서버 결과를 합친다. 같은 종목이 양쪽에 있으면 하나만 남긴다 */
  function merge(trimmed: string, own: StockInfo[], found: StockInfo[]): StockInfo[] {
    const merged = new Map<string, StockInfo>()
    for (const stock of [...searchStocks(own, trimmed), ...found]) {
      if (!merged.has(stock.stockCode)) merged.set(stock.stockCode, stock)
    }
    return rankStocks([...merged.values()], trimmed, own)
  }

  /*
   * 후보를 두 번 그린다.
   *
   * ① 가진 목록으로 즉시. 서버를 기다리면 글자를 칠 때마다 목록이 늦게 따라와 답답하다.
   * ② 서버 검색(GET /api/stocks/search)이 오면 ①과 **합친다**. 홈이 받아 둔 100종목 밖도
   *    찾을 수 있다.
   *
   * 바꾸지 않고 합치는 이유: 서버는 종목명만 찾는다. 종목코드("005930")와 띄어쓴 이름
   * ("sk 하이닉스")은 0건이라, 서버 결과로 바꾸면 ①에서 뜬 후보가 0.3초 뒤 사라진다.
   *
   * 서버가 늦거나 실패해도 ①이 남아 있어 검색은 멈추지 않는다.
   * ①과 ②는 effect가 따로다 — 한 effect에 두면 홈 목록이 도착할 때(stocks가 바뀔 때) 같은 글자로 서버 검색이 한 번 더 나간다
   */
  useEffect(() => {
    const trimmed = keyword.trim()
    setActiveIndex(-1)
    if (trimmed === '') {
      setSuggestions([])
      return
    }
    const remote = remoteRef.current
    setSuggestions(merge(trimmed, stocks, remote !== null && remote.keyword === trimmed ? remote.found : []))
    // merge는 렌더마다 새 함수지만 stocks·keyword 말고는 읽지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, stocks])

  useEffect(() => {
    const trimmed = keyword.trim()
    if (trimmed === '') return

    /*
     * 글자마다 부르면 "삼성전자"에 다섯 번이 나간다. 잠깐 멈춘 뒤에만 보낸다.
     * cancelled는 늦게 온 응답이 새 글자의 후보를 덮어쓰는 걸 막는다 — 응답 순서는 보낸 순서와 다르다.
     */
    let cancelled = false
    const timer = setTimeout(() => {
      searchStocksRemote(trimmed)
        .then((found) => {
          if (cancelled) return
          remoteRef.current = { keyword: trimmed, found }
          setSuggestions(merge(trimmed, stocksRef.current, found))
        })
        .catch((error: unknown) => {
          // 가진 목록으로 그린 후보가 그대로 남는다. 화면에는 알리지 않는다
          console.warn('종목 검색 실패. 가진 목록으로 찾습니다', error)
        })
    }, SEARCH_DEBOUNCE)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // 서버 검색은 글자가 바뀔 때만. 가진 목록은 ref로 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword])

  function goTo(stock: StockInfo) {
    setIsOpen(false)
    setMessage('')
    if (onPick !== undefined) {
      onPick(stock)
      return
    }
    // 후보 목록에는 기준일이 없어 이름만 싣는다
    navigate(`/stocks/${stock.stockCode}`, {
      state: toPreviewState({ stockCode: stock.stockCode, stockName: stock.stockName }),
    })
  }

  const isEmpty = keyword.trim() === ''
  /** 지금 보이는 후보. 비어 있으면 최근 본 종목, 아니면 검색 결과 */
  const options = isEmpty ? recent : suggestions

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isEmpty) {
      // 최근 본 종목을 방향키로 골랐으면 그리로 간다
      const picked = activeIndex >= 0 ? recent[activeIndex] : undefined
      if (picked !== undefined) {
        goTo(picked)
        return
      }
      // 빈 칸으로 누르면 아무 일도 없던 것처럼 보이니, 무엇을 하면 되는지 알리고 입력칸으로 보낸다
      setMessage('종목명을 입력해주세요')
      inputRef.current?.focus()
      return
    }

    // 화살표로 고른 게 있으면 그것, 없으면 가장 잘 맞는 첫 후보로 간다
    const target = suggestions[activeIndex >= 0 ? activeIndex : 0]
    if (target === undefined) {
      setMessage('해당 종목을 찾을 수 없습니다')
      return
    }

    goTo(target)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (!isListVisible) onDismiss?.()
      setIsOpen(false)
      return
    }

    if (options.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) => (index + 1) % options.length)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) =>
        index <= 0 ? options.length - 1 : index - 1,
      )
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    // 후보 버튼으로 포커스가 옮겨간 것뿐이면 닫지 않는다
    if (event.currentTarget.contains(event.relatedTarget)) return
    setIsOpen(false)
  }

  function clearRecent() {
    forgetRecentStocks()
    setRecent([])
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  const isListVisible = isOpen && options.length > 0
  /*
   * 화살표로 후보를 옮겨도 포커스는 입력칸에 남는다. 그래서 지금 어느 후보에 있는지
   * 눈으로는 배경색으로 알지만 보조기기는 알 길이 없다. 그 하나를 id로 가리켜 알려 준다.
   */
  const activeOptionId =
    isListVisible && activeIndex >= 0 ? `stock-suggestion-${activeIndex}` : undefined

  return (
    <form className={styles.form} onSubmit={handleSubmit} onBlur={handleBlur}>
      <div className={styles.box}>
        <svg className={styles.icon} width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
          <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          className={styles.input}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setIsOpen(true)
            setMessage('')
          }}
          onFocus={() => {
            setRecent(readRecentStocks())
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          // 사용자가 단추를 눌러 연 칸에서만 켠다(커뮤니티 "종목 검색")
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={isListVisible}
          aria-controls="stock-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
        />
        <button type="submit" className={styles.button}>
          검색
        </button>
      </div>

      {isListVisible && (
        <div className={styles.list}>
          {isEmpty && (
            <div className={styles.listHead}>
              <span id="recent-stocks-title" className={styles.listTitle}>
                최근 본 종목
              </span>
              <button
                type="button"
                className={styles.clear}
                // 눌리기 전에 입력칸이 포커스를 잃으면 목록이 먼저 닫혀 클릭이 사라진다
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearRecent}
              >
                기록 지우기
              </button>
            </div>
          )}
        <ul
          className={styles.options}
          id="stock-suggestions"
          role="listbox"
          aria-labelledby={isEmpty ? 'recent-stocks-title' : undefined}
          aria-label={isEmpty ? undefined : '검색 결과'}
        >
          {options.map((stock, index) => (
            <li
              key={stock.stockCode}
              // 입력칸의 aria-activedescendant가 이 id를 가리킨다
              id={`stock-suggestion-${index}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                className={
                  index === activeIndex
                    ? `${styles.option} ${styles.optionActive}`
                    : styles.option
                }
                // 눌리기 전에 input이 포커스를 잃으면 목록이 먼저 닫혀 클릭이 사라진다
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => goTo(stock)}
              >
                <span className={styles.optionName}>{stock.stockName}</span>
                <span className={styles.optionCode}>{stock.stockCode}</span>
              </button>
            </li>
          ))}
        </ul>
        </div>
      )}

      {message !== '' && <p className={styles.message}>{message}</p>}
    </form>
  )
}
