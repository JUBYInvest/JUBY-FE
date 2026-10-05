/**
 * 마이페이지 네 조각을 한 묶음으로 내보낸다. App.tsx가 이 파일 하나를 lazy로 받아
 * 껍데기와 안쪽 화면이 같은 묶음에 들어가게 한다 — 따로 받으면 왕복이 하나 더 생긴다.
 */
export { default as MypageLayout } from '../components/MypageLayout'
export { default as MypagePersonalityPage } from './MypagePersonalityPage'
export { default as MypageProfilePage } from './MypageProfilePage'
export { default as MypageLikesPage } from './MypageLikesPage'
