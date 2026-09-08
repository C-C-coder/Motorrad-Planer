/**
 * firebaseConfig.js
 *
 * Zentrale Firebase-Initialisierung. Wird von allen Seiten der App
 * importiert, die auf Firestore oder Login zugreifen müssen.
 *
 * Nutzt die <script type="module">-CDN-Variante (kein npm/Build-
 * Prozess nötig), passend zum Rest des Projekts.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWDzbS0pfq6v2I1vvHRpGxYcOwx2dJ0pg",
  authDomain: "motorrad-planer.firebaseapp.com",
  projectId: "motorrad-planer",
  storageBucket: "motorrad-planer.firebasestorage.app",
  messagingSenderId: "101577998653",
  appId: "1:101577998653:web:ca6389015b18c637ac0554",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
