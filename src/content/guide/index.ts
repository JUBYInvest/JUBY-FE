/*
 * 사용설명서의 장(章). 사용자가 노션에 쓴 글을 마크다운으로 내보내 이 폴더에 그대로 옮긴다(2026-11-03 — 3장을 먼저, 같은 날 1·2·4장).
 * - 여기 적은 순서가 차례 순서다. 글이 없는 장(markdown: null)은 차례에 "준비 중"으로만 서고 열리지 않는다.
 *   글이 있는 첫 장이 `/guide`이고, 나머지 장은 `/guide/<id>`다.
 * - 글 맨 앞의 "# 제목"은 화면이 구역 제목 줄에 따로 그린다. 노션 내보내기의 맨 첫 줄(문서 이름 "# 백테스트 설명서" 등)은 장 이름과 겹쳐 뺀다.
 *   "## 꼭지"가 차례에 걸린다. 제목 단계가 건너뛰어도(## 아래 바로 ####) 화면은 한 단계씩 내려 그린다(utils/guideMarkdown).
 * - 그림은 public/guide/<id>/에 두고 글에서 /guide/<id>/<이름>으로 부른다. 크기를 아래 GUIDE_IMAGE_SIZES에도 적는다 —
 *   그림이 오기 전에 자리를 잡아 아래 글이 밀리지 않는다. 노션이 붙이는 그림 이름(image.png)은 화면 읽기 프로그램이 그대로 읽으니
 *   그림을 설명하는 글로 바꾼다. 받은 PNG는 픽셀이 같은 무손실 WebP로 바꿔 둔다(백테스트 다섯 장 311KB → 84KB).
 */
import ai from './ai.md?raw'
import backtest from './backtest.md?raw'
import juby from './juby.md?raw'
import personality from './personality.md?raw'

interface GuideChapterSource {
  /** 주소 끝 `/guide/<id>`. 꼭지 id의 앞머리도 된다 */
  id: string
  /** 차례에 서는 장 이름 */
  name: string
  markdown: string | null
}

export const GUIDE_CHAPTERS: GuideChapterSource[] = [
  { id: 'juby', name: 'JUBY 소개', markdown: juby },
  { id: 'personality', name: '투자성향', markdown: personality },
  { id: 'backtest', name: '주식 백테스트', markdown: backtest },
  { id: 'ai', name: 'AI 투자 챗봇', markdown: ai },
]

export const GUIDE_IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  '/guide/backtest/rsi.webp': { width: 1344, height: 508 },
  '/guide/backtest/bollinger.webp': { width: 1344, height: 526 },
  '/guide/backtest/ma-cross.webp': { width: 1344, height: 472 },
  '/guide/backtest/macd.webp': { width: 1344, height: 472 },
  '/guide/backtest/breakout.webp': { width: 1344, height: 562 },
}
