import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD3AQBWwwdseXqJaLj11ZSN1B8WY72e4hk",
  authDomain: "prod-software.firebaseapp.com",
  projectId: "prod-software",
  storageBucket: "prod-software.firebasestorage.app",
  messagingSenderId: "443396407758",
  appId: "1:443396407758:web:40bdecc144ddefcab3ab9f",
  measurementId: "G-D05EC10JEH",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence failed:", error);
});
