import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// --- PASTE YOUR KEYS FROM FIREBASE CONSOLE HERE ---
const firebaseConfig = {
   apiKey: "AIzaSyDtAb7jGH5lkkEHNGsRozi1gP43v6gXMWA",
  authDomain: "dailytrack-31a45.firebaseapp.com",
  projectId: "dailytrack-31a45",
  storageBucket: "dailytrack-31a45.firebasestorage.app",
  messagingSenderId: "534286962990",
  appId: "1:534286962990:web:f6d195718c1c3b78762abf"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);