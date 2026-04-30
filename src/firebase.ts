import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc, query, orderBy, limit, onSnapshot, getDocFromServer, where, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';
// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';
import { replacer } from './lib/json-utils';

// Set Firestore log level to avoid verbose offline warnings
setLogLevel('silent');

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  doc, setDoc, getDoc, getDocs, collection, addDoc, query, orderBy, limit, onSnapshot, getDocFromServer, where, deleteDoc, serverTimestamp
};


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  // Convert offline errors to simpler warnings so it doesn't crash apps aggressively
  if (errInfo.error.includes('the client is offline') || errInfo.error.includes('network-request-failed')) {
    console.warn('Firestore offline mode active or network request failed.');
    return; // Don't throw for offline/network errors to allow offline capabilities
  }
  
  console.error('Firestore Error: ', JSON.stringify(errInfo, replacer));
  throw new Error(JSON.stringify(errInfo, replacer));
}

// Test connection
async function testConnection() {
  try {
    // Attempt to get a non-existent doc from server to test connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful.");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline') || error.message.includes('network-request-failed')) {
        console.warn("Firestore: The client is offline or network request failed. The app will operate in offline mode if possible.");
      } else if (error.message.includes('permission-denied') || error.message.includes('Missing or insufficient permissions')) {
        // Permission denied is actually a good sign - it means we reached the server!
        console.log("Firestore connection reached server (Permission Denied as expected).");
      } else {
        console.warn("Firestore Connection Warning:", error.message);
      }
    }
  }
}
testConnection();

export { signInWithPopup, signOut, onAuthStateChanged };
export type { User };
