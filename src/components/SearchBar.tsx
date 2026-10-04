import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { rankStocks, searchStocks, searchStocksRemote } from '../api/stock'
import { toPreviewState } from '../utils/stockPreview'
import type { StockInfo } from '../types/stock'
import styles from './SearchBar.module.css'

/** 글자를 멈춘 뒤 서버에 묻기까지 기다리는 시간 */
const SEARCH_DEBOUNCE = 250

interface Props {
  /** 검색 대상. 홈이 GET /api/stocks 로 받은 목록을 넘긴다(도착 전엔 로컬 사본) */
  stocks: StockInfo[]
}

export default function SearchBar({ stocks }: Props) {
  const [keyword, setKeyword] = useState('')
  const [suggestions, setSuggestions] = useState<StockInfo[]>([])
  /** 화살표로 고른 후보. -1이면 아직 아무것도 안 골랐다 */
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  /*
   * 후보를 두 번 그린다.
   *
   * ① 가진 목록으로 즉시. 서버를 기다리면 글자를 칠 때마다 목록이 늦게 따라와 답답하다.
   * ② 서버 검색(GET /api/stocks/search)이 오면 그것으로 바꾼다. 홈이 받아 둔 100종목 밖도
   *    찾을 수 있다.
   *
   * 서버가 늦거나 실패해도 ①이 남아 있어 검색은 멈추지 않는다.
   */
  useEffect(() => {
    const trimmed = keyword.trim()
    setActiveIndex(-1)

    if (trimmed === '') {
      setSuggestions([])
      return
    }

    setSuggestions(searchStocks(stocks, trimmed))

    /*
     * 글자마다 부르면 "삼성전자"에 다섯 번이 나간다. 잠깐 멈춘 뒤에만 보낸다.
     * cancelled는 늦게 온 응답이 새 글자의 후보를 덮어쓰는 걸 막는다 — 응답 순서는 보낸 순서와 다르다.
     */
    let cancelled = false
    const timer = setTimeout(() => {
      searchStocksRemote(trimmed)
        .then((found) => {
          if (cancelled) return
          setSuggestions(rankStocks(found, trimmed, stocks))
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
  }, [keyword, stocks])

  function goTo(stock: StockInfo) {
    setIsOpen(false)
    setMessage('')
    // 후보 목록에는 기준일이 없어 이름만 싣는다
    navigate(`/stocks/${stock.stockCode}`, {
      state: toPreviewState({ stockCode: stock.stockCode, stockName: stock.stockName }),
    })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (keyword.trim() === '') {
      // 빈 칸으로 누르면 아무 일도 없던 것처럼 보였다. 무엇을 하면 되는지 알리고 입력칸으로 보낸다
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
      setIsOpen(false)
      return
    }

    if (suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) => (index + 1) % suggestions.length)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      )
    }
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    // 후보 버튼으로 포커스가 옮겨간 것뿐이면 닫지 않는다
    if (event.currentTarget.contains(event.relatedTarget)) return
    setIsOpen(false)
  }

  const isListVisible = isOpen && suggestions.length > 0
  /*
   * 화살표로 후보를 옮겨도 포커스는 입력칸에 남는다. 그래서 지금 어느 후보에 있는지
   * 눈으로는 배경색으로 알지만 보조기기는 알 길이 없다. 그 하나를 id로 가리켜 알려 준다.
   */
  const activeOptionId =
    isListVisible && activeIndex >= 0 ? `stock-suggestion-${activeIndex}` : undefined

  return (
    <form className={styles.form} onSubmit={handleSubmit} onBlur={handleBlur}>
      <div className={styles.box}>
        <input
          ref={inputRef}
          className={styles.input}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            setIsOpen(true)
            setMessage('')
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="관심종목을 입력해주세요 (예 : 삼성전자)"
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
        <ul className={styles.list} id="stock-suggestions" role="listbox">
          {suggestions.map((stock, index) => (
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
      )}

      {message !== '' && <p className={styles.message}>{message}</p>}
    </form>
  )
}
