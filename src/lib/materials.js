import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
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
