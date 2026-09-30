import { post } from './client'
import { clearTokens } from '../utils/auth'

/**
 * 로그아웃. 서버에 알리고 브라우저에 남은 토큰을 지운다.
 *
 * 서버는 본문을 읽지 않고 요청에 실린 access token으로 처리한다 — 그 토큰을 막고(블랙리스트) 서버에 둔
 * refresh token을 지운 뒤 refresh token 쿠키를 지우라고 응답한다(`POST /api/auth/logout`, JUBY-BE dev `7e5b023`).
 *
 * 토큰이 만료됐으면 client.ts가 재발급해 한 번 다시 보낸다 — 만료된 토큰으로는 서버가 누구의 refresh token을 지울지 몰라
 * 14일짜리 refresh token이 서버에 남는다.
 *
 * 서버 요청이 실패해도 토큰은 지운다(finally). 사용자는 이미 나가겠다고 눌렀는데
 * 서버가 응답을 못 한다고 로그인 상태로 남겨두는 편이 더 위험하다.
 *
 * 화면 이동은 여기서 하지 않는다. 부르는 쪽이 navigate로 갈 곳을 정한다
 * (지금은 MypageLayout 사이드바의 버튼 하나뿐이고, 홈으로 보낸다).
 * 헤더는 토큰이 사라진 걸 구독으로 알아채고 스스로 '로그인'으로 돌아간다.
 */
export async function logout(): Promise<void> {
  try {
    await post(
      '/api/auth/logout',
      {},
      {
        // 토큰이 만료된 채 눌러도 로그인 화면이 아니라 부르는 쪽이 정한 곳으로 가야 한다
        ignoreUnauthorized: true,
        /*
         * 기본 12초는 여기서 너무 길다. 이 요청이 실패해도 아래 finally가 토큰을 지워
         * 결과는 똑같은데, 서버가 응답을 안 하면 그동안 버튼이 '로그아웃 중…'에 묶인다.
         * 나가는 길을 서버 사정으로 12초 막아 둘 이유가 없다.
         */
        timeoutMs: 3_000,
      },
    )
  } catch {
    // 서버 쪽 실패는 삼킨다. 아래에서 어차피 로컬 토큰을 지운다
  } finally {
    clearTokens()
  }
}
