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
  const envKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const configKey = firebaseConfig.apiKey;
  const apiKey = envKey || configKey;

  console.log("Firebase Init: Checking API Key...", { envKeyPresent: !!envKey, configKeyPresent: !!configKey });

  if (!apiKey || apiKey === "") {
    console.error("CRITICAL: VITE_FIREBASE_API_KEY is missing. Application cannot proceed.");
  } else {
    app = initializeApp({
      ...firebaseConfig,
      apiKey: apiKey
    });
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    }, (firebaseConfig as any).firestoreDatabaseId);
    auth = getAuth(app);
    console.log("Firebase Init: Services initialized successfully.");
  }
} catch (error) {
  console.error("Firebase Init: Failed to initialize Firebase:", error);
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
