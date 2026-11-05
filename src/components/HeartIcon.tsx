/**
 * 관심종목 하트(18px). 채우면 담긴 것이고, 색은 글자색을 따른다(놓이는 단추가 정한다 — 빨강은 상승으로 읽혀 쓰지 않는다).
 * 홈 시세표·종목 상세 관심종목 토글·주식 모아보기 목록이 같이 쓴다.
 * 이름은 단추가 갖고(aria-label) 그림은 읽히지 않는다
 */
export default function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M12 20.3 4.1 12.4a4.9 4.9 0 0 1 6.9-6.9l1 1 1-1a4.9 4.9 0 0 1 6.9 6.9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
