import { initializeApp } from 'firebase/app';
import { getFirestore, doc } from 'firebase/firestore';

try {
  doc(undefined as any, "users", "123");
} catch (e: any) {
  console.log("Error in doc for undefined:", e.message);
}
