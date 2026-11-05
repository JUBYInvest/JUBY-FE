import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import styles from './SectionBoundary.module.css'

interface Props {
  children: ReactNode
  /** 이 값이 바뀌면 오류 상태를 푼다. 마이페이지처럼 껍데기는 남고 안쪽만 바뀌는 곳에 쓴다 */
  resetKey?: string
  /**
   * '다시 시도'에 붙일 일. 보통 그 구역의 데이터를 다시 받는다.
   * 없으면 구역을 다시 그리기만 한다 — 안쪽이 마운트될 때 스스로 불러오는 경우엔 그걸로 충분하다.
   */
  onRetry?: () => void
  /** 멈추면 안내 없이 그 자리를 비운다. 없어도 되는 구역(아래 지수 띠)에 쓴다 */
  quiet?: boolean
}

interface State {
  hasError: boolean
  resetKey: string | undefined
}

/**
 * 화면 안의 한 구역만 받아내는 경계.
 *
 * 화면 단위 경계(ErrorBoundary)만 있으면 표 한 줄을 그리다 난 오류가 입력 폼·사이드바·
 * 로그아웃 버튼까지 지우고 화면 전체를 오류 화면으로 바꾼다.
 * 이 경계로 감싼 구역은 그 자리만 안내로 바뀌고 나머지는 그대로 쓸 수 있다.
 *
 * 화면 단위 경계와 달리 '다시 시도'가 페이지를 새로 받지 않는다. 여기 걸리는 건
 * 화면 묶음을 못 받은 경우가 아니라 받은 데이터를 그리다 난 오류라서다.
 */
export default class SectionBoundary extends Component<Props, State> {
  state: State = { hasError: false, resetKey: this.props.resetKey }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetKey === state.resetKey) return null
    return { hasError: false, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('화면의 한 구역을 그리다 멈췄습니다', error, info.componentStack)
  }

  private retry = () => {
    this.setState({ hasError: false })
    this.props.onRetry?.()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    if (this.props.quiet === true) return null

    return (
      <div className={styles.wrap} role="alert">
        <p className={styles.text}>이 부분을 표시하지 못했어요.</p>
        <button type="button" className={styles.retry} onClick={this.retry}>
          다시 시도
        </button>
      </div>
    )
  }
}
