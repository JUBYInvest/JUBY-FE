import type { NewsItem } from '../types/news'
import styles from './NewsList.module.css'

/**
 * 기사 한 건(출처·몇 시간 전 / 제목 / 요약). 새 창으로 연다(링크는 api가 http·https만 남긴 것 — utils/link safeLink).
 * 종목 상세 뉴스(NewsList)·기사 검색하기(NewsAsk)·주식 모아보기 관심종목 뉴스(KeywordNews)가 같이 쓴다 —
 * 세 곳에 같은 마크업이 따로 적혀 있었다(2026-11-03). 목록(`ul`·`li`)과 펼치는 개수는 부르는 쪽이 정한다
 */
export default function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a className={styles.card} href={item.link} target="_blank" rel="noreferrer">
      <p className={styles.meta}>
        <span className={styles.source}>{item.source}</span>
        <span>{item.timeAgo}</span>
      </p>
      <p className={styles.title}>{item.title}</p>
      <p className={styles.description}>{item.description}</p>
    </a>
  )
}
