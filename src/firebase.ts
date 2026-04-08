import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Import the Firebase configuration
import firebaseConfig from '../firebase-applet-config.json';

let app;
let db: any;
let auth: any;
const googleProvider = new GoogleAuthProvider();

try {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey;
  if (!apiKey || apiKey === "") {
    console.warn("VITE_FIREBASE_API_KEY is missing. Firebase services will not be available.");
  } else {
    app = initializeApp({
      ...firebaseConfig,
      apiKey: apiKey
    });
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    }, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
}

export { db, auth, googleProvider };

// Auth functions
export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    console.error("Error signing in with Google:", error);
    // SEC-FIX: Use a generic error message to avoid exposing internals
    alert("Error de autenticación. Por favor, intenta de nuevo.");
    throw error;
  }
};
export const logout = () => signOut(auth);
