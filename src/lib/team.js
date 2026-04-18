import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { db } from './firebase';

function generateCode() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export async function getTeamMembers(companyId) {
  if (!companyId) {
    return [];
  }

  const usersRef = collection(db, 'users');
  const membersQuery = query(usersRef, where('company_id', '==', companyId));
  const snapshot = await getDocs(membersQuery);

  return snapshot.docs
    .map((memberDoc) => ({
      id: memberDoc.id,
      ...memberDoc.data(),
    }))
    .sort((a, b) => {
      const aName = String(a.display_name || a.displayName || '').toLowerCase();
      const bName = String(b.display_name || b.displayName || '').toLowerCase();
      return aName.localeCompare(bName);
    });
}

export async function removeTeamMember(userId) {
  if (!userId) {
    throw new Error('userId is required to remove a team member');
  }

  await deleteDoc(doc(db, 'users', userId));
}

export async function createInvite(companyId) {
  if (!companyId) {
    throw new Error('companyId is required to create an invite');
  }

  const code = generateCode();
  const invitesRef = collection(db, 'companies', companyId, 'invites');

  await addDoc(invitesRef, {
    code,
    used: false,
    created_at: Timestamp.now(),
  });

  return code;
}

export async function getInvites(companyId) {
  if (!companyId) {
    return [];
  }

  const invitesRef = collection(db, 'companies', companyId, 'invites');
  const invitesQuery = query(invitesRef, orderBy('created_at', 'desc'));
  const snapshot = await getDocs(invitesQuery);

  return snapshot.docs.map((inviteDoc) => ({
    id: inviteDoc.id,
    ...inviteDoc.data(),
  }));
}

export async function deleteInvite(companyId, inviteId) {
  if (!companyId || !inviteId) {
    throw new Error('companyId and inviteId are required to delete an invite');
  }

  await deleteDoc(doc(db, 'companies', companyId, 'invites', inviteId));
}
