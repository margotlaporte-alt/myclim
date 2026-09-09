import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC9KKU9yB_otypQq7B6WdvS9TPNxrMd_1E",
  authDomain: "myclim-5b5e5.firebaseapp.com",
  projectId: "myclim-5b5e5",
  storageBucket: "myclim-5b5e5.firebasestorage.app",
  messagingSenderId: "393030012618",
  appId: "1:393030012618:web:b6c3b5545672f75d10ae33",
};

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_FUNCTIONS_REGION = "europe-west1";
export const STORAGE_UPLOAD_ENDPOINT = `https://${FIREBASE_FUNCTIONS_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net/uploadStorageFile`;

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
export const storage = getStorage(app);
storage.maxUploadRetryTime = 15000;
storage.maxOperationRetryTime = 10000;

const useEmulators =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  String(import.meta.env.VITE_USE_FIREBASE_EMULATORS || "").trim() === "true";

if (useEmulators && !globalThis.__myclimEmulatorsConnected) {
  globalThis.__myclimEmulatorsConnected = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  // eslint-disable-next-line no-console
  console.info("[MyCLIM] Connected to local Firebase emulators.");
}
