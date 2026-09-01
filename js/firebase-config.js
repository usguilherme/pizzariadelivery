// ============================================================================
// Módulo central de configuração do Firebase — Pizzaria Delivery
// ============================================================================
// As sintaxes `from "firebase/app"` / `from "firebase/firestore"` funcionam no
// navegador (sem bundler) graças ao <script type="importmap"> presente em
// index.html e admin.html, que mapeia esses specifiers para os módulos ESM
// hospedados em https://www.gstatic.com/firebasejs/.
// ----------------------------------------------------------------------------

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  doc,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
  runTransaction,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator,
} from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCD6cb5dZuqtTFyiM3PdWFtdXtYSnLAmJ4",
  authDomain: "pizzariadelivery-ad758.firebaseapp.com",
  projectId: "pizzariadelivery-ad758",
  storageBucket: "pizzariadelivery-ad758.firebasestorage.app",
  messagingSenderId: "1050391236091",
  appId: "1:1050391236091:web:4b8509162bb5ae09044f5e",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Conecta aos emuladores locais quando rodando em localhost com ?emu=1
// (ou automaticamente nas portas padrão do Firebase Hosting emulator).
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
if (isLocal && (location.port === "5000" || new URLSearchParams(location.search).has("emu"))) {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    console.info("[firebase] Conectado aos emuladores locais.");
  } catch (e) {
    console.warn("[firebase] Falha ao conectar emuladores:", e);
  }
}

// Re-exporta os helpers do SDK para que o restante do app importe tudo daqui.
export {
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  doc,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
  runTransaction,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
};
