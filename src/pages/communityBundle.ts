/**
 * 커뮤니티 세 화면(목록·글 상세·글쓰기, 2026-11-04)을 한 묶음으로 내보낸다. App.tsx가 이 파일 하나를 lazy로 받는다 —
 * 따로 받으면 목록에서 글을 누를 때마다 묶음 왕복이 하나 더 끼었다(마이페이지 묶음과 같은 까닭, pages/mypageBundle.ts).
 */
export { default as CommunityPage } from './CommunityPage'
export { default as CommunityPostPage } from './CommunityPostPage'
export { default as CommunityWritePage } from './CommunityWritePage'
