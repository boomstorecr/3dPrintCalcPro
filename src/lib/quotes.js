import { db } from './firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
} from 'firebase/firestore';

const QUOTES_COL = 'quotes';

export async function createQuote(data) {
  const docRef = await addDoc(collection(db, QUOTES_COL), {
    ...data,
    date: Timestamp.now(),
    status: data.status || 'draft',
  });

  return docRef.id;
}

export async function updateQuote(id, data) {
  await updateDoc(doc(db, QUOTES_COL, id), data);
}

export async function getQuote(id) {
  const snap = await getDoc(doc(db, QUOTES_COL, id));

  if (!snap.exists()) {
    return null;
  }

  return { id: snap.id, ...snap.data() };
}

export async function getQuotesByCompany(
  companyId,
  { pageSize = 20, lastDoc = null, statusFilter = null } = {}
) {
  let q = query(
    collection(db, QUOTES_COL),
    where('company_id', '==', companyId),
    orderBy('date', 'desc'),
    limit(pageSize)
  );

  if (statusFilter) {
    q = query(q, where('status', '==', statusFilter));
  }

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snap = await getDocs(q);

  return {
    quotes: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

export async function deleteQuote(id) {
  await deleteDoc(doc(db, QUOTES_COL, id));
}
