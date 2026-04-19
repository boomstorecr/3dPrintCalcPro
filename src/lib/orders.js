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
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const ORDERS_COL = 'orders';
const PUBLIC_ORDERS_COL = 'public_orders';

function getCryptoApi() {
  return typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
}

function generateUuidV4() {
  const cryptoApi = getCryptoApi();

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Absolute fallback for non-browser/non-webcrypto environments.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function generatePublicToken() {
  return generateUuidV4();
}

export function deriveOrderStatus(pieces) {
  if (!Array.isArray(pieces) || pieces.length === 0) return 'pending';

  const allCompleted = pieces.every((p) => p.status === 'completed');
  if (allCompleted) return 'completed';

  const anyActive = pieces.some((p) => p.status === 'in_progress' || p.status === 'completed');
  if (anyActive) return 'in_progress';

  return 'pending';
}

export function computeCompletionPercent(pieces) {
  if (!Array.isArray(pieces) || pieces.length === 0) return 0;

  const completed = pieces.filter((p) => p.status === 'completed').length;
  return Math.round((completed / pieces.length) * 100);
}

function buildPiecesFromQuote(quote) {
  const fileData = Array.isArray(quote?.file_data) ? quote.file_data : [];

  if (fileData.length > 0) {
    return fileData.map((file) => ({
      id: generateUuidV4(),
      name: file.fileName || file.name || 'File',
      status: 'pending',
      notes: '',
    }));
  }

  const materials = Array.isArray(quote?.materials) ? quote.materials : [];

  if (materials.length > 0) {
    return materials.map((material) => ({
      id: generateUuidV4(),
      name: material.materialName || material.name || 'Material',
      status: 'pending',
      notes: '',
    }));
  }

  return [
    {
      id: generateUuidV4(),
      name: `Order for ${quote?.client_name || 'Client'}`,
      status: 'pending',
      notes: '',
    },
  ];
}

export async function createOrderFromQuote(quote, companyId, companyData) {
  const pieces = buildPiecesFromQuote(quote);
  const publicToken = generatePublicToken();

  const batch = writeBatch(db);
  const orderRef = doc(collection(db, ORDERS_COL));
  const publicRef = doc(db, PUBLIC_ORDERS_COL, publicToken);

  batch.set(orderRef, {
    company_id: companyId,
    quote_id: quote.id,
    client_name: quote.client_name || '',
    public_token: publicToken,
    pieces,
    status: 'pending',
    completion_percent: 0,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  batch.set(publicRef, {
    order_id: orderRef.id,
    company_id: companyId,
    company_name: companyData?.name || '',
    company_logo_url: companyData?.logo_url || '',
    client_name: quote.client_name || '',
    pieces: pieces.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    status: 'pending',
    completion_percent: 0,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  await batch.commit();
  return orderRef.id;
}

export async function getOrder(id) {
  const snap = await getDoc(doc(db, ORDERS_COL, id));

  if (!snap.exists()) {
    return null;
  }

  return { id: snap.id, ...snap.data() };
}

export async function getOrdersByCompany(
  companyId,
  { pageSize = 20, lastDoc = null, statusFilter = null } = {}
) {
  let q = query(
    collection(db, ORDERS_COL),
    where('company_id', '==', companyId),
    orderBy('created_at', 'desc'),
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
    orders: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs[snap.docs.length - 1] || null,
  };
}

export async function getOrderByQuoteId(quoteId, companyId) {
  const q = query(
    collection(db, ORDERS_COL),
    where('quote_id', '==', quoteId),
    where('company_id', '==', companyId),
    limit(1)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    return null;
  }

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function updatePieceStatus(orderId, pieceId, newStatus) {
  const orderRef = doc(db, ORDERS_COL, orderId);
  const orderSnap = await getDoc(orderRef);

  if (!orderSnap.exists()) {
    throw new Error('Order not found');
  }

  const orderData = orderSnap.data();
  const pieces = (orderData.pieces || []).map((p) =>
    p.id === pieceId ? { ...p, status: newStatus } : p
  );

  const status = deriveOrderStatus(pieces);
  const completion_percent = computeCompletionPercent(pieces);

  const batch = writeBatch(db);
  batch.update(orderRef, {
    pieces,
    status,
    completion_percent,
    updated_at: serverTimestamp(),
  });

  if (orderData.public_token) {
    const publicRef = doc(db, PUBLIC_ORDERS_COL, orderData.public_token);
    batch.update(publicRef, {
      pieces: pieces.map((p) => ({ id: p.id, name: p.name, status: p.status })),
      status,
      completion_percent,
      updated_at: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function updatePieceNotes(orderId, pieceId, notes) {
  const orderRef = doc(db, ORDERS_COL, orderId);
  const orderSnap = await getDoc(orderRef);

  if (!orderSnap.exists()) {
    throw new Error('Order not found');
  }

  const orderData = orderSnap.data();
  const pieces = (orderData.pieces || []).map((p) =>
    p.id === pieceId ? { ...p, notes: notes || '' } : p
  );

  await updateDoc(orderRef, {
    pieces,
    updated_at: serverTimestamp(),
  });
}

export async function getPublicOrder(token) {
  const snap = await getDoc(doc(db, PUBLIC_ORDERS_COL, token));

  if (!snap.exists()) {
    return null;
  }

  return { token: snap.id, ...snap.data() };
}

export async function deleteOrder(orderId) {
  const orderRef = doc(db, ORDERS_COL, orderId);
  const orderSnap = await getDoc(orderRef);

  const batch = writeBatch(db);
  batch.delete(orderRef);

  if (orderSnap.exists()) {
    const publicToken = orderSnap.data().public_token;
    if (publicToken) {
      batch.delete(doc(db, PUBLIC_ORDERS_COL, publicToken));
    }
  }

  await batch.commit();
}
