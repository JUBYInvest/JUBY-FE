/** GET /api/stocks/{code}/news 의 sort. 최신순 / 관련도순 */
export type NewsSort = 'LATEST' | 'RELEVANCE'

/** 화면에서 쓰기 좋게 바꾼 뉴스 한 건 */
export interface NewsItem {
  title: string
  description: string
  link: string
  /** 언론사명 필드가 없어 링크 도메인을 대신 쓴다 */
  source: string
  /** 서버가 계산해 준 "29일 전" 같은 문구 */
  timeAgo: string
  publishedAt: Date
}

/** 한 페이지. 서버는 10건씩 자르고 page는 0~9다 */
export interface NewsPage {
  items: NewsItem[]
  page: number
  /**
   * 후보 전체 개수(최대 100). 마지막 페이지 판단에 쓴다.
   * 서버가 비워 주면 null이다 — 그때는 꽉 찬 페이지(NEWS_PAGE_SIZE건)를 받았을 때만 더 있다고 본다
   */
  totalCount: number | null
  /**
   * 이 페이지에서 서버가 준 기사 수. 빈 기사를 거르기 전 개수다.
   * 마지막 페이지 판단은 이걸로 한다 — 거른 뒤의 개수로 totalCount와 견주면
   * 끝에 닿아도 모자라 보여 "더 보기"가 빈 페이지를 계속 부른다.
   */
  receivedCount: number
  sort: NewsSort
}
