import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCjZY8qEkocg_4hU7mvJeHX5oYCOvcHuz0",
  authDomain: "wartelsuspas-app.firebaseapp.com",
  projectId: "wartelsuspas-app",
  storageBucket: "wartelsuspas-app.firebasestorage.app",
  messagingSenderId: "277645988562",
  appId: "1:277645988562:web:60811b9fc369cf9920d30b",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence)
  .catch((error) => console.error('Gagal mengatur persistensi:', error));

export default app;