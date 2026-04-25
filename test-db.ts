import { initializeApp } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const dbEmpty = getFirestore(app, "");
console.log("Empty string db:", dbEmpty);

