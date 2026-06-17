import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC9KKU9yB_otypQq7B6WdvS9TPNxrMd_1E",
  authDomain: "myclim-5b5e5.firebaseapp.com",
  projectId: "myclim-5b5e5",
  storageBucket: "myclim-5b5e5.firebasestorage.app",
  messagingSenderId: "393030012618",
  appId: "1:393030012618:web:b6c3b5545672f75d10ae33",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function initializeFirebaseAuth(firebaseApp) {
  try {
    return initializeAuth(firebaseApp, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
    });
  } catch (error) {
    if (error?.code === "auth/already-initialized") {
      return getAuth(firebaseApp);
    }

    throw error;
  }
}

export const auth = initializeFirebaseAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");
