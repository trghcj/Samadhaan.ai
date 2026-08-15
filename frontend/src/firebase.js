import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDgy4yehxx7l-_YT_F7GJD1vJ0E_JgqlRs",
  authDomain: "samadhaanai-40efc.firebaseapp.com",
  projectId: "samadhaanai-40efc",
  storageBucket: "samadhaanai-40efc.firebasestorage.app",
  messagingSenderId: "424056005718",
  appId: "1:424056005718:web:8abed0bc5c804d1eda47f7",
  measurementId: "G-M6NTTYHGBK"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
