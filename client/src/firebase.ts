import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD8za8pGXJrP4NdKHJNhV1TtEvsriRnDiM",
  authDomain: "crypto-ai-chat-65135.firebaseapp.com",
  projectId: "crypto-ai-chat-65135",
  storageBucket: "crypto-ai-chat-65135.firebasestorage.app",
  messagingSenderId: "865350192351",
  appId: "1:865350192351:web:5e8742cc1bde5208ba2d6a",
  measurementId: "G-FF7T50941K"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
