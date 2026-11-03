import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ApiError } from '../api/client'
import { likeStock } from '../api/member'
import { useIsLoggedIn } from '../hooks/useIsLoggedIn'
import { loginPathFrom } from '../utils/navigation'
import type { StockInfo } from '../types/stock'
import styles from './LikeAddButton.module.css'

type Status = 'idle' | 'saving' | 'added' | 'already' | 'failed'

/**
 * '관심종목에 담기' 단추(백테스트 결과 아래). 담겼는지 미리 묻지 않는다 — 목록 GET을 하나 더 보내는 대신
 * 누를 때 등록을 보내고, 서버가 409(이미 등록됨)를 주면 "이미 담겨 있어요"로 받는다.
 * 빼기는 주식 모아보기와 종목 상세의 하트가 맡는다. 담은 뒤에는 주식 모아보기로 가는 링크를 둔다.
 */
export default function LikeAddButton({ stock }: { stock: StockInfo }) {
  const loggedIn = useIsLoggedIn()
  const { pathname } = useLocation()
  const [status, setStatus] = useState<Status>('idle')

  async function add() {
    if (status === 'saving') return
    setStatus('saving')
    try {
      await likeStock(stock.stockCode)
      setStatus('added')
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        setStatus('already')
        return
      }
      console.warn('관심종목 등록 실패', error)
      setStatus('failed')
    }
  }

  if (!loggedIn) {
    return (
      <Link to={loginPathFrom(pathname)} className={styles.button}>
        로그인하고 관심종목에 담기
      </Link>
    )
  }

  if (status === 'added' || status === 'already') {
    return (
      <p className={styles.done} role="status">
        {status === 'added' ? '관심종목에 담았어요.' : '이미 관심종목에 있어요.'}
        <Link to="/likes" className={styles.doneLink}>
          관심종목에서 보기
        </Link>
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => void add()}
        disabled={status === 'saving'}
      >
        {status === 'saving' ? '담는 중…' : '관심종목에 담기'}
      </button>
      {status === 'failed' && (
        <p className={styles.failed} role="status">
          담지 못했어요. 잠시 후 다시 눌러 주세요.
        </p>
      )}
    </>
  )
}
