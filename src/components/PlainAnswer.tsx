import styles from './PlainAnswer.module.css'

/** 답변 렌더러를 받는 동안·못 받았을 때의 답변. 서식 없이 글자 그대로, 줄바꿈은 살린다 */
export default function PlainAnswer({ text }: { text: string }) {
  return <span className={styles.plain}>{text}</span>
}
