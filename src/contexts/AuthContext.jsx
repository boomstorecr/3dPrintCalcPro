import { createContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  EmailAuthProvider,
} from 'firebase/auth';
import { addDoc, collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import i18n from '../i18n';

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
  const [companyCurrency, setCompanyCurrency] = useState('USD');
  const [companyTaxRate, setCompanyTaxRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setCompanyCurrency('USD');
        setCompanyTaxRate(0);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const profile = userSnap.data();

          if (profile.company_id) {
            const companyRef = doc(db, 'companies', profile.company_id);
            const companySnap = await getDoc(companyRef);
            if (companySnap.exists()) {
              const companyData = companySnap.data();
              setCompanyCurrency(companyData.global_config?.currency || companyData.currency || 'USD');
              setCompanyTaxRate(companyData.global_config?.tax_rate || 0);
            } else {
              setCompanyTaxRate(0);
            }
          } else {
            setCompanyTaxRate(0);
          }

          setUserProfile({
            role: profile.role ?? null,
            company_id: profile.company_id ?? null,
            display_name: profile.display_name ?? null,
          });

          if (profile.language) {
            i18n.changeLanguage(profile.language);
          }
        } else {
          setUserProfile(null);
          setCompanyCurrency('USD');
          setCompanyTaxRate(0);
        }

        setUser(firebaseUser);
      } catch (error) {
        setUser(firebaseUser);
        setUserProfile(null);
        setCompanyTaxRate(0);
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

    try {
      const companyDoc = await addDoc(collection(db, 'companies'), {
        name: companyName,
        logo_url: '',
        global_config: DEFAULT_GLOBAL_CONFIG,
      });

      await setDoc(doc(db, 'users', credential.user.uid), {
        display_name: displayName,
        email,
        role: 'Admin',
        company_id: companyDoc.id,
        language: i18n.language,
      });

      setUserProfile({
        role: 'Admin',
        company_id: companyDoc.id,
        display_name: displayName,
      });
      setCompanyCurrency(DEFAULT_GLOBAL_CONFIG.currency);
      setCompanyTaxRate(0);
    } catch (error) {
      await credential.user.delete();
      throw error;
    }

    return credential;
  };

  const registerWorker = async (email, password, displayName, companyId) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    try {
      await setDoc(doc(db, 'users', credential.user.uid), {
        display_name: displayName,
        email,
        role: 'Worker',
        company_id: companyId,
        language: i18n.language,
      });

      setUserProfile({
        role: 'Worker',
        company_id: companyId,
        display_name: displayName,
      });
    } catch (error) {
      await credential.user.delete();
      throw error;
    }

    return credential;
  };

  const logout = () => {
    return signOut(auth);
  };

  const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  };

  const updateLanguage = async (lang) => {
    i18n.changeLanguage(lang);

    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { language: lang });
      } catch (error) {
        console.error('[AuthContext] Failed to save language preference:', error);
      }
    }
  };

  const value = useMemo(
    () => ({
      user,
      userProfile,
      companyCurrency,
      companyTaxRate,
      loading,
      login,
      register,
      registerWorker,
      logout,
      resetPassword,
      changePassword,
      updateLanguage,
    }),
    [user, userProfile, companyCurrency, companyTaxRate, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
