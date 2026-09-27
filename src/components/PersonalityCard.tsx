import type { ReactNode } from 'react'
import styles from './PersonalityCard.module.css'

interface Props {
  type: string
  description: string
  /** 비면 그림을 그리지 않는다. src=""는 지금 페이지를 다시 요청한다 */
  imageUrl: string
  /** 카드 아래 버튼. 결과 화면은 '검사 다시하기', 마이페이지는 다른 걸 넣는다 */
  children?: ReactNode
}

export default function PersonalityCard({
  type,
  description,
  imageUrl,
  children,
}: Props) {
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>당신의 투자성향은?</p>
      {/* 성향 이름이 바로 아래 글자로 나오므로 이미지에는 설명을 붙이지 않는다 */}
      {imageUrl !== '' && <img className={styles.image} src={imageUrl} alt="" />}
      <h2 className={styles.type}>{type}</h2>
      <p className={styles.description}>{description}</p>
      {children}
    </section>
  )
}
