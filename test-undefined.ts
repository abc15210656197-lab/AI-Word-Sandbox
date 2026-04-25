import { initializeApp } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';

try {
  collection(undefined as any, "users");
} catch (e: any) {
  console.log("Error for undefined:", e.message);
}

try {
  collection({} as any, "users");
} catch (e: any) {
  console.log("Error for plain object:", e.message);
}
