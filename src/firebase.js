import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';

// 기존 플래너에서 쓰던 Firebase 프로젝트 설정 그대로
const firebaseConfig = {
  apiKey: 'AIzaSyBzuj1xwPPbSuyZUr7die9yBqUx698S8Ec',
  authDomain: 'daily-1e5f0.firebaseapp.com',
  projectId: 'daily-1e5f0',
  storageBucket: 'daily-1e5f0.firebasestorage.app',
  messagingSenderId: '489050715449',
  appId: '1:489050715449:web:636aea665c9f0bc095a4e8',
  measurementId: 'G-4MNG1LPKZ1'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 오프라인에서도 쓰고, 다시 연결되면 자동으로 올라가도록 기기 캐시 사용
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  firestore = getFirestore(app);
}
export const db = firestore;
