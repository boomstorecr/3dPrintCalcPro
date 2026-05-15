import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export async function getMaterials(companyId) {
  const materialsRef = collection(db, 'materials');
  const materialsQuery = query(materialsRef, where('company_id', '==', companyId));
  const snapshot = await getDocs(materialsQuery);

  return snapshot.docs.map((materialDoc) => ({
    id: materialDoc.id,
    ...materialDoc.data(),
  }));
}

export async function addMaterial(companyId, data) {
  return addDoc(collection(db, 'materials'), {
    stock_kg: 0,
    ...data,
    company_id: companyId,
  });
}

export async function updateMaterial(id, data) {
  const materialRef = doc(db, 'materials', id);
  return updateDoc(materialRef, data);
}

export async function deleteMaterial(id) {
  const materialRef = doc(db, 'materials', id);
  return deleteDoc(materialRef);
}

/**
 * Deduct material stock for an order.
 * @param {Array<{materialId: string, grams: number}>} consumptions
 * @returns {Promise<void>}
 */
export async function deductMaterialStock(consumptions) {
  if (!Array.isArray(consumptions) || consumptions.length === 0) return;

  const batch = writeBatch(db);

  for (const item of consumptions) {
    if (!item.materialId) continue;
    const materialRef = doc(db, 'materials', item.materialId);
    const snap = await getDoc(materialRef);
    if (!snap.exists()) continue;

    const currentStock = Number(snap.data().stock_kg) || 0;
    const deductKg = (Number(item.grams) || 0) / 1000;
    batch.update(materialRef, { stock_kg: Math.max(0, currentStock - deductKg) });
  }

  await batch.commit();
}

/**
 * Restore material stock when an order is cancelled.
 * @param {Array<{materialId: string, grams: number}>} consumptions
 * @returns {Promise<void>}
 */
export async function restoreMaterialStock(consumptions) {
  if (!Array.isArray(consumptions) || consumptions.length === 0) return;

  const batch = writeBatch(db);

  for (const item of consumptions) {
    if (!item.materialId) continue;
    const materialRef = doc(db, 'materials', item.materialId);
    const snap = await getDoc(materialRef);
    if (!snap.exists()) continue;

    const currentStock = Number(snap.data().stock_kg) || 0;
    const restoreKg = (Number(item.grams) || 0) / 1000;
    batch.update(materialRef, { stock_kg: currentStock + restoreKg });
  }

  await batch.commit();
}
