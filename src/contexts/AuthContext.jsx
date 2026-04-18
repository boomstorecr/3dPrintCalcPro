import { createContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export const AuthContext = createContext(null);

const DEFAULT_GLOBAL_CONFIG = {
  currency: 'USD',
  kwh_cost: 0.12,
  printer_wattage: 200,
  hourly_amortization_fee: 0.5,
  base_profit_margin: 0.3,
  failure_margin: 0.05,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const profile = userSnap.data();
          setUserProfile({
            role: profile.role ?? null,
            company_id: profile.company_id ?? null,
            display_name: profile.display_name ?? null,
          });
        } else {
          setUserProfile(null);
        }

        setUser(firebaseUser);
      } catch (error) {
        setUser(firebaseUser);
        setUserProfile(null);
        console.error('[AuthContext] Failed to fetch user profile:', error);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email, password, displayName, companyName) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const companyDoc = await addDoc(collection(db, 'companies'), {
      name: companyName,
      logo_url: '',
      global_config: DEFAULT_GLOBAL_CONFIG,
    });

    await setDoc(doc(db, 'users', credential.user.uid), {
      display_name: displayName,
      role: 'Admin',
      company_id: companyDoc.id,
    });

    return credential;
  };

  const registerWorker = async (email, password, displayName, companyId) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, 'users', credential.user.uid), {
      display_name: displayName,
      role: 'Worker',
      company_id: companyId,
    });

    return credential;
  };

  const logout = () => {
    return signOut(auth);
  };

  const value = useMemo(
    () => ({
      user,
      userProfile,
      loading,
      login,
      register,
      registerWorker,
      logout,
    }),
    [user, userProfile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
