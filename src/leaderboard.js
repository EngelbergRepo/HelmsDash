import { db } from './firebase.js';
import {
  collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp
} from 'firebase/firestore';

const COL = 'leaderboard';
const TOP_N = 10;

export async function submitScore(name, coins) {
  if (!name || coins <= 0) return;
  await addDoc(collection(db, COL), {
    name: name.slice(0, 20),
    score: Math.floor(coins),
    timestamp: serverTimestamp(),
  });
}

const PLACEHOLDER_SCORES = [
  { name: 'Aldric the Bold',    score: 142 },
  { name: 'Seraphine',          score: 131 },
  { name: 'Godfrey Ironhelm',   score: 118 },
  { name: 'Lysara',             score: 107 },
  { name: 'Brennan of Ashford', score:  94 },
  { name: 'Mireille',           score:  81 },
  { name: 'Oswin Blackthorn',   score:  68 },
  { name: 'Edric the Swift',    score:  55 },
  { name: 'Isolde',             score:  41 },
  { name: 'Wulfric',            score:  20 },
].map((s, i) => ({ rank: i + 1, ...s }));

export async function fetchTopScores() {
  const q = query(collection(db, COL), orderBy('score', 'desc'), limit(TOP_N));
  const snap = await getDocs(q);
  if (snap.empty) return PLACEHOLDER_SCORES;
  return snap.docs.map((d, i) => ({ rank: i + 1, ...d.data() }));
}
