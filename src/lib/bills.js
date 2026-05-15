import { db } from './firebase';
import {
  collection,
  addDoc,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const BILLS_COL = 'bills';

function getMonthRange(year, month) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
  };
}

export async function createBill(data) {
  const docRef = await addDoc(collection(db, BILLS_COL), {
    ...data,
    billing_date: data.billing_date || Timestamp.now(),
    status: data.status || 'unpaid',
    notes: data.notes || '',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  return docRef.id;
}

export async function getBill(id) {
  const snap = await getDoc(doc(db, BILLS_COL, id));

  if (!snap.exists()) {
    return null;
  }

  return { id: snap.id, ...snap.data() };
}

export async function updateBill(id, data) {
  await updateDoc(doc(db, BILLS_COL, id), {
    ...data,
    updated_at: serverTimestamp(),
  });
}

export async function deleteBill(id) {
  await deleteDoc(doc(db, BILLS_COL, id));
}

export async function getBillsByCompany(
  companyId,
  { pageSize = 20, lastDoc = null, statusFilter = null } = {}
) {
  let q = query(
    collection(db, BILLS_COL),
    where('company_id', '==', companyId),
    orderBy('billing_date', 'desc'),
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
    bills: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function getBillsByMonth(companyId, year, month) {
  const { start, end } = getMonthRange(year, month);

  const q = query(
    collection(db, BILLS_COL),
    where('company_id', '==', companyId),
    where('status', '==', 'paid'),
    where('billing_date', '>=', start),
    where('billing_date', '<', end),
    orderBy('billing_date', 'desc')
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getMonthlyIncomeSummary(companyId, monthsBack = 6) {
  const now = new Date();
  const summary = [];

  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth() + 1;
    const { start, end } = getMonthRange(year, month);

    const q = query(
      collection(db, BILLS_COL),
      where('company_id', '==', companyId),
      where('status', '==', 'paid'),
      where('billing_date', '>=', start),
      where('billing_date', '<', end),
      orderBy('billing_date', 'desc')
    );

    const snap = await getDocs(q);
    const bills = snap.docs.map((d) => d.data());
    const total = bills.reduce((acc, bill) => acc + (Number(bill.total) || 0), 0);

    summary.push({
      month,
      year,
      total,
      count: bills.length,
    });
  }

  return summary;
}
