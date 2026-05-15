import {
  addDoc,
  collection,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export async function getClients(companyId) {
  const clientsRef = collection(db, 'clients');
  const clientsQuery = query(clientsRef, where('company_id', '==', companyId));
  const snapshot = await getDocs(clientsQuery);

  return snapshot.docs.map((clientDoc) => ({
    id: clientDoc.id,
    ...clientDoc.data(),
  })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
}

export async function getClient(id, companyId = null) {
  let snapshot = null;

  if (companyId) {
    const clientsRef = collection(db, 'clients');
    const clientQuery = query(
      clientsRef,
      where('company_id', '==', companyId),
      where(documentId(), '==', id),
      limit(1)
    );
    const querySnapshot = await getDocs(clientQuery);
    snapshot = querySnapshot.docs[0] || null;
  } else {
    const clientRef = doc(db, 'clients', id);
    snapshot = await getDoc(clientRef);
  }

  if (!snapshot || !snapshot.exists()) {
    return null;
  }

  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

export async function addClient(companyId, data) {
  const clientData = {
    company_id: companyId,
    name: data.name,
    email: data.email ?? '',
    phone: data.phone ?? '',
    address: data.address ?? '',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  const clientRef = await addDoc(collection(db, 'clients'), clientData);

  return clientRef.id;
}

export async function updateClient(id, data) {
  const clientRef = doc(db, 'clients', id);
  return updateDoc(clientRef, {
    ...data,
    updated_at: serverTimestamp(),
  });
}

export async function deleteClient(id) {
  const clientRef = doc(db, 'clients', id);
  return deleteDoc(clientRef);
}

export async function searchClients(companyId, searchTerm) {
  const clients = await getClients(companyId);
  const normalizedTerm = (searchTerm || '').trim().toLowerCase();

  if (!normalizedTerm) {
    return clients;
  }

  return clients.filter((client) =>
    (client.name || '').toLowerCase().includes(normalizedTerm)
  );
}