import styles from './Spinner.module.css'

interface Props {
  /** 지름(px). 글줄 안은 16~18, 빈 자리 한가운데는 28 */
  size?: number
  /**
   * 읽어 주는 글. 주면 `role="status"`로 알리고, 없으면 옆 글이 이미 말하는 것으로 보고 보조기기에서 숨긴다
   * ("불러오는 중…" 글 옆에 두는 경우)
   */
  label?: string
  className?: string
}

/**
 * 기다리는 중 표시(2026-11-02). 자리의 크기를 아는 곳은 뼈대(skeleton.module.css)가 맡고, 크기를 모르거나 글 한 줄뿐인 자리
 * (시세표 불러오는 중, 로그인 중, 단추 안)에 이걸 둔다. 색은 글자색을 따른다 — 초록 단추 안에서는 흰색, 본문에서는 브랜드 초록.
 * 움직임을 줄인 설정에서는 돌지 않고 열린 고리로만 선다.
 */
export default function Spinner({ size = 20, label, className }: Props) {
  return (
    <span
      className={className === undefined ? styles.spinner : `${styles.spinner} ${className}`}
      style={{ width: size, height: size }}
      role={label === undefined ? undefined : 'status'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          // 둘레 56.5의 3/4만 그린다. 열린 자리가 도는 것으로 보인다
          strokeDasharray="42 56.5"
        />
      </svg>
    </span>
  )
}
