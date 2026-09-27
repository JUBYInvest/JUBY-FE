import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, FormEvent, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchStocks } from '../api/stock'
import { toPreviewState } from '../utils/stockPreview'
import type { StockInfo } from '../types/stock'
import styles from './SearchBar.module.css'

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

  useEffect(() => {
    const trimmed = keyword.trim()
    setSuggestions(trimmed === '' ? [] : searchStocks(stocks, trimmed))
    setActiveIndex(-1)
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
